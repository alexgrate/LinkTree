from django.db.models import Prefetch
from rest_framework.generics import ListAPIView
from .models import AppLink, Category
from .serializers import CategorySerializer


class CategoryListView(ListAPIView):
    serializer_class = CategorySerializer

    def get_queryset(self):
        active_links = AppLink.objects.filter(is_active=True)
        return (
            Category.objects
            .prefetch_related(Prefetch("links", queryset=active_links))
            .filter(links__is_active=True)
            .distinct()
        )
