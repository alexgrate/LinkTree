from rest_framework import serializers

from .fields import IntranetURLValidator
from .models import AppLink, Category

class AppLinkSerializer(serializers.ModelSerializer):
    environment_label = serializers.CharField(
        source="get_environment_display", read_only=True
    )
    tags = serializers.SerializerMethodField()

    class Meta:
        model = AppLink
        fields = [
            "id", "name", "url", "description", "icon",
            "environment", "environment_label",
            "owner_team", "support_contact", "tags"
        ]

    def get_tags(self, obj):
        return [t.strip() for t in obj.tags.split(",") if t.strip()]

class CategorySerializer(serializers.ModelSerializer):
    links = AppLinkSerializer(many=True, read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "icon", "links"]
        

# Used by the admin console (console/views.py) to edit the directory.

class CategoryAdminSerializer(serializers.ModelSerializer):
    linkCount = serializers.IntegerField(source="link_count", read_only=True, default=0)

    class Meta:
        model = Category
        fields = ["id", "name", "icon", "order", "linkCount"]


class AppLinkAdminSerializer(serializers.ModelSerializer):
    # DRF's own URL check rejects bare intranet hosts like http://corebank:8080.
    url = serializers.CharField(max_length=200, validators=[IntranetURLValidator()])
    categoryName = serializers.CharField(source="category.name", read_only=True)
    environmentLabel = serializers.CharField(source="get_environment_display", read_only=True)
    ownerTeam = serializers.CharField(source="owner_team", required=False, allow_blank=True)
    supportContact = serializers.CharField(source="support_contact", required=False, allow_blank=True)
    isActive = serializers.BooleanField(source="is_active", required=False)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = AppLink
        fields = [
            "id", "name", "url", "description", "category", "categoryName", "icon",
            "environment", "environmentLabel", "ownerTeam", "supportContact", "tags",
            "isActive", "order", "updatedAt",
        ]
