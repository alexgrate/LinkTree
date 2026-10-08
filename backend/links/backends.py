from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class CaseInsensitiveModelBackend(ModelBackend):
    """Lets staff log in as "alex", "Alex" or "ALEX"."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        UserModel = get_user_model()
        if username is None:
            username = kwargs.get(UserModel.USERNAME_FIELD)
        if username is None or password is None:
            return None

        try:
            user = UserModel._default_manager.get(
                **{f"{UserModel.USERNAME_FIELD}__iexact": username}
            )
        except UserModel.DoesNotExist:
            # Hash anyway so a wrong username takes as long as a wrong password.
            UserModel().set_password(password)
            return None
        except UserModel.MultipleObjectsReturned:
            # "alex" and "Alex" both exist; refuse rather than guess which one.
            return None

        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
