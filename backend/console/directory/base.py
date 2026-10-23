"""What the console needs from an identity directory.

Two implementations share this interface:
- OCIDirectory (oci.py) talks to an OCI IAM identity domain over its SCIM REST API.
- DemoDirectory (demo.py) keeps sample data in memory, for local development.

Both return plain dicts in the shapes documented below, so the API views and the
frontend never see raw SCIM.

User:        {id, userName, displayName, givenName, familyName, email, title,
              active, federated, createdAt, updatedAt, groups?: [{id, displayName}]}
Group:       {id, displayName, description, memberCount, createdAt,
              members?: [{id, userName, displayName}]}
App:         {id, displayName, description, active, appType, clientId,
              homeUrl, createdAt, clientSecret?}
Credential:  {id, type, label, description, status, createdAt, expiresOn,
              fingerprint?, accessKey?, userName?, scopes?}
AdminRole:   {id, displayName, description,
              holders: [{grantId, type, id, display}]}
Grant:       {grantId, type, id, display}
Page:        {items: [...], total, start, count}
"""

# Credential types an identity domain user can hold. The keys are used in API URLs.
CREDENTIAL_TYPES = {
    "api_key": "API key",
    "auth_token": "Auth token",
    "customer_secret_key": "Customer secret key",
    "smtp": "SMTP credential",
    "oauth2": "OAuth 2.0 client credential",
}

# Application types the console can create. OCI supports many more (SAML, catalog
# apps, ...) and the console lists and manages all of them; it only creates these.
APP_TYPES = {
    "confidential": "Confidential application (server-side OAuth client)",
    "public": "Mobile / single-page application (public OAuth client)",
}


class DirectoryError(Exception):
    """The directory refused a request. `status` is the HTTP status to return."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


class DirectoryUnavailable(DirectoryError):
    """The directory couldn't be reached or rejected the console's own credentials."""

    def __init__(self, message):
        super().__init__(message, status=502)


class ReauthRequired(DirectoryError):
    """The signed-in admin's OCI session has ended; they must sign in again."""

    def __init__(self):
        super().__init__("Your OCI session has ended. Sign in again.", status=401)


class NotFound(DirectoryError):
    def __init__(self, what="Item"):
        super().__init__(f"{what} not found.", status=404)


class Directory:
    mode = ""  # "oci" or "demo"

    def describe(self):
        """{mode, domainUrl, authMode} for the console header."""
        raise NotImplementedError

    def overview(self):
        """Counts for the dashboard: {users, activeUsers, groups, apps, activeApps, admins}."""
        raise NotImplementedError

    # Users
    def list_users(self, query="", status="", start=1, count=25): raise NotImplementedError
    def get_user(self, user_id): raise NotImplementedError

    def find_user(self, user_name):
        """The User (with groups) whose userName matches, ignoring case, or None. Used at sign-in."""
        raise NotImplementedError

    def create_user(self, data): raise NotImplementedError
    def update_user(self, user_id, data): raise NotImplementedError
    def set_user_active(self, user_id, active): raise NotImplementedError
    def delete_user(self, user_id): raise NotImplementedError

    def reset_password(self, user_id, notify=True):
        """Email the user a reset link (notify=True), or return {"oneTimePassword": ...}."""
        raise NotImplementedError

    # Credentials
    def list_credentials(self, user_id): raise NotImplementedError

    def create_credential(self, user_id, cred_type, data):
        """Returns {"credential": Credential, "secret": str | None}. The secret is shown once."""
        raise NotImplementedError

    def delete_credential(self, cred_type, cred_id): raise NotImplementedError

    # Groups
    def list_groups(self, query="", start=1, count=25): raise NotImplementedError
    def get_group(self, group_id): raise NotImplementedError
    def create_group(self, data): raise NotImplementedError
    def update_group(self, group_id, data): raise NotImplementedError
    def delete_group(self, group_id): raise NotImplementedError
    def add_group_members(self, group_id, user_ids): raise NotImplementedError
    def remove_group_member(self, group_id, user_id): raise NotImplementedError

    # Integrated applications
    def list_apps(self, query="", start=1, count=25): raise NotImplementedError
    def get_app(self, app_id, reveal_secret=False):
        """reveal_secret=True adds clientSecret for confidential apps."""
        raise NotImplementedError

    def create_app(self, data): raise NotImplementedError
    def update_app(self, app_id, data): raise NotImplementedError
    def set_app_active(self, app_id, active): raise NotImplementedError
    def delete_app(self, app_id): raise NotImplementedError
    def list_app_grants(self, app_id): raise NotImplementedError
    def grant_app(self, app_id, grantee_type, grantee_id): raise NotImplementedError
    def revoke_grant(self, grant_id): raise NotImplementedError

    # Administrator roles
    def list_admin_roles(self): raise NotImplementedError
    def grant_admin_role(self, role_id, grantee_type, grantee_id): raise NotImplementedError
