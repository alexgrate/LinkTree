from rest_framework import serializers
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
        