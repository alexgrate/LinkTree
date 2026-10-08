import re

from django import forms
from django.core.validators import URLValidator
from django.db import models
from django.utils.regex_helper import _lazy_re_compile


class IntranetURLValidator(URLValidator):
    """Django's URL check, but the top-level domain is optional.

    Internal apps are often reached by a bare server name, such as http://corebank:8080,
    which Django's default validator rejects. Only http and https are allowed.
    """

    schemes = ["http", "https"]
    host_re = (
        "(" + URLValidator.hostname_re + URLValidator.domain_re
        + "(?:" + URLValidator.tld_re + ")?)"
    )
    # Same pattern as URLValidator.regex, rebuilt with the relaxed host_re.
    regex = _lazy_re_compile(
        r"^(?:[a-z0-9.+-]*)://"  # scheme is validated separately
        r"(?:[^\s:@/]+(?::[^\s:@/]*)?@)?"  # user:pass authentication
        r"(?:" + URLValidator.ipv4_re + "|" + URLValidator.ipv6_re + "|" + host_re + ")"
        r"(?::[0-9]{1,5})?"  # port
        r"(?:[/?#][^\s]*)?"  # resource path
        r"\Z",
        re.IGNORECASE,
    )


class IntranetURLFormField(forms.URLField):
    default_validators = [IntranetURLValidator()]


class IntranetURLField(models.URLField):
    default_validators = [IntranetURLValidator()]

    def formfield(self, **kwargs):
        return super().formfield(**{"form_class": IntranetURLFormField, **kwargs})
