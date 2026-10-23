import threading

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from .base import (
    APP_TYPES,
    CREDENTIAL_TYPES,
    DirectoryError,
    DirectoryUnavailable,
    NotFound,
    ReauthRequired,
)

__all__ = [
    "APP_TYPES", "CREDENTIAL_TYPES", "DirectoryError", "DirectoryUnavailable", "NotFound",
    "ReauthRequired", "app_directory", "get_directory", "reset_directory",
]

_directory = None
_lock = threading.Lock()


def _build():
    domain_url = settings.OCI_IDENTITY_DOMAIN_URL
    if not domain_url:
        from .demo import DemoDirectory
        return DemoDirectory()

    from .oci import ClientCredentialsAuth, OCIDirectory, api_key_auth

    domain_url = domain_url.rstrip("/")
    if settings.OCI_CLIENT_ID:
        if not settings.OCI_CLIENT_SECRET:
            raise ImproperlyConfigured("OCI_CLIENT_ID is set but OCI_CLIENT_SECRET isn't.")
        auth = ClientCredentialsAuth(domain_url, settings.OCI_CLIENT_ID, settings.OCI_CLIENT_SECRET)
        return OCIDirectory(domain_url, auth, "oauth")
    auth = api_key_auth(settings.OCI_CONFIG_FILE, settings.OCI_CONFIG_PROFILE)
    return OCIDirectory(domain_url, auth, "api_key")


def app_directory():
    """The directory as the console's own OCI app sees it (or the demo, without OCI)."""
    global _directory
    with _lock:
        if _directory is None:
            _directory = _build()
        return _directory


def get_directory(request=None):
    """The directory for this request.

    An admin who signed in with AD acts in OCI as themselves: OCI checks their own
    administrator roles and records them in its audit. Otherwise (demo data, a local
    emergency account, or CONSOLE_ACT_AS_USER=False) the console's own app is used.
    """
    directory = app_directory()
    if (
        request is not None
        and directory.mode == "oci"
        and settings.CONSOLE_ACT_AS_USER
        and request.session.get("auth_method") == "sso"
    ):
        from ..oci_tokens import UserTokenAuth
        from .oci import OCIDirectory

        return OCIDirectory(directory.domain_url, UserTokenAuth(request.session), "user",
                            acting_as=request.user.get_username())
    return directory


def reset_directory():
    """Forget the current directory (tests use this to start from fresh demo data)."""
    global _directory
    with _lock:
        _directory = None
