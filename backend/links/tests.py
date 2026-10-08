from django.contrib.auth import authenticate, get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from .models import AppLink, Category


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
        get_user_model().objects.create_superuser("admin", "a@example.com", "pw-admin-123")
        self.client.login(username="admin", password="pw-admin-123")
        response = self.client.post("/admin/links/applink/add/", {
            "name": "CoreBank", "url": "http://corebank:8080", "category": self.category.pk,
            "environment": "PROD", "order": 0, "is_active": "on",
        })
        self.assertEqual(response.status_code, 302)
        self.assertTrue(AppLink.objects.filter(url="http://corebank:8080").exists())
