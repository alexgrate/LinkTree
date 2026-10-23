from django.contrib import admin

from .models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ["created_at", "actor_name", "action", "target_type", "target_label", "ip_address"]
    list_filter = ["action", "target_type"]
    search_fields = ["actor_name", "target_label", "target_id"]

    # The audit log is read-only, even for superusers.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
