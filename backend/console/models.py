from django.conf import settings
from django.db import models


class AuditEvent(models.Model):
    """One change made through the console. Secrets are never stored here."""

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    # Kept separately so the record survives the actor's account being deleted.
    actor_name = models.CharField(max_length=150)
    action = models.CharField(max_length=60, db_index=True)
    target_type = models.CharField(max_length=40, db_index=True)
    target_id = models.CharField(max_length=100, blank=True)
    target_label = models.CharField(max_length=255, blank=True)
    detail = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.actor_name} {self.action} {self.target_type} {self.target_label}"
