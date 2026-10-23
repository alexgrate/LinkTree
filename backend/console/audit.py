from links.client_ip import client_ip

from .models import AuditEvent


def record(request, action, target_type, target_id="", target_label="", **detail):
    """Log a console change. Pass only non-secret details."""
    AuditEvent.objects.create(
        actor=request.user if request.user.is_authenticated else None,
        actor_name=request.user.get_username() if request.user.is_authenticated else "anonymous",
        action=action,
        target_type=target_type,
        target_id=str(target_id or ""),
        target_label=str(target_label or "")[:255],
        detail=detail,
        ip_address=client_ip(request) or None,
    )
