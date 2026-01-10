from django.urls import path

from .api import availability_api
from .views import checkout_view, my_reservations_view


app_name = "reservations"

urlpatterns = [
    path("api/availability/", availability_api, name="availability_api"),
    path("checkout/", checkout_view, name="checkout"),
    path("my-reservations/", my_reservations_view, name="my_reservations"),
]



