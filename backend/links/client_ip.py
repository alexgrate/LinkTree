import ipaddress

# In production every request reaches Django from IIS on the same machine.
TRUSTED_PROXIES = {"127.0.0.1", "::1"}


def client_ip(request):
    """The visitor's real IP address, used by django-axes to lock out password guessers.

    IIS (ARR) appends the address it received the request from to X-Forwarded-For.
    Anything earlier in that header was sent by the browser and can be faked, so only
    the last entry is trusted, and only when the request actually came through IIS.
    """
    remote = request.META.get("REMOTE_ADDR", "")
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if remote in TRUSTED_PROXIES and forwarded:
        candidate = _strip_port(forwarded.split(",")[-1].strip())
        try:
            return str(ipaddress.ip_address(candidate))
        except ValueError:
            pass
    return remote


def _strip_port(value):
    # ARR may add the client's port: "203.0.113.7:51234" or "[2001:db8::1]:51234".
    if value.startswith("["):
        return value[1:value.find("]")]
    if value.count(":") == 1:
        return value.split(":")[0]
    return value
