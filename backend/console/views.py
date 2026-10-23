from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db.models import Count, ProtectedError, Q
from django.shortcuts import redirect
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from links.models import AppLink, Category
from links.serializers import AppLinkAdminSerializer, CategoryAdminSerializer

from . import audit, sso
from .directory import APP_TYPES, CREDENTIAL_TYPES, DirectoryError, ReauthRequired, get_directory
from .models import AuditEvent
from .permissions import IsConsoleStaff, IsConsoleSuperuser
from .serializers import (
    AppSerializer,
    AppUpdateSerializer,
    AuditEventSerializer,
    ConsoleAdminSerializer,
    CredentialSerializer,
    GrantSerializer,
    GroupSerializer,
    GroupUpdateSerializer,
    MembersSerializer,
    PasswordResetSerializer,
    PublishAppSerializer,
    UserSerializer,
    UserUpdateSerializer,
)


def validated(serializer_class, data):
    serializer = serializer_class(data=data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def paging(request):
    try:
        start = max(int(request.query_params.get("start", 1)), 1)
        count = min(max(int(request.query_params.get("count", 25)), 1), 100)
    except ValueError:
        raise ValidationError({"detail": "start and count must be numbers."}) from None
    return start, count


def session_user(request, user):
    if not (user.is_authenticated and user.is_staff and user.is_active):
        return None
    return {
        "username": user.get_username(),
        "displayName": user.get_full_name() or user.get_username(),
        "isSuperuser": user.is_superuser,
        "authMethod": request.session.get("auth_method", "local"),
    }


# ---- Sign in ---------------------------------------------------------------

@method_decorator(ensure_csrf_cookie, name="dispatch")
class SessionView(APIView):
    """Who is signed in. Also sets the CSRF cookie the frontend sends back on writes."""

    def get(self, request):
        return Response({
            "user": session_user(request, request.user),
            # Which sign-in options the sign-in page offers.
            "signIn": {"sso": sso.enabled(), "local": sso.local_login_allowed()},
        })


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    def post(self, request):
        if not sso.local_login_allowed():
            return Response({"detail": "Sign in with your Dash MFB account instead."},
                            status=status.HTTP_403_FORBIDDEN)
        username = str(request.data.get("username", "")).strip()
        password = str(request.data.get("password", ""))
        # Passing Django's own request (not DRF's wrapper) lets django-axes count
        # failures and lock out the IP; its middleware then answers 429.
        user = authenticate(request._request, username=username, password=password)
        if user is None or not user.is_staff:
            return Response({"detail": "Wrong username or password."}, status=status.HTTP_400_BAD_REQUEST)
        login(request, user)
        request.session["auth_method"] = "local"
        audit.record(request, "signed_in", "session", user.pk, user.get_username(), method="local password")
        return Response({"user": session_user(request, user)})


class LogoutView(APIView):
    def post(self, request):
        # After an SSO sign-in, the browser also signs out of the identity domain.
        id_token = request.session.get("sso_id_token")
        logout_url = sso.logout_url(request, id_token) if id_token and sso.enabled() else None
        logout(request)
        return Response({"logoutUrl": logout_url})


def sso_start(request):
    if not sso.enabled():
        return redirect("/sign-in?error=sso_off")
    return sso.start(request)


def sso_callback(request):
    if not sso.enabled():
        return redirect("/sign-in?error=sso_off")
    return sso.callback(request)


# ---- Base for directory views ---------------------------------------------

class ConsoleView(APIView):
    permission_classes = [IsConsoleStaff]

    @property
    def directory(self):
        return get_directory(self.request)

    def handle_exception(self, exc):
        if isinstance(exc, ReauthRequired):
            # The admin's OCI session ended: sign them out so the app sends them to sign in.
            logout(self.request)
            return Response({"detail": exc.message, "code": "reauth"}, status=exc.status)
        if isinstance(exc, DirectoryError):
            return Response({"detail": exc.message}, status=exc.status)
        return super().handle_exception(exc)


class StatusView(ConsoleView):
    def get(self, request):
        return Response({
            **self.directory.describe(),
            "credentialTypes": CREDENTIAL_TYPES,
            "appTypes": APP_TYPES,
        })


class OverviewView(ConsoleView):
    def get(self, request):
        links = AppLink.objects.aggregate(total=Count("id"), active=Count("id", filter=Q(is_active=True)))
        try:
            directory, directory_error = self.directory.overview(), None
        except ReauthRequired:
            raise
        except DirectoryError as exc:
            directory, directory_error = None, exc.message
        return Response({
            "directory": directory,
            "directoryError": directory_error,
            "portal": {"categories": Category.objects.count(), "links": links["total"],
                       "activeLinks": links["active"]},
            "recentActivity": AuditEventSerializer(AuditEvent.objects.all()[:8], many=True).data,
        })


# ---- Users -------------------------------------------------------------------

class UserListView(ConsoleView):
    def get(self, request):
        start, count = paging(request)
        return Response(self.directory.list_users(
            query=request.query_params.get("q", "").strip(),
            status=request.query_params.get("status", ""),
            start=start, count=count,
        ))

    def post(self, request):
        user = self.directory.create_user(validated(UserSerializer, request.data))
        audit.record(request, "created", "user", user["id"], user["userName"])
        return Response(user, status=status.HTTP_201_CREATED)


class UserDetailView(ConsoleView):
    def get(self, request, user_id):
        return Response(self.directory.get_user(user_id))

    def patch(self, request, user_id):
        data = validated(UserUpdateSerializer, request.data)
        user = self.directory.update_user(user_id, data)
        audit.record(request, "updated", "user", user_id, user["userName"], fields=sorted(data))
        return Response(user)

    def delete(self, request, user_id):
        user = self.directory.get_user(user_id)
        self.directory.delete_user(user_id)
        audit.record(request, "deleted", "user", user_id, user["userName"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserStatusView(ConsoleView):
    def post(self, request, user_id, action):
        active = action == "activate"
        user = self.directory.set_user_active(user_id, active)
        audit.record(request, "activated" if active else "deactivated", "user", user_id, user["userName"])
        return Response(user)


class UserPasswordResetView(ConsoleView):
    def post(self, request, user_id):
        notify = validated(PasswordResetSerializer, request.data)["notify"]
        user = self.directory.get_user(user_id)
        result = self.directory.reset_password(user_id, notify=notify)
        audit.record(request, "reset_password", "user", user_id, user["userName"],
                     method="email" if notify else "one-time password")
        return Response(result)


class UserCredentialListView(ConsoleView):
    def get(self, request, user_id):
        return Response(self.directory.list_credentials(user_id))

    def post(self, request, user_id):
        data = validated(CredentialSerializer, request.data)
        user = self.directory.get_user(user_id)
        result = self.directory.create_credential(user_id, data.pop("type"), data)
        cred = result["credential"]
        audit.record(request, "created_credential", "user", user_id, user["userName"],
                     credential=cred["label"], credentialId=cred["id"])
        return Response(result, status=status.HTTP_201_CREATED)


class UserCredentialDetailView(ConsoleView):
    def delete(self, request, user_id, cred_type, cred_id):
        if cred_type not in CREDENTIAL_TYPES:
            return Response({"detail": "Unknown credential type."}, status=status.HTTP_404_NOT_FOUND)
        user = self.directory.get_user(user_id)
        self.directory.delete_credential(cred_type, cred_id)
        audit.record(request, "deleted_credential", "user", user_id, user["userName"],
                     credential=CREDENTIAL_TYPES[cred_type], credentialId=cred_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---- Groups ------------------------------------------------------------------

class GroupListView(ConsoleView):
    def get(self, request):
        start, count = paging(request)
        return Response(self.directory.list_groups(
            query=request.query_params.get("q", "").strip(), start=start, count=count,
        ))

    def post(self, request):
        group = self.directory.create_group(validated(GroupSerializer, request.data))
        audit.record(request, "created", "group", group["id"], group["displayName"])
        return Response(group, status=status.HTTP_201_CREATED)


class GroupDetailView(ConsoleView):
    def get(self, request, group_id):
        return Response(self.directory.get_group(group_id))

    def patch(self, request, group_id):
        data = validated(GroupUpdateSerializer, request.data)
        group = self.directory.update_group(group_id, data)
        audit.record(request, "updated", "group", group_id, group["displayName"], fields=sorted(data))
        return Response(group)

    def delete(self, request, group_id):
        group = self.directory.get_group(group_id)
        self.directory.delete_group(group_id)
        audit.record(request, "deleted", "group", group_id, group["displayName"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class GroupMembersView(ConsoleView):
    def post(self, request, group_id):
        user_ids = validated(MembersSerializer, request.data)["userIds"]
        group = self.directory.add_group_members(group_id, user_ids)
        audit.record(request, "added_members", "group", group_id, group["displayName"], userIds=user_ids)
        return Response(group)


class GroupMemberView(ConsoleView):
    def delete(self, request, group_id, user_id):
        group = self.directory.remove_group_member(group_id, user_id)
        audit.record(request, "removed_member", "group", group_id, group["displayName"], userId=user_id)
        return Response(group)


# ---- Integrated applications ------------------------------------------------

class AppListView(ConsoleView):
    def get(self, request):
        start, count = paging(request)
        return Response(self.directory.list_apps(
            query=request.query_params.get("q", "").strip(), start=start, count=count,
        ))

    def post(self, request):
        app = self.directory.create_app(validated(AppSerializer, request.data))
        audit.record(request, "created", "app", app["id"], app["displayName"])
        # A new confidential app's secret is shown once, straight after creation.
        return Response(self.directory.get_app(app["id"], reveal_secret=True), status=status.HTTP_201_CREATED)


class AppDetailView(ConsoleView):
    def get(self, request, app_id):
        return Response(self.directory.get_app(app_id))

    def patch(self, request, app_id):
        data = validated(AppUpdateSerializer, request.data)
        app = self.directory.update_app(app_id, data)
        audit.record(request, "updated", "app", app_id, app["displayName"], fields=sorted(data))
        return Response(app)

    def delete(self, request, app_id):
        app = self.directory.get_app(app_id)
        if app["oracleManaged"]:
            return Response({"detail": "Oracle-managed applications can't be deleted."},
                            status=status.HTTP_400_BAD_REQUEST)
        self.directory.delete_app(app_id)
        audit.record(request, "deleted", "app", app_id, app["displayName"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class AppStatusView(ConsoleView):
    def post(self, request, app_id, action):
        active = action == "activate"
        app = self.directory.set_app_active(app_id, active)
        audit.record(request, "activated" if active else "deactivated", "app", app_id, app["displayName"])
        return Response(app)


class AppSecretView(ConsoleView):
    def post(self, request, app_id):
        app = self.directory.get_app(app_id, reveal_secret=True)
        audit.record(request, "viewed_secret", "app", app_id, app["displayName"])
        return Response({"clientId": app["clientId"], "clientSecret": app.get("clientSecret")})


class AppGrantListView(ConsoleView):
    def get(self, request, app_id):
        return Response(self.directory.list_app_grants(app_id))

    def post(self, request, app_id):
        data = validated(GrantSerializer, request.data)
        app = self.directory.get_app(app_id)
        grant = self.directory.grant_app(app_id, data["type"], data["id"])
        audit.record(request, "granted_access", "app", app_id, app["displayName"],
                     grantee=f"{grant['type']}: {grant['display']}")
        return Response(grant, status=status.HTTP_201_CREATED)


class AppGrantDetailView(ConsoleView):
    def delete(self, request, app_id, grant_id):
        app = self.directory.get_app(app_id)
        self.directory.revoke_grant(grant_id)
        audit.record(request, "revoked_access", "app", app_id, app["displayName"], grantId=grant_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AppPublishView(ConsoleView):
    """Add an integrated application to the public app directory page."""

    def post(self, request, app_id):
        data = validated(PublishAppSerializer, request.data)
        app = self.directory.get_app(app_id)
        if not app["homeUrl"]:
            return Response({"detail": "Set the application's home page URL first."},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            category = Category.objects.get(pk=data["categoryId"])
        except Category.DoesNotExist:
            return Response({"detail": "Category not found."}, status=status.HTTP_400_BAD_REQUEST)
        link, created = AppLink.objects.update_or_create(
            name=app["displayName"], category=category,
            defaults={"url": app["homeUrl"], "description": app["description"],
                      "environment": data["environment"]},
        )
        audit.record(request, "published" if created else "republished", "link", link.pk, link.name,
                     fromApp=app_id)
        return Response(AppLinkAdminSerializer(link).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


# ---- Administrator roles ---------------------------------------------------

class AdminRoleListView(ConsoleView):
    def get(self, request):
        return Response(self.directory.list_admin_roles())


class AdminRoleGrantView(ConsoleView):
    def post(self, request, role_id):
        data = validated(GrantSerializer, request.data)
        grant = self.directory.grant_admin_role(role_id, data["type"], data["id"])
        role = next((r for r in self.directory.list_admin_roles() if r["id"] == role_id), {})
        audit.record(request, "granted_role", "admin_role", role_id, role.get("displayName", role_id),
                     grantee=f"{grant['type']}: {grant['display']}")
        return Response(grant, status=status.HTTP_201_CREATED)


class AdminRoleRevokeView(ConsoleView):
    def delete(self, request, role_id, grant_id):
        role = next((r for r in self.directory.list_admin_roles() if r["id"] == role_id), None)
        if role is None:
            return Response({"detail": "Administrator role not found."}, status=status.HTTP_404_NOT_FOUND)
        holder = next((h for h in role["holders"] if h["grantId"] == grant_id), None)
        if holder is None:
            return Response({"detail": "That assignment no longer exists."}, status=status.HTTP_404_NOT_FOUND)
        self.directory.revoke_grant(grant_id)
        audit.record(request, "revoked_role", "admin_role", role_id, role["displayName"],
                     grantee=f"{holder['type']}: {holder['display']}")
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---- App directory page (categories and links) -------------------------------

class AuditedModelViewSet(viewsets.ModelViewSet):
    permission_classes = [IsConsoleStaff]
    target_type = ""

    def perform_create(self, serializer):
        obj = serializer.save()
        audit.record(self.request, "created", self.target_type, obj.pk, str(obj))

    def perform_update(self, serializer):
        obj = serializer.save()
        audit.record(self.request, "updated", self.target_type, obj.pk, str(obj),
                     fields=sorted(serializer.validated_data))

    def perform_destroy(self, instance):
        label, pk = str(instance), instance.pk
        try:
            instance.delete()
        except ProtectedError:
            raise ValidationError({"detail": "Move or delete this category's apps first."}) from None
        audit.record(self.request, "deleted", self.target_type, pk, label)


class CategoryViewSet(AuditedModelViewSet):
    serializer_class = CategoryAdminSerializer
    queryset = Category.objects.annotate(link_count=Count("links"))
    target_type = "category"


class LinkViewSet(AuditedModelViewSet):
    serializer_class = AppLinkAdminSerializer
    queryset = AppLink.objects.select_related("category")
    target_type = "link"


# ---- Console administrators -----------------------------------------------

class ConsoleAdminViewSet(viewsets.ModelViewSet):
    permission_classes = [IsConsoleSuperuser]
    serializer_class = ConsoleAdminSerializer

    def get_queryset(self):
        return get_user_model().objects.filter(is_staff=True).order_by("username")

    def perform_create(self, serializer):
        user = serializer.save()
        audit.record(self.request, "created", "console_admin", user.pk, user.username,
                     superuser=user.is_superuser)

    def perform_update(self, serializer):
        if serializer.instance == self.request.user and (
            serializer.validated_data.get("is_active") is False
            or serializer.validated_data.get("is_superuser") is False
        ):
            raise ValidationError({"detail": "You can't deactivate or demote your own account."})
        user = serializer.save()
        fields = sorted(serializer.validated_data)
        audit.record(self.request, "updated", "console_admin", user.pk, user.username,
                     fields=["password" if f == "password" else f for f in fields])

    def perform_destroy(self, instance):
        if instance == self.request.user:
            raise ValidationError({"detail": "You can't delete your own account."})
        label, pk = instance.username, instance.pk
        instance.delete()
        audit.record(self.request, "deleted", "console_admin", pk, label)


# ---- Audit log -------------------------------------------------------------

class AuditPagination(PageNumberPagination):
    page_size = 50


class AuditLogView(ConsoleView):
    def get(self, request):
        events = AuditEvent.objects.all()
        q = request.query_params.get("q", "").strip()
        if q:
            events = events.filter(
                Q(actor_name__icontains=q) | Q(target_label__icontains=q) | Q(action__icontains=q)
            )
        target_type = request.query_params.get("type")
        if target_type:
            events = events.filter(target_type=target_type)
        paginator = AuditPagination()
        page = paginator.paginate_queryset(events, request, view=self)
        return paginator.get_paginated_response(AuditEventSerializer(page, many=True).data)
