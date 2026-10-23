"""OCI IAM identity domain, managed through its SCIM REST API (/admin/v1/...).

API reference: https://docs.oracle.com/en-us/iaas/api/#/en/identity-domains/v1/

The console signs in to the domain in one of two ways (see README, "Connecting to OCI"):
- OAuth client credentials of a confidential application (OCI_CLIENT_ID / OCI_CLIENT_SECRET)
- an OCI API key from an OCI config file (OCI_CONFIG_FILE / OCI_CONFIG_PROFILE)
"""

import threading
import time

import requests

from .base import (
    APP_TYPES,
    CREDENTIAL_TYPES,
    Directory,
    DirectoryError,
    DirectoryUnavailable,
)

SCIM = "urn:ietf:params:scim:schemas"
USER_SCHEMA = f"{SCIM}:core:2.0:User"
GROUP_SCHEMA = f"{SCIM}:core:2.0:Group"
GROUP_EXT = f"{SCIM}:oracle:idcs:extension:group:Group"
USER_EXT = f"{SCIM}:oracle:idcs:extension:user:User"
PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp"
APP_SCHEMA = f"{SCIM}:oracle:idcs:App"
GRANT_SCHEMA = f"{SCIM}:oracle:idcs:Grant"

# The identity domain's own application. Its admin app roles are the domain's
# administrator roles (Identity Domain Administrator, User Administrator, ...).
IDCS_APP_ID = "IDCSAppId"

# Per credential type: SCIM resource path, schema, and the response field that
# holds the secret (shown to the admin once, at creation).
CREDENTIALS = {
    "api_key": ("ApiKeys", f"{SCIM}:oracle:idcs:apikey", None),
    "auth_token": ("AuthTokens", f"{SCIM}:oracle:idcs:authToken", "token"),
    "customer_secret_key": ("CustomerSecretKeys", f"{SCIM}:oracle:idcs:customerSecretKey", "secretKey"),
    "smtp": ("SmtpCredentials", f"{SCIM}:oracle:idcs:smtpCredential", "password"),
    "oauth2": ("OAuth2ClientCredentials", f"{SCIM}:oracle:idcs:oauth2ClientCredential", "secret"),
}

APP_TEMPLATES = {
    "confidential": "CustomWebAppTemplateId",
    "public": "CustomBrowserMobileTemplateId",
}
TEMPLATE_LABELS = {
    "CustomWebAppTemplateId": "Confidential application",
    "CustomBrowserMobileTemplateId": "Mobile / single-page application",
    "CustomSAMLAppTemplateId": "SAML application",
    "CustomEnterpriseAppTemplateId": "Enterprise application",
}


def scim_string(value):
    """Quote a value for use inside a SCIM filter."""
    return '"' + str(value).replace("\\", "\\\\").replace('"', '\\"') + '"'


def patch(*operations):
    return {"schemas": [PATCH_SCHEMA], "Operations": list(operations)}


def replace(path, value):
    return {"op": "replace", "path": path, "value": value}


class ClientCredentialsAuth:
    """Bearer token from the domain's OAuth endpoint, cached until shortly before it expires."""

    def __init__(self, domain_url, client_id, client_secret):
        self.token_url = f"{domain_url}/oauth2/v1/token"
        self.credentials = (client_id, client_secret)
        self._token = None
        self._expires_at = 0
        self._lock = threading.Lock()

    def token(self):
        with self._lock:
            if self._token and time.time() < self._expires_at - 60:
                return self._token
            try:
                response = requests.post(
                    self.token_url,
                    data={"grant_type": "client_credentials", "scope": "urn:opc:idm:__myscopes__"},
                    auth=self.credentials,
                    timeout=20,
                )
            except requests.RequestException as exc:
                raise DirectoryUnavailable(f"Couldn't reach the identity domain: {exc}") from exc
            if response.status_code != 200:
                raise DirectoryUnavailable(
                    "The identity domain rejected the console's client ID and secret "
                    "(OCI_CLIENT_ID / OCI_CLIENT_SECRET)."
                )
            body = response.json()
            self._token = body["access_token"]
            self._expires_at = time.time() + int(body.get("expires_in", 3600))
            return self._token

    def __call__(self, request):
        request.headers["Authorization"] = f"Bearer {self.token()}"
        return request


def api_key_auth(config_file, profile):
    import oci  # Only needed for this sign-in method.

    config = oci.config.from_file(config_file, profile)
    return oci.signer.Signer(
        tenancy=config["tenancy"],
        user=config["user"],
        fingerprint=config["fingerprint"],
        private_key_file_location=config["key_file"],
        pass_phrase=config.get("pass_phrase"),
    )


class OCIDirectory(Directory):
    mode = "oci"

    def __init__(self, domain_url, auth, auth_mode):
        self.domain_url = domain_url.rstrip("/")
        self.auth = auth
        self.auth_mode = auth_mode
        self.session = requests.Session()

    # ---- HTTP ---------------------------------------------------------------

    def _request(self, method, path, *, params=None, json=None):
        try:
            response = self.session.request(
                method,
                f"{self.domain_url}/admin/v1/{path}",
                params=params,
                json=json,
                auth=self.auth,
                headers={"Accept": "application/scim+json, application/json"},
                timeout=30,
            )
        except requests.RequestException as exc:
            raise DirectoryUnavailable(f"Couldn't reach the identity domain: {exc}") from exc

        if response.status_code >= 400:
            try:
                detail = response.json().get("detail")
            except ValueError:
                detail = None
            if response.status_code == 401:
                raise DirectoryUnavailable("The identity domain rejected the console's credentials.")
            if response.status_code == 404:
                raise DirectoryError(detail or "Not found in the identity domain.", status=404)
            if response.status_code == 403:
                raise DirectoryError(
                    "The console's OCI credentials aren't allowed to do this. Grant its "
                    f"application the right administrator role. ({detail or 'Forbidden'})",
                    status=403,
                )
            raise DirectoryError(detail or f"Identity domain error ({response.status_code}).",
                                 status=409 if response.status_code == 409 else 400)
        return response.json() if response.content else None

    def _list(self, resource, *, filter=None, start=1, count=25, sort_by=None, **params):
        params.update({"startIndex": start, "count": count})
        if filter:
            params["filter"] = filter
        if sort_by:
            params["sortBy"] = sort_by
        return self._request("GET", resource, params=params)

    def _list_all(self, resource, *, filter=None, **params):
        start, items = 1, []
        while True:
            page = self._list(resource, filter=filter, start=start, count=1000, **params)
            resources = page.get("Resources", [])
            items.extend(resources)
            start += len(resources)
            if not resources or start > page.get("totalResults", 0):
                return items

    def _total(self, resource, filter=None):
        return self._list(resource, filter=filter, count=1).get("totalResults", 0)

    @staticmethod
    def _page(body, normalize, start, count):
        return {
            "items": [normalize(item) for item in body.get("Resources", [])],
            "total": body.get("totalResults", 0),
            "start": start,
            "count": count,
        }

    # ---- Summary ------------------------------------------------------------

    def describe(self):
        return {"mode": self.mode, "domainUrl": self.domain_url, "authMode": self.auth_mode}

    def overview(self):
        admins = {(h["type"], h["id"]) for role in self.list_admin_roles() for h in role["holders"]}
        return {
            "users": self._total("Users"),
            "activeUsers": self._total("Users", "active eq true"),
            "groups": self._total("Groups"),
            "apps": self._total("Apps"),
            "activeApps": self._total("Apps", "active eq true"),
            "admins": len(admins),
        }

    # ---- Users --------------------------------------------------------------

    @staticmethod
    def _user(r):
        name = r.get("name") or {}
        emails = r.get("emails") or []
        email = next((e for e in emails if e.get("primary")), emails[0] if emails else {})
        meta = r.get("meta") or {}
        user = {
            "id": r["id"],
            "userName": r.get("userName", ""),
            "displayName": r.get("displayName")
            or " ".join(filter(None, [name.get("givenName"), name.get("familyName")]))
            or r.get("userName", ""),
            "givenName": name.get("givenName", ""),
            "familyName": name.get("familyName", ""),
            "email": email.get("value", ""),
            "title": r.get("title", ""),
            "active": r.get("active", True),
            "federated": bool((r.get(USER_EXT) or {}).get("isFederatedUser")),
            "createdAt": meta.get("created"),
            "updatedAt": meta.get("lastModified"),
        }
        if "groups" in r:
            user["groups"] = [
                {"id": g.get("value"), "displayName": g.get("display", "")} for g in r["groups"]
            ]
        return user

    def list_users(self, query="", status="", start=1, count=25):
        filters = []
        if query:
            q = scim_string(query)
            filters.append(
                f"(userName co {q} or displayName co {q} or name.givenName co {q} "
                f"or name.familyName co {q} or emails.value co {q})"
            )
        if status in ("active", "inactive"):
            filters.append(f"active eq {'true' if status == 'active' else 'false'}")
        body = self._list("Users", filter=" and ".join(filters) or None,
                          start=start, count=count, sort_by="userName")
        return self._page(body, self._user, start, count)

    def get_user(self, user_id):
        return self._user(self._request("GET", f"Users/{user_id}", params={"attributeSets": "all"}))

    def find_user(self, user_name):
        # userName is case-insensitive in identity domains, so "eq" matches any case.
        body = self._list("Users", filter=f"userName eq {scim_string(user_name)}", count=1)
        resources = body.get("Resources", [])
        return self.get_user(resources[0]["id"]) if resources else None

    def create_user(self, data):
        body = {
            "schemas": [USER_SCHEMA],
            "userName": data["userName"],
            "name": {"givenName": data.get("givenName", ""), "familyName": data["familyName"]},
            "emails": [{"value": data["email"], "type": "work", "primary": True}],
            "active": data.get("active", True),
        }
        if data.get("title"):
            body["title"] = data["title"]
        return self._user(self._request("POST", "Users", json=body))

    def update_user(self, user_id, data):
        ops = []
        for field, path in [("givenName", "name.givenName"), ("familyName", "name.familyName"),
                            ("title", "title"), ("displayName", "displayName")]:
            if field in data:
                ops.append(replace(path, data[field]))
        if "email" in data:
            ops.append(replace("emails", [{"value": data["email"], "type": "work", "primary": True}]))
        if ops:
            self._request("PATCH", f"Users/{user_id}", json=patch(*ops))
        return self.get_user(user_id)

    def set_user_active(self, user_id, active):
        self._request("PUT", f"UserStatusChanger/{user_id}", json={
            "schemas": [f"{SCIM}:oracle:idcs:UserStatusChanger"],
            "active": active,
        })
        return self.get_user(user_id)

    def delete_user(self, user_id):
        self._request("DELETE", f"Users/{user_id}", params={"forceDelete": "true"})

    def reset_password(self, user_id, notify=True):
        body = {"schemas": [f"{SCIM}:oracle:idcs:UserPasswordResetter"], "bypassNotification": not notify}
        if not notify:
            body["userFlowControlledByExternalClient"] = True
        result = self._request("PUT", f"UserPasswordResetter/{user_id}", json=body) or {}
        return {"oneTimePassword": result.get("oneTimePassword")}

    # ---- Credentials --------------------------------------------------------

    @staticmethod
    def _credential(cred_type, r):
        meta = r.get("meta") or {}
        cred = {
            "id": r["id"],
            "type": cred_type,
            "label": CREDENTIAL_TYPES[cred_type],
            "description": r.get("description") or r.get("displayName") or r.get("name") or "",
            "status": r.get("status", "ACTIVE"),
            "createdAt": meta.get("created"),
            "expiresOn": r.get("expiresOn"),
        }
        for source, target in [("fingerprint", "fingerprint"), ("accessKey", "accessKey"),
                               ("userName", "userName")]:
            if r.get(source):
                cred[target] = r[source]
        if r.get("scopes"):
            cred["scopes"] = [f"{s.get('audience', '')}{s.get('scope', '')}" for s in r["scopes"]]
        return cred

    def list_credentials(self, user_id):
        user_filter = f"user.value eq {scim_string(user_id)}"
        creds = []
        for cred_type, (path, _, _) in CREDENTIALS.items():
            for item in self._list_all(path, filter=user_filter):
                creds.append(self._credential(cred_type, item))
        return creds

    def create_credential(self, user_id, cred_type, data):
        path, schema, secret_field = CREDENTIALS[cred_type]
        body = {"schemas": [schema], "user": {"value": user_id}}
        if data.get("description"):
            body["description"] = data["description"]
        if data.get("expiresOn") and cred_type != "api_key":
            body["expiresOn"] = data["expiresOn"]
        if cred_type == "api_key":
            body["key"] = data["key"]
        elif cred_type == "customer_secret_key":
            body["displayName"] = data.get("description") or "Customer secret key"
        elif cred_type == "oauth2":
            body["name"] = data["name"]
            body["scopes"] = [{"audience": s["audience"], "scope": s["scope"]} for s in data["scopes"]]
        result = self._request("POST", path, json=body)
        return {
            "credential": self._credential(cred_type, result),
            "secret": result.get(secret_field) if secret_field else None,
        }

    def delete_credential(self, cred_type, cred_id):
        path, _, _ = CREDENTIALS[cred_type]
        self._request("DELETE", f"{path}/{cred_id}", params={"forceDelete": "true"})

    # ---- Groups -------------------------------------------------------------

    @staticmethod
    def _group(r):
        meta = r.get("meta") or {}
        group = {
            "id": r["id"],
            "displayName": r.get("displayName", ""),
            "description": (r.get(GROUP_EXT) or {}).get("description", ""),
            "memberCount": len(r["members"]) if "members" in r else None,
            "createdAt": meta.get("created"),
        }
        if "members" in r:
            group["members"] = [
                {"id": m.get("value"), "userName": m.get("name", ""), "displayName": m.get("display", "")}
                for m in r["members"]
                if m.get("type", "User") == "User"
            ]
        return group

    def list_groups(self, query="", start=1, count=25):
        body = self._list(
            "Groups",
            filter=f"displayName co {scim_string(query)}" if query else None,
            start=start, count=count, sort_by="displayName",
            attributes=f"displayName,members,meta,{GROUP_EXT}:description",
        )
        page = self._page(body, self._group, start, count)
        for group in page["items"]:
            group.pop("members", None)  # counts only; the detail view loads members
        return page

    def get_group(self, group_id):
        return self._group(self._request("GET", f"Groups/{group_id}", params={"attributeSets": "all"}))

    def create_group(self, data):
        body = {
            "schemas": [GROUP_SCHEMA, GROUP_EXT],
            "displayName": data["displayName"],
            GROUP_EXT: {"description": data.get("description", "")},
        }
        return self._group(self._request("POST", "Groups", json=body))

    def update_group(self, group_id, data):
        ops = []
        if "displayName" in data:
            ops.append(replace("displayName", data["displayName"]))
        if "description" in data:
            ops.append(replace(f"{GROUP_EXT}:description", data["description"]))
        if ops:
            self._request("PATCH", f"Groups/{group_id}", json=patch(*ops))
        return self.get_group(group_id)

    def delete_group(self, group_id):
        self._request("DELETE", f"Groups/{group_id}", params={"forceDelete": "true"})

    def add_group_members(self, group_id, user_ids):
        self._request("PATCH", f"Groups/{group_id}", json=patch(
            {"op": "add", "path": "members", "value": [{"value": uid, "type": "User"} for uid in user_ids]}
        ))
        return self.get_group(group_id)

    def remove_group_member(self, group_id, user_id):
        self._request("PATCH", f"Groups/{group_id}", json=patch(
            {"op": "remove", "path": f"members[value eq {scim_string(user_id)}]"}
        ))
        return self.get_group(group_id)

    # ---- Integrated applications -------------------------------------------

    @staticmethod
    def _app(r):
        meta = r.get("meta") or {}
        template = (r.get("basedOnTemplate") or {}).get("value", "")
        app = {
            "id": r["id"],
            "displayName": r.get("displayName", ""),
            "description": r.get("description", ""),
            "active": r.get("active", False),
            "appType": TEMPLATE_LABELS.get(template, "Application"),
            "clientId": r.get("name", "") if r.get("isOAuthClient") else "",
            "homeUrl": r.get("landingPageUrl", ""),
            "redirectUris": r.get("redirectUris", []),
            "allowedGrants": r.get("allowedGrants", []),
            "oracleManaged": bool(r.get("isOPCService")),
            "createdAt": meta.get("created"),
        }
        if r.get("clientSecret"):
            app["clientSecret"] = r["clientSecret"]
        return app

    def list_apps(self, query="", start=1, count=25):
        body = self._list(
            "Apps",
            filter=f"displayName co {scim_string(query)}" if query else None,
            start=start, count=count, sort_by="displayName",
        )
        return self._page(body, self._app, start, count)

    def get_app(self, app_id, reveal_secret=False):
        app = self._app(self._request("GET", f"Apps/{app_id}"))
        if reveal_secret:
            secret = self._request("GET", f"Apps/{app_id}", params={"attributes": "clientSecret"})
            app["clientSecret"] = secret.get("clientSecret")
        return app

    def create_app(self, data):
        app_type = data.get("appType", "confidential")
        if app_type not in APP_TEMPLATES:
            raise DirectoryError(f"Choose one of: {', '.join(APP_TYPES)}.")
        body = {
            "schemas": [APP_SCHEMA],
            "basedOnTemplate": {"value": APP_TEMPLATES[app_type]},
            "displayName": data["displayName"],
            "description": data.get("description", ""),
            "isOAuthClient": True,
            "clientType": app_type,
            "allowedGrants": data.get("allowedGrants") or (
                ["client_credentials"] if app_type == "confidential" else ["authorization_code"]
            ),
            "active": data.get("active", True),
        }
        if data.get("redirectUris"):
            body["redirectUris"] = data["redirectUris"]
        if data.get("homeUrl"):
            body["landingPageUrl"] = data["homeUrl"]
        result = self._request("POST", "Apps", json=body)
        return self._app(result)

    def update_app(self, app_id, data):
        ops = []
        for field, path in [("displayName", "displayName"), ("description", "description"),
                            ("homeUrl", "landingPageUrl"), ("redirectUris", "redirectUris")]:
            if field in data:
                ops.append(replace(path, data[field]))
        if ops:
            self._request("PATCH", f"Apps/{app_id}", json=patch(*ops))
        return self.get_app(app_id)

    def set_app_active(self, app_id, active):
        self._request("PUT", f"AppStatusChanger/{app_id}", json={
            "schemas": [f"{SCIM}:oracle:idcs:AppStatusChanger"],
            "active": active,
        })
        return self.get_app(app_id)

    def delete_app(self, app_id):
        # OCI only deletes deactivated applications.
        if self.get_app(app_id)["active"]:
            self.set_app_active(app_id, False)
        self._request("DELETE", f"Apps/{app_id}", params={"forceDelete": "true"})

    @staticmethod
    def _grant(r):
        grantee = r.get("grantee") or {}
        return {
            "grantId": r["id"],
            "type": grantee.get("type", "User"),
            "id": grantee.get("value"),
            "display": grantee.get("display", ""),
        }

    def list_app_grants(self, app_id):
        grants = self._list_all("Grants", filter=f"app.value eq {scim_string(app_id)}")
        return [
            self._grant(g) for g in grants
            if not g.get("entitlement") and (g.get("grantee") or {}).get("type") in ("User", "Group")
        ]

    def _create_grant(self, app_id, grantee_type, grantee_id, entitlement=None):
        if grantee_type not in ("User", "Group"):
            raise DirectoryError("Grantee type must be User or Group.")
        body = {
            "schemas": [GRANT_SCHEMA],
            "grantMechanism": f"ADMINISTRATOR_TO_{grantee_type.upper()}",
            "grantee": {"type": grantee_type, "value": grantee_id},
            "app": {"value": app_id},
        }
        if entitlement:
            body["entitlement"] = entitlement
        return self._grant(self._request("POST", "Grants", json=body))

    def grant_app(self, app_id, grantee_type, grantee_id):
        return self._create_grant(app_id, grantee_type, grantee_id)

    def revoke_grant(self, grant_id):
        self._request("DELETE", f"Grants/{grant_id}")

    # ---- Administrator roles -----------------------------------------------

    def list_admin_roles(self):
        roles = [
            r for r in self._list_all("AppRoles", filter=f"app.value eq {scim_string(IDCS_APP_ID)}")
            if r.get("adminRole")
        ]
        holders = {}
        for grant in self._list_all("Grants", filter=f"app.value eq {scim_string(IDCS_APP_ID)}"):
            entitlement = grant.get("entitlement") or {}
            if entitlement.get("attributeName") == "appRoles":
                holders.setdefault(entitlement.get("attributeValue"), []).append(self._grant(grant))
        return sorted(
            (
                {
                    "id": r["id"],
                    "displayName": r.get("displayName", ""),
                    "description": r.get("description", ""),
                    "holders": holders.get(r["id"], []),
                }
                for r in roles
            ),
            key=lambda role: role["displayName"],
        )

    def grant_admin_role(self, role_id, grantee_type, grantee_id):
        return self._create_grant(
            IDCS_APP_ID, grantee_type, grantee_id,
            entitlement={"attributeName": "appRoles", "attributeValue": role_id},
        )

