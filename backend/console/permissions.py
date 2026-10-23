from rest_framework.permissions import BasePermission


class IsConsoleStaff(BasePermission):
    """Signed-in staff accounts ("Staff status" ticked) can use the console."""

    message = "Sign in with a staff account to use the console."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and user.is_staff)


class IsConsoleSuperuser(IsConsoleStaff):
    """Only superusers can manage who has console access."""

    message = "Only superusers can manage console administrators."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.is_superuser
