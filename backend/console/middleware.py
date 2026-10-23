from django.utils.cache import add_never_cache_headers


class NoStoreConsoleAPI:
    """Console API responses can contain secrets, so browsers and proxies mustn't keep them."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith(("/api/console/", "/api/auth/")):
            add_never_cache_headers(response)
        return response
