from django.contrib import admin
from .models import AppLink, Category


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "icon", "order"]
    list_editable = ["order"]


@admin.register(AppLink)
class AppLinkAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "environment", "owner_team", "is_active", "order"]
    list_filter = ["category", "environment", "is_active"]
    search_fields = ["name", "description", "tags", "owner_team"]
    list_editable = ["is_active", "order"]

