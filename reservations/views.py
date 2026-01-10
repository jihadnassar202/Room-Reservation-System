from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie

from django.http import Http404

from .forms import ReservationCreateForm, ReservationUpdateForm
from .models import Reservation, RoomType
from .services import PastReservationError, ReservationInput, SlotUnavailableError, create_reservation
from .services import update_reservation


@login_required
@ensure_csrf_cookie
def checkout_view(request):
    """
    Day 1 placeholder page.
    Day 2 will implement the availability matrix + AJAX reservation creation.
    """
    return render(
        request,
        "reservations/checkout.html",
        {"initial_date": timezone.localdate().isoformat()},
    )


@login_required
@ensure_csrf_cookie
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


@login_required
@ensure_csrf_cookie
def reservation_create_view(request):
    room_types_qs = RoomType.objects.filter(is_active=True).only("id", "name", "display_order").order_by(
        "display_order", "name"
    )

    initial_date = timezone.localdate()
    initial_room_type = room_types_qs.first()

    if request.method == "POST":
        form = ReservationCreateForm(request.POST, room_types_qs=room_types_qs)
        if form.is_valid():
            try:
                create_reservation(
                    user=request.user,
                    data=ReservationInput(
                        room_type_id=form.cleaned_data["room_type"].id,
                        date=form.cleaned_data["date"],
                        slot=form.cleaned_data["slot"],
                    ),
                )
            except SlotUnavailableError as exc:
                form.add_error("slot", str(exc))
            except PastReservationError as exc:
                form.add_error(None, str(exc))
            else:
                messages.success(request, "Reservation created successfully.")
                return redirect("reservations:my_reservations")

        messages.error(request, "Please fix the highlighted fields and try again.")
    else:
        form = ReservationCreateForm(
            room_types_qs=room_types_qs,
            initial={"room_type": initial_room_type, "date": initial_date},
        )

    return render(
        request,
        "reservations/reservation_form.html",
        {
            "form": form,
            "initial_date": initial_date.isoformat(),
            "has_room_types": room_types_qs.exists(),
        },
    )


@login_required
@ensure_csrf_cookie
def reservation_edit_view(request, reservation_id: int):
    reservation = (
        Reservation.objects.select_related("room_type")
        .filter(id=reservation_id, user=request.user)
        .first()
    )
    if not reservation:
        raise Http404

    if not reservation.is_future():
        messages.error(request, "Past reservations cannot be edited.")
        return redirect("reservations:my_reservations")

    room_types_qs = RoomType.objects.filter(is_active=True).only("id", "name", "display_order").order_by(
        "display_order", "name"
    )

    if request.method == "POST":
        form = ReservationUpdateForm(request.POST, room_types_qs=room_types_qs, reservation=reservation)
        if form.is_valid():
            try:
                update_reservation(
                    user=request.user,
                    reservation_id=reservation.id,
                    new_data=ReservationInput(
                        room_type_id=form.cleaned_data["room_type"].id,
                        date=form.cleaned_data["date"],
                        slot=form.cleaned_data["slot"],
                    ),
                )
            except SlotUnavailableError as exc:
                form.add_error("slot", str(exc))
            except PastReservationError as exc:
                form.add_error(None, str(exc))
            except RoomType.DoesNotExist:
                form.add_error("room_type", "Room type not found.")
            else:
                messages.success(request, "Reservation updated successfully.")
                return redirect("reservations:my_reservations")

        messages.error(request, "Please fix the highlighted fields and try again.")
    else:
        form = ReservationUpdateForm(
            room_types_qs=room_types_qs,
            reservation=reservation,
            initial={"room_type": reservation.room_type, "date": reservation.date, "slot": reservation.slot},
        )

    return render(
        request,
        "reservations/reservation_edit.html",
        {
            "form": form,
            "reservation": reservation,
            "has_room_types": room_types_qs.exists(),
        },
    )



