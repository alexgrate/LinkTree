from django.urls import path, re_path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("categories", views.CategoryViewSet, basename="console-category")
router.register("links", views.LinkViewSet, basename="console-link")
router.register("admins", views.ConsoleAdminViewSet, basename="console-admin")

ID = r"[A-Za-z0-9._:-]+"

urlpatterns = [
    path("status/", views.StatusView.as_view()),
    path("overview/", views.OverviewView.as_view()),
    path("audit/", views.AuditLogView.as_view()),

    # Identity domain users, their passwords and credentials
    path("users/", views.UserListView.as_view()),
    path("users/<str:user_id>/", views.UserDetailView.as_view()),
    re_path(rf"^users/(?P<user_id>{ID})/(?P<action>activate|deactivate)/$", views.UserStatusView.as_view()),
    path("users/<str:user_id>/reset-password/", views.UserPasswordResetView.as_view()),
    path("users/<str:user_id>/credentials/", views.UserCredentialListView.as_view()),
    path("users/<str:user_id>/credentials/<str:cred_type>/<str:cred_id>/",
         views.UserCredentialDetailView.as_view()),

    # Groups
    path("groups/", views.GroupListView.as_view()),
    path("groups/<str:group_id>/", views.GroupDetailView.as_view()),
    path("groups/<str:group_id>/members/", views.GroupMembersView.as_view()),
    path("groups/<str:group_id>/members/<str:user_id>/", views.GroupMemberView.as_view()),

    # Integrated applications
    path("apps/", views.AppListView.as_view()),
    path("apps/<str:app_id>/", views.AppDetailView.as_view()),
    re_path(rf"^apps/(?P<app_id>{ID})/(?P<action>activate|deactivate)/$", views.AppStatusView.as_view()),
    path("apps/<str:app_id>/secret/", views.AppSecretView.as_view()),
    path("apps/<str:app_id>/grants/", views.AppGrantListView.as_view()),
    path("apps/<str:app_id>/grants/<str:grant_id>/", views.AppGrantDetailView.as_view()),
    path("apps/<str:app_id>/publish/", views.AppPublishView.as_view()),

    # Identity domain administrator roles
    path("admin-roles/", views.AdminRoleListView.as_view()),
    path("admin-roles/<str:role_id>/grants/", views.AdminRoleGrantView.as_view()),
    path("admin-roles/<str:role_id>/grants/<str:grant_id>/", views.AdminRoleRevokeView.as_view()),

    # The public app directory and who can use this console
    *router.urls,
]

auth_urlpatterns = [
    path("session/", views.SessionView.as_view()),
    path("login/", views.LoginView.as_view()),
    path("logout/", views.LogoutView.as_view()),
    path("sso/start/", views.sso_start),
    path("sso/callback/", views.sso_callback),
]
