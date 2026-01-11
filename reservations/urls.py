from django.urls import path

from .api import (
    availability_api,
    cancel_reservation_api,
    create_reservation_api,
    update_reservation_api,
)
from .views import my_reservations_view, reservation_create_view, reservation_edit_view, room_availability_view


app_name = "reservations"

urlpatterns = [
    path("api/availability/", availability_api, name="availability_api"),
    path("api/reservations/", create_reservation_api, name="create_reservation_api"),
    path(
        "api/reservations/<int:reservation_id>/update/",
        update_reservation_api,
        name="update_reservation_api",
    ),
    path(
        "api/reservations/<int:reservation_id>/cancel/",
        cancel_reservation_api,
        name="cancel_reservation_api",
    ),
    path("availability/", room_availability_view, name="room_availability"),
    path("reservations/new/", reservation_create_view, name="reservation_create"),
    path("my-reservations/", my_reservations_view, name="my_reservations"),
    path("reservations/<int:reservation_id>/edit/", reservation_edit_view, name="reservation_edit"),
]



