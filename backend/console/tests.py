import base64
import json
import time
from unittest import mock
from urllib.parse import parse_qs, urlparse

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from links.models import AppLink, Category

from . import oci_tokens
from .directory import DirectoryError, get_directory, reset_directory
from .directory.demo import DemoDirectory
from .directory.oci import ClientCredentialsAuth, OCIDirectory, scim_string
from .models import AuditEvent

API = "/api/console"


class ConsoleTestCase(TestCase):
    def setUp(self):
        reset_directory()  # fresh demo data for every test
        User = get_user_model()
        self.admin = User.objects.create_user("admin", password="pw-admin-123", is_staff=True,
                                              is_superuser=True)
        self.client.force_login(self.admin)

    def first(self, resource, **params):
        return self.client.get(f"{API}/{resource}/", params).json()["items"][0]


class SignInTests(TestCase):
    def setUp(self):
        User = get_user_model()
        User.objects.create_user("alex", password="s3cret-pass", is_staff=True)
        User.objects.create_user("bola", password="s3cret-pass")  # not staff

    def login(self, username, password, ip="203.0.113.7"):
        return self.client.post("/api/auth/login/", {"username": username, "password": password},
                                content_type="application/json",
                                REMOTE_ADDR="127.0.0.1", HTTP_X_FORWARDED_FOR=ip)

    def test_session_is_empty_until_signed_in(self):
        response = self.client.get("/api/auth/session/")
        self.assertIsNone(response.json()["user"])
        self.assertIn("csrftoken", response.cookies)
        self.assertIn("no-store", response["Cache-Control"])

    def test_staff_sign_in_any_case(self):
        response = self.login("ALEX", "s3cret-pass")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["username"], "alex")
        self.assertEqual(self.client.get(f"{API}/status/").status_code, 200)

    def test_non_staff_and_wrong_password_get_the_same_message(self):
        for username, password in [("bola", "s3cret-pass"), ("alex", "wrong")]:
            with self.subTest(username=username):
                response = self.login(username, password)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["detail"], "Wrong username or password.")

    def test_lockout_applies_to_console_sign_in(self):
        for _ in range(5):
            self.login("alex", "wrong")
        self.assertEqual(self.login("alex", "s3cret-pass").status_code, 429)

    def test_console_needs_staff(self):
        self.assertEqual(self.client.get(f"{API}/users/").status_code, 403)
        self.client.force_login(get_user_model().objects.get(username="bola"))
        self.assertEqual(self.client.get(f"{API}/users/").status_code, 403)

    def test_writes_need_csrf_token(self):
        client = self.client_class(enforce_csrf_checks=True)
        client.force_login(get_user_model().objects.get(username="alex"))
        response = client.post(f"{API}/groups/", {"displayName": "X"}, content_type="application/json")
        self.assertEqual(response.status_code, 403)


class UserTests(ConsoleTestCase):
    def test_search_and_filter(self):
        page = self.client.get(f"{API}/users/", {"q": "okafor"}).json()
        self.assertEqual([u["userName"] for u in page["items"]], ["adaeze.okafor"])
        inactive = self.client.get(f"{API}/users/", {"status": "inactive"}).json()
        self.assertTrue(all(not u["active"] for u in inactive["items"]))

    def test_create_update_deactivate_delete(self):
        response = self.client.post(f"{API}/users/", {
            "userName": "new.user", "givenName": "New", "familyName": "User", "email": "new@example.com",
        }, content_type="application/json")
        self.assertEqual(response.status_code, 201)
        user_id = response.json()["id"]

        response = self.client.patch(f"{API}/users/{user_id}/", {"title": "Teller"},
                                     content_type="application/json")
        self.assertEqual(response.json()["title"], "Teller")

        response = self.client.post(f"{API}/users/{user_id}/deactivate/")
        self.assertFalse(response.json()["active"])

        self.assertEqual(self.client.delete(f"{API}/users/{user_id}/").status_code, 204)
        self.assertEqual(self.client.get(f"{API}/users/{user_id}/").status_code, 404)
        self.assertEqual(
            list(AuditEvent.objects.filter(target_id=user_id).values_list("action", flat=True)),
            ["deleted", "deactivated", "updated", "created"],
        )

    def test_duplicate_user_name_rejected(self):
        response = self.client.post(f"{API}/users/", {
            "userName": "ADAEZE.okafor", "familyName": "X", "email": "x@example.com",
        }, content_type="application/json")
        self.assertEqual(response.status_code, 409)

    def test_invalid_input_rejected(self):
        response = self.client.post(f"{API}/users/", {"userName": "has space", "email": "nope"},
                                    content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.json()), {"userName", "email", "familyName"})

    def test_reset_password(self):
        user = self.first("users")
        emailed = self.client.post(f"{API}/users/{user['id']}/reset-password/", {"notify": True},
                                   content_type="application/json").json()
        self.assertIsNone(emailed["oneTimePassword"])
        otp = self.client.post(f"{API}/users/{user['id']}/reset-password/", {"notify": False},
                               content_type="application/json").json()
        self.assertTrue(otp["oneTimePassword"])
        self.assertNotIn(otp["oneTimePassword"], str(list(AuditEvent.objects.values())))


class CredentialTests(ConsoleTestCase):
    def test_secret_shown_once_and_never_logged(self):
        user = self.first("users")
        url = f"{API}/users/{user['id']}/credentials/"
        response = self.client.post(url, {"type": "auth_token", "description": "Deploys"},
                                    content_type="application/json")
        self.assertEqual(response.status_code, 201)
        secret = response.json()["secret"]
        self.assertTrue(secret)

        listed = self.client.get(url).json()
        self.assertEqual([c["description"] for c in listed], ["Deploys"])
        self.assertNotIn(secret, str(listed))
        self.assertNotIn(secret, str(list(AuditEvent.objects.values())))

        cred = listed[0]
        self.assertEqual(self.client.delete(f"{url}{cred['type']}/{cred['id']}/").status_code, 204)
        self.assertEqual(self.client.get(url).json(), [])

    def test_api_key_needs_pem_and_oauth_needs_scopes(self):
        url = f"{API}/users/{self.first('users')['id']}/credentials/"
        response = self.client.post(url, {"type": "api_key", "key": "ssh-rsa AAA"},
                                    content_type="application/json")
        self.assertIn("key", response.json())
        response = self.client.post(url, {"type": "oauth2", "name": "ci"}, content_type="application/json")
        self.assertIn("scopes", response.json())
        response = self.client.post(url, {
            "type": "api_key", "key": "-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----",
        }, content_type="application/json")
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.json()["secret"])
        self.assertTrue(response.json()["credential"]["fingerprint"])


class GroupTests(ConsoleTestCase):
    def test_members(self):
        group = self.client.post(f"{API}/groups/", {"displayName": "Auditors"},
                                 content_type="application/json").json()
        user = self.first("users")
        response = self.client.post(f"{API}/groups/{group['id']}/members/", {"userIds": [user["id"]]},
                                    content_type="application/json")
        self.assertEqual([m["id"] for m in response.json()["members"]], [user["id"]])
        self.assertIn("Auditors", [g["displayName"] for g in
                                   self.client.get(f"{API}/users/{user['id']}/").json()["groups"]])
        response = self.client.delete(f"{API}/groups/{group['id']}/members/{user['id']}/")
        self.assertEqual(response.json()["members"], [])


class AppTests(ConsoleTestCase):
    def test_create_shows_secret_then_hides_it(self):
        response = self.client.post(f"{API}/apps/", {
            "displayName": "Teller API", "homeUrl": "http://teller:8080",
        }, content_type="application/json")
        self.assertEqual(response.status_code, 201)
        app = response.json()
        self.assertTrue(app["clientSecret"])
        self.assertNotIn("clientSecret", self.client.get(f"{API}/apps/{app['id']}/").json())
        revealed = self.client.post(f"{API}/apps/{app['id']}/secret/").json()
        self.assertEqual(revealed["clientSecret"], app["clientSecret"])
        self.assertTrue(AuditEvent.objects.filter(action="viewed_secret").exists())

    def test_grants_and_publish(self):
        app = self.first("apps", q="CoreBank")
        group = self.first("groups", q="Service Desk")
        grant = self.client.post(f"{API}/apps/{app['id']}/grants/", {"type": "Group", "id": group["id"]},
                                 content_type="application/json").json()
        grants = self.client.get(f"{API}/apps/{app['id']}/grants/").json()
        self.assertIn(grant["grantId"], [g["grantId"] for g in grants])
        again = self.client.post(f"{API}/apps/{app['id']}/grants/", {"type": "Group", "id": group["id"]},
                                 content_type="application/json")
        self.assertEqual(again.status_code, 409)
        self.client.delete(f"{API}/apps/{app['id']}/grants/{grant['grantId']}/")

        category = Category.objects.create(name="Core Banking")
        response = self.client.post(f"{API}/apps/{app['id']}/publish/", {"categoryId": category.pk},
                                    content_type="application/json")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(AppLink.objects.filter(name="CoreBank", url="https://corebank.example.com").exists())
        # Publishing again updates the same link.
        response = self.client.post(f"{API}/apps/{app['id']}/publish/", {"categoryId": category.pk},
                                    content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AppLink.objects.count(), 1)


class AdminRoleTests(ConsoleTestCase):
    def test_grant_and_revoke(self):
        roles = self.client.get(f"{API}/admin-roles/").json()
        role = next(r for r in roles if r["displayName"] == "Security Administrator")
        self.assertEqual(role["holders"], [])
        user = self.first("users")
        grant = self.client.post(f"{API}/admin-roles/{role['id']}/grants/", {"type": "User", "id": user["id"]},
                                 content_type="application/json").json()
        roles = self.client.get(f"{API}/admin-roles/").json()
        self.assertEqual(next(r for r in roles if r["id"] == role["id"])["holders"][0]["id"], user["id"])
        response = self.client.delete(f"{API}/admin-roles/{role['id']}/grants/{grant['grantId']}/")
        self.assertEqual(response.status_code, 204)
        event = AuditEvent.objects.get(action="revoked_role")
        self.assertEqual(event.target_label, "Security Administrator")


class ConsoleAdminTests(ConsoleTestCase):
    def test_only_superusers_manage_admins(self):
        staff = get_user_model().objects.create_user("staff", password="pw-staff-123", is_staff=True)
        self.client.force_login(staff)
        self.assertEqual(self.client.get(f"{API}/admins/").status_code, 403)

    def test_create_and_protect_self(self):
        response = self.client.post(f"{API}/admins/", {"username": "Tola", "password": "Strong-pass-2026"},
                                    content_type="application/json")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(get_user_model().objects.get(username="Tola").is_staff)
        response = self.client.post(f"{API}/admins/", {"username": "tola", "password": "Strong-pass-2026"},
                                    content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.delete(f"{API}/admins/{self.admin.pk}/").status_code, 400)
        response = self.client.patch(f"{API}/admins/{self.admin.pk}/", {"isActive": False},
                                     content_type="application/json")
        self.assertEqual(response.status_code, 400)

    def test_weak_password_rejected(self):
        response = self.client.post(f"{API}/admins/", {"username": "tola", "password": "123"},
                                    content_type="application/json")
        self.assertEqual(response.status_code, 400)


class LinkTests(ConsoleTestCase):
    def test_crud_and_protected_category(self):
        category = self.client.post(f"{API}/categories/", {"name": "IT"},
                                    content_type="application/json").json()
        response = self.client.post(f"{API}/links/", {
            "name": "Wiki", "url": "http://wiki", "category": category["id"], "tags": "docs",
        }, content_type="application/json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.client.get("/api/links/").json()[0]["links"][0]["name"], "Wiki")

        response = self.client.delete(f"{API}/categories/{category['id']}/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Move or delete", response.json()["detail"])

        response = self.client.post(f"{API}/links/", {
            "name": "Bad", "url": "javascript:alert(1)", "category": category["id"],
        }, content_type="application/json")
        self.assertEqual(response.status_code, 400)


class OverviewTests(ConsoleTestCase):
    def test_overview_counts(self):
        body = self.client.get(f"{API}/overview/").json()
        self.assertEqual(body["directory"]["users"], 12)
        self.assertEqual(body["directory"]["activeUsers"], 11)
        self.assertGreater(body["directory"]["admins"], 0)

    def test_overview_survives_directory_outage(self):
        with mock.patch.object(type(get_directory()), "overview",
                               side_effect=DirectoryError("down", status=502)):
            body = self.client.get(f"{API}/overview/").json()
        self.assertIsNone(body["directory"])
        self.assertEqual(body["directoryError"], "down")


def fake_response(status=200, json=None):
    response = mock.Mock(status_code=status, content=b"{}" if json is not None else b"")
    response.json.return_value = json if json is not None else {}
    return response


class OCIDirectoryTests(TestCase):
    def setUp(self):
        self.directory = OCIDirectory("https://idcs-abc.identity.oraclecloud.com/", auth=None, auth_mode="oauth")
        self.request = mock.patch.object(self.directory.session, "request").start()
        self.addCleanup(mock.patch.stopall)

    def sent(self):
        return self.request.call_args

    def test_filter_values_are_quoted(self):
        self.assertEqual(scim_string('a"b\\c'), '"a\\"b\\\\c"')
        self.request.return_value = fake_response(json={"Resources": [], "totalResults": 0})
        self.directory.list_users(query='x" or userName pr', status="active")
        params = self.sent().kwargs["params"]
        self.assertIn('userName co "x\\" or userName pr"', params["filter"])
        self.assertTrue(params["filter"].endswith("and active eq true"))
        self.assertEqual(self.sent().args[1], "https://idcs-abc.identity.oraclecloud.com/admin/v1/Users")

    def test_user_normalized(self):
        self.request.return_value = fake_response(json={
            "id": "u1", "userName": "ada", "name": {"givenName": "Ada", "familyName": "O"},
            "emails": [{"value": "home@x", "primary": False}, {"value": "work@x", "primary": True}],
            "groups": [{"value": "g1", "display": "IT"}],
            "urn:ietf:params:scim:schemas:oracle:idcs:extension:user:User": {"isFederatedUser": True},
        })
        user = self.directory.get_user("u1")
        self.assertEqual((user["displayName"], user["email"], user["federated"]), ("Ada O", "work@x", True))
        self.assertEqual(user["groups"], [{"id": "g1", "displayName": "IT"}])

    def test_empty_group_and_user_without_groups(self):
        # OCI leaves "members" / "groups" out entirely when there are none.
        self.request.return_value = fake_response(json={"id": "g1", "displayName": "New"})
        group = self.directory.get_group("g1")
        self.assertEqual((group["members"], group["memberCount"]), ([], 0))
        self.request.return_value = fake_response(json={"id": "u1", "userName": "ada"})
        self.assertEqual(self.directory.get_user("u1")["groups"], [])
        self.request.return_value = fake_response(json={"Resources": [{"id": "g1"}], "totalResults": 1})
        self.assertEqual(self.directory.list_groups()["items"][0]["memberCount"], 0)

    def test_blank_app_fields_not_sent_as_empty_strings(self):
        self.request.return_value = fake_response(json={"id": "a1", "displayName": "Teller API"})
        self.directory.create_app({"displayName": "Teller API", "description": "", "homeUrl": ""})
        body = self.request.call_args_list[0].kwargs["json"]
        self.assertNotIn("description", body)
        self.assertNotIn("landingPageUrl", body)
        self.request.reset_mock()
        self.directory.update_app("a1", {"description": "", "displayName": "Teller"})
        ops = self.request.call_args_list[0].kwargs["json"]["Operations"]
        self.assertIn({"op": "remove", "path": "description"}, ops)
        self.assertIn({"op": "replace", "path": "displayName", "value": "Teller"}, ops)

    def test_dropped_idle_connection_retried_for_safe_requests(self):
        import requests
        ok = fake_response(json={"id": "u1", "userName": "ada"})
        self.request.side_effect = [requests.ConnectionError("Connection reset"), ok]
        self.assertEqual(self.directory.get_user("u1")["id"], "u1")
        # A POST might already have been applied, so it isn't sent twice.
        self.request.reset_mock()
        self.request.side_effect = [requests.ConnectionError("Connection reset"), ok]
        with self.assertRaises(DirectoryError) as ctx:
            self.directory.create_group({"displayName": "X"})
        self.assertEqual((ctx.exception.status, self.request.call_count), (502, 1))
        # Timeouts aren't retried either: that would double the wait.
        self.request.reset_mock()
        self.request.side_effect = [requests.ConnectTimeout("slow"), ok]
        with self.assertRaises(DirectoryError):
            self.directory.get_user("u1")
        self.assertEqual(self.request.call_count, 1)

    def test_deactivate_uses_status_changer(self):
        self.request.return_value = fake_response(json={"id": "u1"})
        self.directory.set_user_active("u1", False)
        first = self.request.call_args_list[0]
        self.assertEqual(first.args[:2], ("PUT", f"{self.directory.domain_url}/admin/v1/UserStatusChanger/u1"))
        self.assertIs(first.kwargs["json"]["active"], False)

    def test_remove_member_patch(self):
        self.request.return_value = fake_response(json={"id": "g1", "members": []})
        self.directory.remove_group_member("g1", "u1")
        body = self.request.call_args_list[0].kwargs["json"]
        self.assertEqual(body["Operations"], [{"op": "remove", "path": 'members[value eq "u1"]'}])

    def test_credential_secret_returned(self):
        self.request.return_value = fake_response(json={"id": "c1", "token": "tok", "description": "d"})
        result = self.directory.create_credential("u1", "auth_token", {"description": "d"})
        self.assertEqual(result["secret"], "tok")
        body = self.sent().kwargs["json"]
        self.assertEqual(body["schemas"], ["urn:ietf:params:scim:schemas:oracle:idcs:authToken"])
        self.assertEqual(body["user"], {"value": "u1"})

    def test_admin_role_grant(self):
        self.request.return_value = fake_response(json={"id": "gr1", "grantee": {"type": "Group", "value": "g1"}})
        self.directory.grant_admin_role("role1", "Group", "g1")
        body = self.sent().kwargs["json"]
        self.assertEqual(body["grantMechanism"], "ADMINISTRATOR_TO_GROUP")
        self.assertEqual(body["app"], {"value": "IDCSAppId"})
        self.assertEqual(body["entitlement"], {"attributeName": "appRoles", "attributeValue": "role1"})

    def test_errors_mapped(self):
        for status, expected in [(404, 404), (403, 403), (409, 409), (400, 400), (401, 502)]:
            with self.subTest(status=status):
                self.request.return_value = fake_response(status, json={"detail": "nope"})
                with self.assertRaises(DirectoryError) as ctx:
                    self.directory.get_user("u1")
                self.assertEqual(ctx.exception.status, expected)


class ClientCredentialsAuthTests(TestCase):
    @mock.patch("console.directory.oci.requests.post")
    def test_token_cached(self, post):
        post.return_value = fake_response(json={"access_token": "abc", "expires_in": 3600})
        auth = ClientCredentialsAuth("https://idcs", "id", "secret")
        request = mock.Mock(headers={})
        auth(request)
        auth(request)
        self.assertEqual(request.headers["Authorization"], "Bearer abc")
        self.assertEqual(post.call_count, 1)
        self.assertEqual(post.call_args.kwargs["data"]["scope"], "urn:opc:idm:__myscopes__")


@override_settings(OCI_IDENTITY_DOMAIN_URL="https://idcs-abc.identity.oraclecloud.com",
                   OCI_CLIENT_ID="id", OCI_CLIENT_SECRET="secret")
class DirectoryFactoryTests(TestCase):
    def tearDown(self):
        reset_directory()

    def test_oci_used_when_configured(self):
        reset_directory()
        directory = get_directory()
        self.assertIsInstance(directory, OCIDirectory)
        self.assertEqual(directory.describe()["authMode"], "oauth")


def id_token(**claims):
    def part(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()
    return f"{part({'alg': 'RS256'})}.{part(claims)}.signature"


@override_settings(
    OCI_IDENTITY_DOMAIN_URL="https://idcs-abc.identity.oraclecloud.com",
    OCI_CLIENT_ID="console-client", OCI_CLIENT_SECRET="secret",
    CONSOLE_STAFF_GROUPS=["IT Administrators"], CONSOLE_SUPERUSER_GROUPS=["Compliance"],
    CONSOLE_LOCAL_LOGIN=None, CONSOLE_PUBLIC_URL="https://applications.example.com",
)
class SSOTestCase(TestCase):
    def setUp(self):
        self.directory = DemoDirectory()
        patcher = mock.patch("console.sso.app_directory", return_value=self.directory)
        patcher.start()
        self.post = mock.patch("console.sso.requests.post").start()
        self.addCleanup(mock.patch.stopall)

    def start(self, next_path="/users"):
        response = self.client.get("/api/auth/sso/start/", {"next": next_path})
        self.assertEqual(response.status_code, 302)
        location = urlparse(response["Location"])
        return {k: v[0] for k, v in parse_qs(location.query).items()}, location

    def finish(self, sub, *, state=None, nonce=None, **overrides):
        params, _ = self.start()
        claims = {
            "iss": "https://identity.oraclecloud.com/", "aud": ["console-client"],
            "sub": sub, "nonce": nonce or params["nonce"], "exp": time.time() + 300,
            **overrides,
        }
        self.post.return_value = fake_response(json={
            "id_token": id_token(**claims), "access_token": f"access-{sub}", "refresh_token": f"refresh-{sub}",
            "expires_in": 3600,
        })
        return self.client.get("/api/auth/sso/callback/", {"code": "abc", "state": state or params["state"]})

    def session_user(self):
        return self.client.get("/api/auth/session/").json()["user"]


class SSOTests(SSOTestCase):
    def test_start_sends_browser_to_domain_with_pkce(self):
        params, location = self.start()
        self.assertEqual(f"{location.scheme}://{location.netloc}{location.path}",
                         "https://idcs-abc.identity.oraclecloud.com/oauth2/v1/authorize")
        self.assertEqual(params["redirect_uri"], "https://applications.example.com/api/auth/sso/callback/")
        self.assertEqual(params["code_challenge_method"], "S256")
        self.assertEqual(params["client_id"], "console-client")
        self.assertIn("urn:opc:idm:__myscopes__", params["scope"].split())
        self.assertIn("offline_access", params["scope"].split())

    def test_group_member_signs_in(self):
        response = self.finish("ADAEZE.okafor")
        self.assertRedirects(response, "/users", fetch_redirect_response=False)
        user = self.session_user()
        self.assertEqual((user["username"], user["authMethod"], user["isSuperuser"]),
                         ("adaeze.okafor", "sso", False))
        account = get_user_model().objects.get(username="adaeze.okafor")
        self.assertFalse(account.has_usable_password())
        self.assertEqual(account.email, "adaeze.okafor@example.com")
        self.assertTrue(self.post.call_args.kwargs["data"]["code_verifier"])
        self.assertEqual(self.post.call_args.kwargs["auth"], ("console-client", "secret"))
        self.assertTrue(AuditEvent.objects.filter(action="signed_in", detail__method__startswith="AD").exists())

    def test_domain_url_accepted_as_issuer(self):
        response = self.finish("adaeze.okafor", iss="https://idcs-abc.identity.oraclecloud.com/")
        self.assertRedirects(response, "/users", fetch_redirect_response=False)

    def test_superuser_group(self):
        self.finish("ibrahim.musa")  # in Compliance
        self.assertTrue(self.session_user()["isSuperuser"])

    def test_not_in_a_console_group(self):
        response = self.finish("halima.bello")
        self.assertRedirects(response, "/sign-in?error=not_authorized", fetch_redirect_response=False)
        self.assertIsNone(self.session_user())
        self.assertFalse(get_user_model().objects.filter(username="halima.bello").exists())

    def test_removed_from_group_loses_access(self):
        self.finish("tunde.bakare")
        self.client.post("/api/auth/logout/")
        group = next(g for g in self.directory.groups.values() if g["displayName"] == "IT Administrators")
        group["members"].discard(self.directory.find_user("tunde.bakare")["id"])
        response = self.finish("tunde.bakare")
        self.assertRedirects(response, "/sign-in?error=not_authorized", fetch_redirect_response=False)
        self.assertFalse(get_user_model().objects.get(username="tunde.bakare").is_staff)

    def test_rejects_bad_state_nonce_audience_and_expiry(self):
        cases = [
            ({"state": "forged"}, "expired"),
            ({"nonce": "replayed"}, "invalid_token"),
            ({"aud": ["someone-else"]}, "invalid_token"),
            ({"iss": "https://evil.example/"}, "invalid_token"),
            ({"iss": "https://idcs-abc.identity.oraclecloud.com.evil.example/"}, "invalid_token"),
            ({"exp": time.time() - 3600}, "invalid_token"),
        ]
        for overrides, error in cases:
            with self.subTest(overrides=overrides):
                response = self.finish("adaeze.okafor", **overrides)
                self.assertRedirects(response, f"/sign-in?error={error}", fetch_redirect_response=False)
                self.assertIsNone(self.session_user())

    def test_token_endpoint_refusal(self):
        params, _ = self.start()
        self.post.return_value = fake_response(400, json={"error": "invalid_grant"})
        response = self.client.get("/api/auth/sso/callback/", {"code": "abc", "state": params["state"]})
        self.assertRedirects(response, "/sign-in?error=token_rejected", fetch_redirect_response=False)

    def test_will_not_take_over_local_account(self):
        get_user_model().objects.create_user("adaeze.okafor", password="local-pass-123", is_staff=True)
        response = self.finish("adaeze.okafor")
        self.assertRedirects(response, "/sign-in?error=name_conflict", fetch_redirect_response=False)

    def test_open_redirect_blocked(self):
        params, _ = self.start(next_path="//evil.example/")
        self.post.return_value = fake_response(json={"access_token": "a", "id_token": id_token(
            iss="https://identity.oraclecloud.com/", aud="console-client", sub="adaeze.okafor",
            nonce=params["nonce"], exp=time.time() + 300)})
        response = self.client.get("/api/auth/sso/callback/", {"code": "abc", "state": params["state"]})
        self.assertRedirects(response, "/overview", fetch_redirect_response=False)

    def test_password_sign_in_off_unless_allowed(self):
        get_user_model().objects.create_user("local", password="local-pass-123", is_staff=True)
        body = {"username": "local", "password": "local-pass-123"}
        self.assertEqual(self.client.get("/api/auth/session/").json()["signIn"], {"sso": True, "local": False})
        response = self.client.post("/api/auth/login/", body, content_type="application/json")
        self.assertEqual(response.status_code, 403)
        with override_settings(CONSOLE_LOCAL_LOGIN=True):
            response = self.client.post("/api/auth/login/", body, content_type="application/json")
            self.assertEqual(response.status_code, 200)

    def test_sign_out_ends_domain_session(self):
        self.finish("adaeze.okafor")
        url = self.client.post("/api/auth/logout/").json()["logoutUrl"]
        self.assertTrue(url.startswith("https://idcs-abc.identity.oraclecloud.com/oauth2/v1/userlogout?"))
        self.assertIn("post_logout_redirect_uri=https%3A%2F%2Fapplications.example.com%2F", url)
        self.assertIsNone(self.session_user())

    def test_ad_accounts_have_no_console_password(self):
        self.finish("ibrahim.musa")
        account = get_user_model().objects.get(username="ibrahim.musa")
        listed = self.client.get(f"{API}/admins/").json()
        self.assertEqual(next(a for a in listed if a["id"] == account.pk)["signInMethod"], "ad")
        response = self.client.patch(f"{API}/admins/{account.pk}/", {"password": "Strong-pass-2026"},
                                     content_type="application/json")
        self.assertEqual(response.status_code, 400)

    def test_console_suspension_outranks_ad(self):
        self.finish("adaeze.okafor")
        self.client.post("/api/auth/logout/")
        get_user_model().objects.filter(username="adaeze.okafor").update(is_active=False)
        response = self.finish("adaeze.okafor")
        self.assertRedirects(response, "/sign-in?error=not_authorized", fetch_redirect_response=False)
        self.assertFalse(get_user_model().objects.get(username="adaeze.okafor").is_active)



class ActAsAdminTests(SSOTestCase):
    """After an AD sign-in, the console calls OCI with the admin's own token."""

    def setUp(self):
        super().setUp()
        oci_tokens._recent_refreshes.clear()
        self.sent_auth = []

        def fake_request(session, method, url, auth=None, **kwargs):
            prepared = mock.Mock(headers={})
            auth(prepared)
            self.sent_auth.append(prepared.headers["Authorization"])
            return self.oci_response

        self.oci_response = fake_response(json={"Resources": [], "totalResults": 0})
        mock.patch("requests.Session.request", autospec=True, side_effect=fake_request).start()

    def expire_token(self):
        session = self.client.session
        tokens = oci_tokens.load(session)
        tokens["expires_at"] = time.time() - 10
        session[oci_tokens.SESSION_KEY] = oci_tokens._fernet().encrypt(json.dumps(tokens).encode()).decode()
        session.save()

    def test_calls_oci_as_the_admin(self):
        self.finish("adaeze.okafor")
        self.assertEqual(self.client.get(f"{API}/users/").status_code, 200)
        self.assertEqual(self.sent_auth, ["Bearer access-adaeze.okafor"])
        status = self.client.get(f"{API}/status/").json()
        self.assertEqual((status["authMode"], status["actingAs"]), ("user", "adaeze.okafor"))

    def test_tokens_encrypted_in_session(self):
        self.finish("adaeze.okafor")
        stored = self.client.session[oci_tokens.SESSION_KEY]
        self.assertNotIn("access-adaeze.okafor", stored)
        self.assertNotIn("refresh-adaeze.okafor", stored)

    def test_expired_token_renewed_once(self):
        self.finish("adaeze.okafor")
        self.expire_token()
        self.post.reset_mock()
        self.post.return_value = fake_response(json={"access_token": "renewed", "expires_in": 3600})
        self.client.get(f"{API}/users/")
        self.assertEqual(self.post.call_args.kwargs["data"],
                         {"grant_type": "refresh_token", "refresh_token": "refresh-adaeze.okafor"})
        self.assertEqual(self.sent_auth[-1], "Bearer renewed")
        # Another request with the same old refresh token reuses that renewal.
        oci_tokens.access_token({oci_tokens.SESSION_KEY: oci_tokens._fernet().encrypt(json.dumps(
            {"access_token": "old", "refresh_token": "refresh-adaeze.okafor", "expires_at": 0}).encode()).decode()})
        self.assertEqual(self.post.call_count, 1)

    def test_failed_renewal_signs_out(self):
        self.finish("adaeze.okafor")
        self.expire_token()
        self.post.return_value = fake_response(400, json={"error": "invalid_grant"})
        response = self.client.get(f"{API}/users/")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "reauth")
        self.assertIsNone(self.session_user())

    def test_admins_own_role_decides(self):
        self.finish("adaeze.okafor")
        self.oci_response = fake_response(403, json={"detail": "Not authorized"})
        response = self.client.post(f"{API}/groups/", {"displayName": "X"}, content_type="application/json")
        self.assertEqual(response.status_code, 403)
        self.assertIn("Your OCI administrator role doesn't allow this", response.json()["detail"])

    def test_overview_skips_what_the_role_cannot_see(self):
        self.finish("adaeze.okafor")
        self.oci_response = fake_response(403, json={"detail": "Not authorized"})
        body = self.client.get(f"{API}/overview/").json()
        self.assertIsNone(body["directoryError"])
        self.assertTrue(all(value is None for value in body["directory"].values()))

    def test_local_accounts_use_the_console_app(self):
        get_user_model().objects.create_user("local", password="local-pass-123", is_staff=True)
        with override_settings(CONSOLE_LOCAL_LOGIN=True):
            self.client.post("/api/auth/login/", {"username": "local", "password": "local-pass-123"},
                             content_type="application/json")
        with mock.patch("console.directory.oci.ClientCredentialsAuth.token", return_value="app-token"):
            self.client.get(f"{API}/users/")
        self.assertEqual(self.sent_auth, ["Bearer app-token"])

    @override_settings(CONSOLE_ACT_AS_USER=False)
    def test_can_be_turned_off(self):
        self.finish("adaeze.okafor")
        with mock.patch("console.directory.oci.ClientCredentialsAuth.token", return_value="app-token"):
            self.client.get(f"{API}/users/")
        self.assertEqual(self.sent_auth, ["Bearer app-token"])
