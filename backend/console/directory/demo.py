"""An in-memory stand-in for an OCI identity domain, used when OCI_IDENTITY_DOMAIN_URL isn't set.

It behaves like the real directory closely enough to develop and demo the console:
sample users, groups, applications, credentials and administrator roles. Changes
last until the Django process restarts. Every name and address is a placeholder.
"""

import copy
import secrets
import threading
import uuid
from datetime import datetime, timezone

from .base import APP_TYPES, CREDENTIAL_TYPES, Directory, DirectoryError, NotFound

# Real OCI identity domain administrator role names.
ADMIN_ROLES = [
    ("Identity Domain Administrator", "Full control of the identity domain, including other administrators."),
    ("Security Administrator", "Manages sign-on, password and MFA policies, and identity providers."),
    ("User Administrator", "Manages users and groups."),
    ("User Manager", "Manages users, but not groups."),
    ("Help Desk Administrator", "Unlocks users and resets passwords."),
    ("Application Administrator", "Manages integrated applications."),
    ("Audit Administrator", "Runs reports and reads the audit log."),
]

SAMPLE_USERS = [
    ("adaeze.okafor", "Adaeze", "Okafor", "Head of IT"),
    ("tunde.bakare", "Tunde", "Bakare", "Infrastructure Engineer"),
    ("chioma.eze", "Chioma", "Eze", "Service Desk Analyst"),
    ("ibrahim.musa", "Ibrahim", "Musa", "Compliance Officer"),
    ("funmi.adeyemi", "Funmi", "Adeyemi", "HR Business Partner"),
    ("emeka.nwosu", "Emeka", "Nwosu", "Credit Analyst"),
    ("halima.bello", "Halima", "Bello", "Teller"),
    ("segun.ogunleye", "Segun", "Ogunleye", "Payments Lead"),
    ("ngozi.obi", "Ngozi", "Obi", "Risk Analyst"),
    ("yusuf.danjuma", "Yusuf", "Danjuma", "Developer"),
    ("kemi.alade", "Kemi", "Alade", "Branch Manager"),
    ("david.etim", "David", "Etim", "Internal Auditor"),
]

SAMPLE_GROUPS = [
    ("IT Administrators", "Infrastructure and identity administrators.", [0, 1, 9]),
    ("Service Desk", "First-line support staff.", [2]),
    ("Compliance", "AML, KYC and regulatory reporting.", [3, 8, 11]),
    ("Branch Operations", "Tellers and branch managers.", [6, 10]),
    ("Credit", "Loan officers and credit analysts.", [5]),
]

SAMPLE_APPS = [
    ("CoreBank", "Core banking platform. Signs in with the identity domain.", "confidential",
     "https://corebank.example.com", True, [0, 3]),
    ("PeoplePortal", "HR self-service.", "confidential", "https://people.example.com", True, [3]),
    ("Mobile Banking API", "Backend for the customer mobile app.", "confidential", "", True, []),
    ("Field Agent App", "Tablet app for field loan officers.", "public", "", True, [4]),
    ("Legacy Reports", "Old reporting server, being retired.", "confidential",
     "https://reports.example.com", False, []),
]

TEMPLATE_LABELS = {
    "confidential": "Confidential application",
    "public": "Mobile / single-page application",
}


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id():
    return uuid.uuid4().hex


def paginate(items, start, count):
    return {"items": items[start - 1:start - 1 + count], "total": len(items), "start": start, "count": count}


class DemoDirectory(Directory):
    mode = "demo"

    def __init__(self):
        self._lock = threading.RLock()
        self.users, self.groups, self.apps = {}, {}, {}
        self.grants, self.credentials, self.roles = {}, {}, {}
        self._seed()

    def _seed(self):
        user_ids = []
        for user_name, given, family, title in SAMPLE_USERS:
            user = self.create_user({
                "userName": user_name, "givenName": given, "familyName": family,
                "email": f"{user_name}@example.com", "title": title,
            })
            user_ids.append(user["id"])
        self.users[user_ids[-1]]["active"] = False

        group_ids = []
        for name, description, members in SAMPLE_GROUPS:
            group = self.create_group({"displayName": name, "description": description})
            self.add_group_members(group["id"], [user_ids[i] for i in members])
            group_ids.append(group["id"])

        for name, description, app_type, home, active, granted_groups in SAMPLE_APPS:
            app = self.create_app({"displayName": name, "description": description,
                                   "appType": app_type, "homeUrl": home, "active": active})
            for i in granted_groups:
                self.grant_app(app["id"], "Group", group_ids[i])

        for name, description in ADMIN_ROLES:
            role_id = new_id()
            self.roles[role_id] = {"id": role_id, "displayName": name, "description": description}
        roles = {r["displayName"]: r["id"] for r in self.roles.values()}
        self.grant_admin_role(roles["Identity Domain Administrator"], "User", user_ids[0])
        self.grant_admin_role(roles["User Administrator"], "Group", group_ids[0])
        self.grant_admin_role(roles["Help Desk Administrator"], "Group", group_ids[1])
        self.grant_admin_role(roles["Audit Administrator"], "User", user_ids[11])

        self.create_credential(user_ids[9], "auth_token", {"description": "CI pipeline"})
        self.create_credential(user_ids[1], "customer_secret_key", {"description": "Backup bucket"})

    # ---- Helpers ------------------------------------------------------------

    def _get(self, store, item_id, what):
        try:
            return store[item_id]
        except KeyError:
            raise NotFound(what) from None

    @staticmethod
    def _matches(query, *values):
        query = query.lower()
        return not query or any(query in (v or "").lower() for v in values)

    def _display(self, grantee_type, grantee_id):
        if grantee_type == "User":
            return self._get(self.users, grantee_id, "User")["displayName"]
        return self._get(self.groups, grantee_id, "Group")["displayName"]

    # ---- Summary ------------------------------------------------------------

    def describe(self):
        return {"mode": self.mode, "domainUrl": None, "authMode": None}

    def overview(self):
        with self._lock:
            admins = {(g["type"], g["id"]) for g in self.grants.values() if g["roleId"]}
            return {
                "users": len(self.users),
                "activeUsers": sum(u["active"] for u in self.users.values()),
                "groups": len(self.groups),
                "apps": len(self.apps),
                "activeApps": sum(a["active"] for a in self.apps.values()),
                "admins": len(admins),
            }

    # ---- Users --------------------------------------------------------------

    def _user(self, user, detail=False):
        result = {k: v for k, v in user.items()}
        if detail:
            result["groups"] = sorted(
                ({"id": g["id"], "displayName": g["displayName"]}
                 for g in self.groups.values() if user["id"] in g["members"]),
                key=lambda g: g["displayName"],
            )
        return copy.deepcopy(result)

    def list_users(self, query="", status="", start=1, count=25):
        with self._lock:
            users = [
                self._user(u) for u in sorted(self.users.values(), key=lambda u: u["userName"])
                if self._matches(query, u["userName"], u["displayName"], u["email"])
                and (status != "active" or u["active"])
                and (status != "inactive" or not u["active"])
            ]
            return paginate(users, start, count)

    def get_user(self, user_id):
        with self._lock:
            return self._user(self._get(self.users, user_id, "User"), detail=True)

    def find_user(self, user_name):
        with self._lock:
            for user in self.users.values():
                if user["userName"].lower() == user_name.lower():
                    return self._user(user, detail=True)
            return None

    def create_user(self, data):
        with self._lock:
            if any(u["userName"].lower() == data["userName"].lower() for u in self.users.values()):
                raise DirectoryError(f"A user named {data['userName']} already exists.", status=409)
            user_id = new_id()
            self.users[user_id] = {
                "id": user_id,
                "userName": data["userName"],
                "displayName": f"{data.get('givenName', '')} {data['familyName']}".strip(),
                "givenName": data.get("givenName", ""),
                "familyName": data["familyName"],
                "email": data["email"],
                "title": data.get("title", ""),
                "active": data.get("active", True),
                "federated": False,
                "createdAt": now(),
                "updatedAt": now(),
            }
            return self._user(self.users[user_id])

    def update_user(self, user_id, data):
        with self._lock:
            user = self._get(self.users, user_id, "User")
            for field in ("givenName", "familyName", "title", "email", "displayName"):
                if field in data:
                    user[field] = data[field]
            if "displayName" not in data and ({"givenName", "familyName"} & data.keys()):
                user["displayName"] = f"{user['givenName']} {user['familyName']}".strip()
            user["updatedAt"] = now()
            return self.get_user(user_id)

    def set_user_active(self, user_id, active):
        with self._lock:
            user = self._get(self.users, user_id, "User")
            user["active"] = active
            user["updatedAt"] = now()
            return self.get_user(user_id)

    def delete_user(self, user_id):
        with self._lock:
            self._get(self.users, user_id, "User")
            del self.users[user_id]
            for group in self.groups.values():
                group["members"].discard(user_id)
            self.grants = {k: g for k, g in self.grants.items()
                           if not (g["type"] == "User" and g["id"] == user_id)}
            self.credentials = {k: c for k, c in self.credentials.items() if c["userId"] != user_id}

    def reset_password(self, user_id, notify=True):
        with self._lock:
            self._get(self.users, user_id, "User")
        return {"oneTimePassword": None if notify else secrets.token_urlsafe(9)}

    # ---- Credentials --------------------------------------------------------

    def list_credentials(self, user_id):
        with self._lock:
            self._get(self.users, user_id, "User")
            return [
                {k: v for k, v in c.items() if k != "userId"}
                for c in sorted(self.credentials.values(), key=lambda c: c["createdAt"])
                if c["userId"] == user_id
            ]

    def create_credential(self, user_id, cred_type, data):
        with self._lock:
            user = self._get(self.users, user_id, "User")
            cred_id = new_id()
            cred = {
                "id": cred_id,
                "type": cred_type,
                "label": CREDENTIAL_TYPES[cred_type],
                "description": data.get("description") or data.get("name") or "",
                "status": "ACTIVE",
                "createdAt": now(),
                "expiresOn": data.get("expiresOn") or None,
                "userId": user_id,
            }
            secret = secrets.token_urlsafe(24)
            if cred_type == "api_key":
                fingerprint = secrets.token_hex(16)
                cred["fingerprint"] = ":".join(fingerprint[i:i + 2] for i in range(0, 32, 2))
                secret = None  # the admin supplied the public key; there's nothing secret to show
            elif cred_type == "customer_secret_key":
                cred["accessKey"] = secrets.token_hex(20)
            elif cred_type == "smtp":
                cred["userName"] = f"ocid1.user.oc1..{user['userName']}@ocid1.tenancy.oc1..demo"
            elif cred_type == "oauth2":
                cred["scopes"] = [f"{s['audience']}{s['scope']}" for s in data["scopes"]]
            self.credentials[cred_id] = cred
            return {"credential": {k: v for k, v in cred.items() if k != "userId"}, "secret": secret}

    def delete_credential(self, cred_type, cred_id):
        with self._lock:
            cred = self._get(self.credentials, cred_id, "Credential")
            if cred["type"] != cred_type:
                raise NotFound("Credential")
            del self.credentials[cred_id]

    # ---- Groups -------------------------------------------------------------

    def _group(self, group, detail=False):
        result = {k: v for k, v in group.items() if k != "members"}
        result["memberCount"] = len(group["members"])
        if detail:
            result["members"] = sorted(
                ({"id": u, "userName": self.users[u]["userName"], "displayName": self.users[u]["displayName"]}
                 for u in group["members"]),
                key=lambda m: m["displayName"],
            )
        return copy.deepcopy(result)

    def list_groups(self, query="", start=1, count=25):
        with self._lock:
            groups = [
                self._group(g) for g in sorted(self.groups.values(), key=lambda g: g["displayName"])
                if self._matches(query, g["displayName"], g["description"])
            ]
            return paginate(groups, start, count)

    def get_group(self, group_id):
        with self._lock:
            return self._group(self._get(self.groups, group_id, "Group"), detail=True)

    def create_group(self, data):
        with self._lock:
            if any(g["displayName"].lower() == data["displayName"].lower() for g in self.groups.values()):
                raise DirectoryError(f"A group named {data['displayName']} already exists.", status=409)
            group_id = new_id()
            self.groups[group_id] = {
                "id": group_id,
                "displayName": data["displayName"],
                "description": data.get("description", ""),
                "createdAt": now(),
                "members": set(),
            }
            return self._group(self.groups[group_id])

    def update_group(self, group_id, data):
        with self._lock:
            group = self._get(self.groups, group_id, "Group")
            for field in ("displayName", "description"):
                if field in data:
                    group[field] = data[field]
            return self.get_group(group_id)

    def delete_group(self, group_id):
        with self._lock:
            self._get(self.groups, group_id, "Group")
            del self.groups[group_id]
            self.grants = {k: g for k, g in self.grants.items()
                           if not (g["type"] == "Group" and g["id"] == group_id)}

    def add_group_members(self, group_id, user_ids):
        with self._lock:
            group = self._get(self.groups, group_id, "Group")
            for user_id in user_ids:
                self._get(self.users, user_id, "User")
            group["members"].update(user_ids)
            return self.get_group(group_id)

    def remove_group_member(self, group_id, user_id):
        with self._lock:
            self._get(self.groups, group_id, "Group")["members"].discard(user_id)
            return self.get_group(group_id)

    # ---- Integrated applications -------------------------------------------

    def _app(self, app, reveal_secret=False):
        result = {k: v for k, v in app.items() if k != "clientSecret"}
        if reveal_secret and app["clientSecret"]:
            result["clientSecret"] = app["clientSecret"]
        return copy.deepcopy(result)

    def list_apps(self, query="", start=1, count=25):
        with self._lock:
            apps = [
                self._app(a) for a in sorted(self.apps.values(), key=lambda a: a["displayName"])
                if self._matches(query, a["displayName"], a["description"])
            ]
            return paginate(apps, start, count)

    def get_app(self, app_id, reveal_secret=False):
        with self._lock:
            return self._app(self._get(self.apps, app_id, "Application"), reveal_secret)

    def create_app(self, data):
        app_type = data.get("appType", "confidential")
        if app_type not in APP_TYPES:
            raise DirectoryError(f"Choose one of: {', '.join(APP_TYPES)}.")
        with self._lock:
            app_id = new_id()
            self.apps[app_id] = {
                "id": app_id,
                "displayName": data["displayName"],
                "description": data.get("description", ""),
                "active": data.get("active", True),
                "appType": TEMPLATE_LABELS[app_type],
                "clientId": secrets.token_hex(16),
                "clientSecret": f"idcscs-{uuid.uuid4()}" if app_type == "confidential" else "",
                "homeUrl": data.get("homeUrl", ""),
                "redirectUris": data.get("redirectUris", []),
                "allowedGrants": data.get("allowedGrants") or (
                    ["client_credentials"] if app_type == "confidential" else ["authorization_code"]
                ),
                "oracleManaged": False,
                "createdAt": now(),
            }
            return self._app(self.apps[app_id])

    def update_app(self, app_id, data):
        with self._lock:
            app = self._get(self.apps, app_id, "Application")
            for field in ("displayName", "description", "homeUrl", "redirectUris"):
                if field in data:
                    app[field] = data[field]
            return self._app(app)

    def set_app_active(self, app_id, active):
        with self._lock:
            app = self._get(self.apps, app_id, "Application")
            app["active"] = active
            return self._app(app)

    def delete_app(self, app_id):
        with self._lock:
            self._get(self.apps, app_id, "Application")
            del self.apps[app_id]
            self.grants = {k: g for k, g in self.grants.items() if g["appId"] != app_id}

    def _create_grant(self, app_id, grantee_type, grantee_id, role_id=None):
        if grantee_type not in ("User", "Group"):
            raise DirectoryError("Grantee type must be User or Group.")
        with self._lock:
            display = self._display(grantee_type, grantee_id)
            for grant in self.grants.values():
                if (grant["appId"], grant["roleId"], grant["type"], grant["id"]) == (
                    app_id, role_id, grantee_type, grantee_id
                ):
                    raise DirectoryError(f"{display} already has this access.", status=409)
            grant_id = new_id()
            self.grants[grant_id] = {
                "grantId": grant_id, "appId": app_id, "roleId": role_id,
                "type": grantee_type, "id": grantee_id,
            }
            return {"grantId": grant_id, "type": grantee_type, "id": grantee_id, "display": display}

    def _grants(self, **match):
        return [
            {"grantId": g["grantId"], "type": g["type"], "id": g["id"],
             "display": self._display(g["type"], g["id"])}
            for g in self.grants.values()
            if all(g[k] == v for k, v in match.items())
        ]

    def list_app_grants(self, app_id):
        with self._lock:
            self._get(self.apps, app_id, "Application")
            return self._grants(appId=app_id, roleId=None)

    def grant_app(self, app_id, grantee_type, grantee_id):
        with self._lock:
            self._get(self.apps, app_id, "Application")
            return self._create_grant(app_id, grantee_type, grantee_id)

    def revoke_grant(self, grant_id):
        with self._lock:
            self._get(self.grants, grant_id, "Grant")
            del self.grants[grant_id]

    # ---- Administrator roles -----------------------------------------------

    def list_admin_roles(self):
        with self._lock:
            return sorted(
                ({**role, "holders": self._grants(roleId=role["id"])} for role in self.roles.values()),
                key=lambda role: role["displayName"],
            )

    def grant_admin_role(self, role_id, grantee_type, grantee_id):
        with self._lock:
            self._get(self.roles, role_id, "Administrator role")
            return self._create_grant("IDCSAppId", grantee_type, grantee_id, role_id=role_id)
