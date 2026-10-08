from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    icon = models.CharField(max_length=50, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class AppLink(models.Model):
    class Environment(models.TextChoices):
        PROD = "PROD", "Production"
        UAT = "UAT", "UAT"
        DR = "DR", "Disaster Recovery"

    name = models.CharField(max_length=150)
    url = models.URLField()
    description = models.TextField(blank=True)
    category = models.ForeignKey(
        Category, on_delete=models.PROTECT, related_name="links"
    )
    icon = models.CharField(max_length=50, blank=True)
    environment = models.CharField(
        max_length=10, choices=Environment.choices, default=Environment.PROD
    )
    owner_team = models.CharField(max_length=100, blank=True)
    support_contact = models.CharField(max_length=150, blank=True)
    tags = models.CharField(
        max_length=255, blank=True, help_text="Comma-separated aliases for search"
    )
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "name"]

    def __str__(self):
        return f"{self.name} ({self.environment})"
