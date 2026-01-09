from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from django.utils import timezone

from .models import Reservation


@login_required
def checkout_view(request):
    """
    Day 1 placeholder page.
    Day 2 will implement the availability matrix + AJAX reservation creation.
    """
    return render(request, "reservations/checkout.html")


@login_required
def my_reservations_view(request):
    """
    Day 1 foundation: split user reservations into upcoming vs past.
    Day 2 will add edit/cancel actions + richer UI.
    """
    now = timezone.now()
    all_reservations = (
        Reservation.objects.select_related("room_type")
        .filter(user=request.user)
        .order_by("-date", "-slot", "-created_at")
    )

    upcoming = []
    past = []
    for r in all_reservations:
        if r.end_datetime() >= now:
            upcoming.append(r)
        else:
            past.append(r)

    return render(
        request,
        "reservations/my_reservations.html",
        {"upcoming": upcoming, "past": past},
    )


