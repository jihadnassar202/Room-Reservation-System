from django.urls import path

from .views import checkout_view, my_reservations_view


app_name = "reservations"

urlpatterns = [
    path("checkout/", checkout_view, name="checkout"),
    path("my-reservations/", my_reservations_view, name="my_reservations"),
]


