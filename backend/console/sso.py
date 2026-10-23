"""Console sign-in through the OCI identity domain (OpenID Connect, authorization code + PKCE).

Staff sign in with their Dash MFB (Active Directory) account at the identity domain's own
sign-in page; the console never sees their password. Whether the password is checked by
OCI or by AD (AD Bridge delegated authentication, or federation) is set up in OCI.

Access comes from identity domain groups (CONSOLE_STAFF_GROUPS / CONSOLE_SUPERUSER_GROUPS),
read fresh at every sign-in. The matching Django user is created or updated to match and
has no usable password, so it can only sign in this way.
"""

import base64
import hashlib
import json
import secrets
import time
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.shortcuts import redirect

from . import audit
from .directory import DirectoryError, get_directory

SCOPES = "openid profile email"
SESSION_KEY = "sso_pending"
CLOCK_SKEW = 120  # seconds of clock difference tolerated in ID token times


class SSOError(Exception):
    """Sign-in failed. `code` is shown to the sign-in page, which explains it."""

    def __init__(self, code):
        super().__init__(code)
        self.code = code


def client():
    """(client_id, client_secret) staff sign in through."""
    if settings.OCI_SSO_CLIENT_ID:
        return settings.OCI_SSO_CLIENT_ID, settings.OCI_SSO_CLIENT_SECRET
    return settings.OCI_CLIENT_ID, settings.OCI_CLIENT_SECRET


def enabled():
    return bool(settings.CONSOLE_SSO and settings.OCI_IDENTITY_DOMAIN_URL and client()[0])


def local_login_allowed():
    if settings.CONSOLE_LOCAL_LOGIN is not None:
        return settings.CONSOLE_LOCAL_LOGIN
    return not enabled()


def domain_url():
    return settings.OCI_IDENTITY_DOMAIN_URL.rstrip("/")


def public_url(request):
    return settings.CONSOLE_PUBLIC_URL or request.build_absolute_uri("/").rstrip("/")


def callback_url(request):
    return f"{public_url(request)}/api/auth/sso/callback/"


def safe_next(value):
    # Only paths on this site: "/users", never "//evil.example" or "https://...".
    if value and value.startswith("/") and not value.startswith("//") and "\\" not in value:
        return value
    return "/overview"


def _b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _claims(id_token):
    try:
        payload = id_token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (IndexError, ValueError):
        raise SSOError("invalid_token") from None


def start(request):
    """Send the browser to the identity domain's sign-in page."""
    verifier = secrets.token_urlsafe(48)
    pending = {
        "state": secrets.token_urlsafe(24),
        "nonce": secrets.token_urlsafe(24),
        "verifier": verifier,
        "next": safe_next(request.GET.get("next")),
    }
    request.session[SESSION_KEY] = pending
    params = {
        "client_id": client()[0],
        "response_type": "code",
        "redirect_uri": callback_url(request),
        "scope": SCOPES,
        "state": pending["state"],
        "nonce": pending["nonce"],
        "code_challenge": _b64url(hashlib.sha256(verifier.encode()).digest()),
        "code_challenge_method": "S256",
    }
    return redirect(f"{domain_url()}/oauth2/v1/authorize?{urlencode(params)}")


def exchange_code(request, code, pending):
    """Trade the authorization code for tokens and return (claims, id_token)."""
    try:
        response = requests.post(
            f"{domain_url()}/oauth2/v1/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": callback_url(request),
                "code_verifier": pending["verifier"],
            },
            auth=client(),
            timeout=20,
        )
    except requests.RequestException:
        raise SSOError("unreachable") from None
    if response.status_code != 200:
        raise SSOError("token_rejected")
    id_token = response.json().get("id_token")
    if not id_token:
        raise SSOError("invalid_token")

    # The token came straight from the domain's token endpoint over TLS, authenticated
    # with our client secret, so TLS stands in for the signature check (OpenID Connect
    # Core 3.1.3.7, step 6). The claims are still checked.
    claims = _claims(id_token)
    audience = claims.get("aud")
    audience = audience if isinstance(audience, list) else [audience]
    now = time.time()
    if (
        claims.get("iss") != settings.OCI_SSO_ISSUER
        or client()[0] not in audience
        or not secrets.compare_digest(str(claims.get("nonce", "")), pending["nonce"])
        or float(claims.get("exp", 0)) < now - CLOCK_SKEW
        or not claims.get("sub")
    ):
        raise SSOError("invalid_token")
    return claims, id_token


def roles_for(account):
    """(is_staff, is_superuser) from the user's identity domain groups."""
    groups = {g["displayName"].lower() for g in account.get("groups", [])}
    superuser = bool(groups & {g.lower() for g in settings.CONSOLE_SUPERUSER_GROUPS})
    staff = superuser or bool(groups & {g.lower() for g in settings.CONSOLE_STAFF_GROUPS})
    return staff, superuser


def sync_user(account, staff, superuser):
    """Create or update the Django user for this identity domain account."""
    User = get_user_model()
    user = User.objects.filter(username__iexact=account["userName"]).first()
    if user is None:
        user = User(username=account["userName"])
    elif user.has_usable_password():
        # A local (password) account already has this name. Don't take it over.
        raise SSOError("name_conflict")
    elif not user.is_active:
        # Suspended in the console (Console admins → Can sign in). That outranks OCI.
        raise SSOError("not_authorized")
    user.first_name = account["givenName"][:150]
    user.last_name = account["familyName"][:150]
    user.email = account["email"]
    user.is_active = account["active"]
    user.is_staff = staff
    user.is_superuser = superuser
    user.set_unusable_password()
    user.save()
    return user


def callback(request):
    """Finish sign-in. Always ends with a redirect: to `next`, or to /sign-in?error=<code>."""
    pending = request.session.pop(SESSION_KEY, None)
    try:
        if request.GET.get("error"):
            raise SSOError("cancelled")
        state = request.GET.get("state", "")
        if not pending or not secrets.compare_digest(state, pending["state"]):
            raise SSOError("expired")
        claims, id_token = exchange_code(request, request.GET.get("code", ""), pending)

        try:
            account = get_directory().find_user(claims["sub"])
        except DirectoryError:
            raise SSOError("unreachable") from None
        if account is None or not account["active"]:
            raise SSOError("not_authorized")

        staff, superuser = roles_for(account)
        if not staff:
            # Taken out of the console groups since their last visit: remove their access.
            # (Unusable passwords start with "!", so local accounts are left alone.)
            get_user_model().objects.filter(
                username__iexact=account["userName"], password__startswith="!"
            ).update(is_staff=False, is_superuser=False)
            raise SSOError("not_authorized")
        user = sync_user(account, staff, superuser)
    except SSOError as exc:
        return redirect(f"/sign-in?error={exc.code}")

    login(request, user, backend="links.backends.CaseInsensitiveModelBackend")
    request.session["auth_method"] = "sso"
    request.session["sso_id_token"] = id_token
    audit.record(request, "signed_in", "session", user.pk, user.get_username(), method="AD (OCI single sign-on)")
    return redirect(pending["next"])


def logout_url(request, id_token):
    """Where to send the browser to end the identity domain session too."""
    return f"{domain_url()}/oauth2/v1/userlogout?" + urlencode({
        "post_logout_redirect_uri": f"{public_url(request)}/",
        "id_token_hint": id_token,
    })
