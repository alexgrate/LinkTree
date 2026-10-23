"""Input validation for the console API. Responses are plain dicts from the directory."""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from links.fields import IntranetURLValidator

from .directory import APP_TYPES, CREDENTIAL_TYPES
from .models import AuditEvent

GRANTEE_TYPES = ["User", "Group"]
OAUTH_GRANTS = ["client_credentials", "authorization_code", "refresh_token", "password", "jwt_assertion"]


class IntranetURL(serializers.CharField):
    default_validators = [IntranetURLValidator()]


# ---- Identity domain ---------------------------------------------------------

class UserSerializer(serializers.Serializer):
    userName = serializers.RegexField(
        r"^[A-Za-z0-9._@+-]+$", max_length=255,
        error_messages={"invalid": "Use letters, numbers and . _ @ + - only."},
    )
    givenName = serializers.CharField(max_length=150, allow_blank=True, required=False)
    familyName = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    title = serializers.CharField(max_length=150, allow_blank=True, required=False)
    active = serializers.BooleanField(default=True)


class UserUpdateSerializer(serializers.Serializer):
    givenName = serializers.CharField(max_length=150, allow_blank=True, required=False)
    familyName = serializers.CharField(max_length=150, required=False)
    displayName = serializers.CharField(max_length=255, required=False)
    email = serializers.EmailField(required=False)
    title = serializers.CharField(max_length=150, allow_blank=True, required=False)


class PasswordResetSerializer(serializers.Serializer):
    notify = serializers.BooleanField(
        default=True, help_text="Email the user a reset link. False returns a one-time password."
    )


class ScopeSerializer(serializers.Serializer):
    audience = serializers.CharField(max_length=500)
    scope = serializers.CharField(max_length=500)


class CredentialSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=list(CREDENTIAL_TYPES))
    description = serializers.CharField(max_length=255, allow_blank=True, required=False)
    expiresOn = serializers.DateTimeField(required=False, allow_null=True)
    key = serializers.CharField(required=False, allow_blank=True, help_text="API key: PEM public key")
    name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    scopes = ScopeSerializer(many=True, required=False)

    def validate(self, data):
        if data["type"] == "api_key":
            key = data.get("key", "").strip()
            if not key.startswith("-----BEGIN PUBLIC KEY-----"):
                raise serializers.ValidationError({"key": "Paste a PEM public key (-----BEGIN PUBLIC KEY-----)."})
            data["key"] = key
        if data["type"] == "oauth2":
            if not data.get("name"):
                raise serializers.ValidationError({"name": "Give the credential a name."})
            if not data.get("scopes"):
                raise serializers.ValidationError({"scopes": "Add at least one scope."})
        if data.get("expiresOn"):
            data["expiresOn"] = data["expiresOn"].isoformat()
        return data


class GroupSerializer(serializers.Serializer):
    displayName = serializers.CharField(max_length=255)
    description = serializers.CharField(max_length=1000, allow_blank=True, required=False)


class GroupUpdateSerializer(GroupSerializer):
    displayName = serializers.CharField(max_length=255, required=False)


class MembersSerializer(serializers.Serializer):
    userIds = serializers.ListField(child=serializers.CharField(max_length=100), min_length=1, max_length=200)


class AppSerializer(serializers.Serializer):
    displayName = serializers.CharField(max_length=255)
    description = serializers.CharField(max_length=1000, allow_blank=True, required=False)
    appType = serializers.ChoiceField(choices=list(APP_TYPES), default="confidential")
    homeUrl = IntranetURL(allow_blank=True, required=False)
    redirectUris = serializers.ListField(child=IntranetURL(), required=False, max_length=20)
    allowedGrants = serializers.ListField(
        child=serializers.ChoiceField(choices=OAUTH_GRANTS), required=False
    )
    active = serializers.BooleanField(default=True)


class AppUpdateSerializer(serializers.Serializer):
    displayName = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(max_length=1000, allow_blank=True, required=False)
    homeUrl = IntranetURL(allow_blank=True, required=False)
    redirectUris = serializers.ListField(child=IntranetURL(), required=False, max_length=20)


class GrantSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=GRANTEE_TYPES)
    id = serializers.CharField(max_length=100)


class PublishAppSerializer(serializers.Serializer):
    categoryId = serializers.IntegerField()
    environment = serializers.ChoiceField(choices=["PROD", "UAT", "DR"], default="PROD")


# ---- Console administrators (Django staff accounts) ---------------------------

class ConsoleAdminSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, style={"input_type": "password"})
    lastLogin = serializers.DateTimeField(source="last_login", read_only=True)
    dateJoined = serializers.DateTimeField(source="date_joined", read_only=True)
    firstName = serializers.CharField(source="first_name", required=False, allow_blank=True)
    lastName = serializers.CharField(source="last_name", required=False, allow_blank=True)
    isActive = serializers.BooleanField(source="is_active", required=False)
    isSuperuser = serializers.BooleanField(source="is_superuser", required=False)
    # "ad": signs in through the identity domain (no password here); "local": Django password.
    signInMethod = serializers.SerializerMethodField()

    class Meta:
        model = get_user_model()
        fields = ["id", "username", "email", "firstName", "lastName", "isActive", "isSuperuser",
                  "lastLogin", "dateJoined", "password", "signInMethod"]

    def get_signInMethod(self, user):
        return "local" if user.has_usable_password() else "ad"

    def validate_username(self, value):
        others = get_user_model().objects.filter(username__iexact=value)
        if self.instance:
            others = others.exclude(pk=self.instance.pk)
        if others.exists():
            # Logins ignore case, so "alex" and "Alex" can't both exist.
            raise serializers.ValidationError("That username is taken (usernames ignore case).")
        return value

    def validate(self, data):
        if not self.instance and not data.get("password"):
            raise serializers.ValidationError({"password": "Set a password for the new account."})
        if data.get("password") and self.instance and not self.instance.has_usable_password():
            raise serializers.ValidationError(
                {"password": "This account signs in with AD. Change the password in AD instead."}
            )
        if data.get("password"):
            user = self.instance or get_user_model()(username=data.get("username", ""))
            validate_password(data["password"], user)
        return data

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = get_user_model()(**validated_data, is_staff=True)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class AuditEventSerializer(serializers.ModelSerializer):
    createdAt = serializers.DateTimeField(source="created_at")
    actor = serializers.CharField(source="actor_name")
    targetType = serializers.CharField(source="target_type")
    targetId = serializers.CharField(source="target_id")
    targetLabel = serializers.CharField(source="target_label")
    ipAddress = serializers.CharField(source="ip_address")

    class Meta:
        model = AuditEvent
        fields = ["id", "createdAt", "actor", "action", "targetType", "targetId", "targetLabel",
                  "detail", "ipAddress"]
