"""The signed-in admin's own OCI tokens, so the console acts in OCI as that person.

After an AD sign-in, the identity domain issues an access token carrying the admin's own
administrator roles (scope urn:opc:idm:__myscopes__) and a refresh token. They are kept,
encrypted, in the admin's server-side session and renewed shortly before they expire. OCI
then decides what each admin may do, and OCI's audit shows the admin, not the console.
"""

import base64
import hashlib
import json
import threading
import time

import requests
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

from .directory.base import DirectoryUnavailable, ReauthRequired

SESSION_KEY = "oci_tokens"
RENEW_BEFORE = 60  # seconds before expiry that a token is renewed

# Several of an admin's requests can need a new token at once, and a refresh token may only
# work once. The first request renews it; the others reuse that result for a short while.
_refresh_lock = threading.Lock()
_recent_refreshes = {}  # sha256(refresh token) -> (new tokens, when)
REUSE_FOR = 120


def _fernet():
    # A key of its own, derived from SECRET_KEY, so session data in the database is unreadable.
    digest = hashlib.sha256(b"console.oci_tokens:" + settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _client():
    from .sso import client  # sso imports this module

    return client()


def token_url():
    return f"{settings.OCI_IDENTITY_DOMAIN_URL.rstrip('/')}/oauth2/v1/token"


def store(session, token_response):
    """Keep the tokens from an identity domain token response."""
    tokens = {
        "access_token": token_response["access_token"],
        "refresh_token": token_response.get("refresh_token"),
        "expires_at": time.time() + int(token_response.get("expires_in", 3600)),
    }
    session[SESSION_KEY] = _fernet().encrypt(json.dumps(tokens).encode()).decode()


def load(session):
    stored = session.get(SESSION_KEY)
    if not stored:
        return None
    try:
        return json.loads(_fernet().decrypt(stored.encode()))
    except (InvalidToken, ValueError):
        return None  # SECRET_KEY changed, or the value was tampered with


def _refresh(refresh_token):
    try:
        response = requests.post(
            token_url(),
            data={"grant_type": "refresh_token", "refresh_token": refresh_token},
            auth=_client(),
            timeout=20,
        )
    except requests.RequestException as exc:
        raise DirectoryUnavailable(f"Couldn't reach the identity domain: {exc}") from exc
    if response.status_code != 200:
        raise ReauthRequired()
    body = response.json()
    body.setdefault("refresh_token", refresh_token)  # the domain may keep the old one valid
    return body


def access_token(session):
    """A current access token for this admin, renewed if needed. Raises ReauthRequired."""
    tokens = load(session)
    if not tokens:
        raise ReauthRequired()
    if time.time() < tokens["expires_at"] - RENEW_BEFORE:
        return tokens["access_token"]
    if not tokens.get("refresh_token"):
        raise ReauthRequired()

    key = hashlib.sha256(tokens["refresh_token"].encode()).hexdigest()
    with _refresh_lock:
        now = time.time()
        for old_key, (_, when) in list(_recent_refreshes.items()):
            if now - when > REUSE_FOR:
                del _recent_refreshes[old_key]
        if key in _recent_refreshes:
            body = _recent_refreshes[key][0]
        else:
            body = _refresh(tokens["refresh_token"])
            _recent_refreshes[key] = (body, now)
    store(session, body)
    return body["access_token"]


class UserTokenAuth:
    """requests auth: calls the identity domain with the signed-in admin's own token."""

    def __init__(self, session):
        self.session = session

    def __call__(self, request):
        request.headers["Authorization"] = f"Bearer {access_token(self.session)}"
        return request
