from django.urls import path
from .views import CategoryListView

urlpatterns = [
    path("links/", CategoryListView.as_view(), name="category-list"),
]
