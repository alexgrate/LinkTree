from django.contrib.auth import authenticate as django_authenticate
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import RequestFactory, TestCase

from .client_ip import client_ip
from .models import AppLink, Category


def authenticate(**credentials):
    # django-axes needs the request to know who is logging in.
    return django_authenticate(RequestFactory().post("/admin/login/"), **credentials)


class CaseInsensitiveLoginTests(TestCase):
    def setUp(self):
        get_user_model().objects.create_user(username="alex", password="s3cret-pass")

    def test_any_case_logs_in(self):
        for username in ["alex", "Alex", "ALEX"]:
            with self.subTest(username=username):
                self.assertIsNotNone(authenticate(username=username, password="s3cret-pass"))

    def test_wrong_password_rejected(self):
        self.assertIsNone(authenticate(username="Alex", password="wrong"))

    def test_unknown_user_rejected(self):
        self.assertIsNone(authenticate(username="nobody", password="s3cret-pass"))

    def test_inactive_user_rejected(self):
        get_user_model().objects.filter(username="alex").update(is_active=False)
        self.assertIsNone(authenticate(username="alex", password="s3cret-pass"))

    def test_ambiguous_usernames_rejected(self):
        get_user_model().objects.create_user(username="Alex", password="s3cret-pass")
        self.assertIsNone(authenticate(username="ALEX", password="s3cret-pass"))

    def test_admin_login_page_accepts_other_case(self):
        # Only staff can use the admin login.
        get_user_model().objects.filter(username="alex").update(is_staff=True)
        response = self.client.post(
            "/admin/login/?next=/admin/",
            {"username": "ALEX", "password": "s3cret-pass"},
        )
        self.assertRedirects(response, "/admin/", fetch_redirect_response=False)


class IntranetURLTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name="C")

    def link(self, url):
        return AppLink(category=self.category, name="App", url=url)

    def test_accepts_internal_and_public_addresses(self):
        for url in [
            "http://corebank:8080/login",
            "http://corebank",
            "https://intranet.local/app",
            "https://10.0.0.5:8443/",
            "https://helpdesk.dash-mfb.com/tickets?open=1",
            "http://localhost:3000",
        ]:
            with self.subTest(url=url):
                self.link(url).full_clean()

    def test_rejects_unsafe_or_malformed_addresses(self):
        for url in [
            "javascript:alert(1)",
            "ftp://files.example.com",
            "corebank",
            "http://",
            "http://core bank",
            "http://-corebank",
        ]:
            with self.subTest(url=url), self.assertRaises(ValidationError):
                self.link(url).full_clean()

    def test_admin_form_accepts_single_word_host(self):
        admin = get_user_model().objects.create_superuser("admin", "a@example.com", "pw-admin-123")
        self.client.force_login(admin)
        response = self.client.post("/admin/links/applink/add/", {
            "name": "CoreBank", "url": "http://corebank:8080", "category": self.category.pk,
            "environment": "PROD", "order": 0, "is_active": "on",
        })
        self.assertEqual(response.status_code, 302)
        self.assertTrue(AppLink.objects.filter(url="http://corebank:8080").exists())


class LoginLockoutTests(TestCase):
    LOGIN = "/admin/login/?next=/admin/"

    def setUp(self):
        get_user_model().objects.create_user(username="alex", password="s3cret-pass", is_staff=True)

    def attempt(self, password, ip="203.0.113.7"):
        # Requests arrive from IIS on 127.0.0.1 with the visitor's IP appended by ARR.
        return self.client.post(
            self.LOGIN,
            {"username": "alex", "password": password},
            REMOTE_ADDR="127.0.0.1",
            HTTP_X_FORWARDED_FOR=f"{ip}:51234",
        )

    def test_five_wrong_passwords_lock_out_that_ip(self):
        for _ in range(4):
            self.assertEqual(self.attempt("wrong").status_code, 200)  # form shown again
        self.assertEqual(self.attempt("wrong").status_code, 429)
        # Even the right password is refused while locked out.
        self.assertEqual(self.attempt("s3cret-pass").status_code, 429)

    def test_other_ips_are_not_locked_out(self):
        for _ in range(5):
            self.attempt("wrong", ip="203.0.113.7")
        response = self.attempt("s3cret-pass", ip="198.51.100.20")
        self.assertRedirects(response, "/admin/", fetch_redirect_response=False)

    def test_faked_forwarded_header_does_not_dodge_lockout(self):
        for i in range(5):
            self.client.post(
                self.LOGIN,
                {"username": "alex", "password": "wrong"},
                REMOTE_ADDR="127.0.0.1",
                HTTP_X_FORWARDED_FOR=f"10.0.0.{i}, 203.0.113.7:51234",
            )
        self.assertEqual(self.attempt("s3cret-pass").status_code, 429)

    def test_successful_login_resets_the_count(self):
        for _ in range(4):
            self.attempt("wrong")
        self.attempt("s3cret-pass")
        self.client.logout()
        for _ in range(4):
            self.assertEqual(self.attempt("wrong").status_code, 200)


class ClientIPTests(TestCase):
    def ip(self, remote, forwarded=None):
        request = RequestFactory().get("/", REMOTE_ADDR=remote)
        if forwarded is not None:
            request.META["HTTP_X_FORWARDED_FOR"] = forwarded
        return client_ip(request)

    def test_reads_last_forwarded_entry_from_iis(self):
        self.assertEqual(self.ip("127.0.0.1", "203.0.113.7:51234"), "203.0.113.7")
        self.assertEqual(self.ip("127.0.0.1", "203.0.113.7"), "203.0.113.7")
        self.assertEqual(self.ip("127.0.0.1", "1.2.3.4, 203.0.113.7:51234"), "203.0.113.7")
        self.assertEqual(self.ip("127.0.0.1", "[2001:db8::1]:51234"), "2001:db8::1")
        self.assertEqual(self.ip("127.0.0.1", "2001:db8::1"), "2001:db8::1")

    def test_ignores_forwarded_header_not_set_by_iis(self):
        self.assertEqual(self.ip("198.51.100.20", "1.2.3.4"), "198.51.100.20")

    def test_falls_back_to_remote_addr(self):
        self.assertEqual(self.ip("127.0.0.1"), "127.0.0.1")
        self.assertEqual(self.ip("127.0.0.1", "garbage"), "127.0.0.1")
