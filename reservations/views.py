from datetime import date as date_type

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import Http404
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie

from .forms import ReservationCreateForm, ReservationUpdateForm
from .models import Reservation, RoomType
from .services import PastReservationError, ReservationInput, SlotUnavailableError, create_reservation, update_reservation


@login_required
@ensure_csrf_cookie
def room_availability_view(request):
    """
    Room Availability:
    - Primary UX: date-driven availability (AJAX) + reserve from the same page.
    """
    date_str = (request.GET.get("date") or "").strip()
    initial_date = timezone.localdate()
    if date_str:
        try:
            initial_date = date_type.fromisoformat(date_str)
        except ValueError:
            # Keep default (today) if invalid.
            pass

    room_types = list(
        RoomType.objects.filter(is_active=True)
        .only(
            "id",
            "name",
            "description",
            "capacity_min",
            "capacity_max",
            "default_equipment",
            "display_order",
        )
        .order_by("display_order", "name")
    )
    return render(
        request,
        "reservations/room_availability.html",
        {
            "initial_date": initial_date.isoformat(),
            "room_types": room_types,
        },
    )


@login_required
@ensure_csrf_cookie
def reservation_create_view(request):
    """
    Server-rendered (no-JS) reservation flow:
    - Uses a Django Form (ReservationCreateForm).
    - Slot choices are filtered server-side to ONLY available slots for the selected room + date.
    - Reservation creation happens via a normal POST handled by this Django view (no JS fetch required).
    """
    room_types_qs = RoomType.objects.filter(is_active=True).only("id", "name", "display_order").order_by(
        "display_order", "name"
    )

    if request.method == "POST":
        form = ReservationCreateForm(
            request.POST,
            room_types_qs=room_types_qs,
            slot_help_id="createSlotHelp",
        )

        action = (request.POST.get("action") or "").strip().lower()
        if action == "reserve":
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
                except RoomType.DoesNotExist:
                    form.add_error("room_type", "Room type not found.")
                else:
                    messages.success(request, "Reservation created successfully.")
                    return redirect("reservations:my_reservations")

            messages.error(request, "Please fix the highlighted fields and try again.")
        # else: action == "update" (or missing) -> re-render to refresh server-side slot choices.
    else:
        form = ReservationCreateForm(
            room_types_qs=room_types_qs,
            slot_help_id="createSlotHelp",
            initial={"date": timezone.localdate()},
        )

    return render(
        request,
        "reservations/reservation_create.html",
        {
            "form": form,
            "has_room_types": room_types_qs.exists(),
        },
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
        form = ReservationUpdateForm(
            request.POST,
            room_types_qs=room_types_qs,
            reservation=reservation,
            slot_help_id="editSlotHelp",
        )
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
            slot_help_id="editSlotHelp",
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



