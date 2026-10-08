from django.contrib.auth import authenticate, get_user_model
from django.test import TestCase


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
