from __future__ import annotations

from dataclasses import dataclass
from datetime import date as date_type
from datetime import datetime, time, timedelta

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import Reservation, RoomType, TimeSlot


class ReservationError(Exception):
    """Base error type for reservation domain errors."""


class SlotUnavailableError(ReservationError):
    """Raised when trying to reserve a slot that is already taken."""


class PastReservationError(ReservationError):
    """Raised when attempting to create/update/cancel a past reservation."""


@dataclass(frozen=True)
class ReservationInput:
    room_type_id: int
    date: date_type
    slot: int


def _aware_slot_start(date_value: date_type, slot_value: int) -> datetime:
    naive = datetime.combine(date_value, time(hour=int(slot_value)))
    return timezone.make_aware(naive, timezone.get_current_timezone())


def _aware_slot_end(date_value: date_type, slot_value: int) -> datetime:
    return _aware_slot_start(date_value, slot_value) + timedelta(hours=1)


def _validate_slot(slot_value: int) -> None:
    if slot_value not in TimeSlot.values:
        raise ValidationError({"slot": "Invalid time slot."})


def _validate_not_past(date_value: date_type, slot_value: int) -> None:
    """
    Prevent reserving slots that already ended.
    """
    end_dt = _aware_slot_end(date_value, slot_value)
    if end_dt <= timezone.now():
        raise PastReservationError("You cannot reserve a past time slot.")


def create_reservation(*, user, data: ReservationInput) -> Reservation:
    """
    Create a reservation safely:
    - Locks the target RoomType row (row-level locking).
    - Re-checks availability in-transaction.
    - Relies on a unique constraint as the final guard.
    """
    _validate_slot(data.slot)
    _validate_not_past(data.date, data.slot)

    try:
        with transaction.atomic():
            room_type = (
                RoomType.objects.select_for_update()
                .only("id", "is_active")
                .get(id=data.room_type_id, is_active=True)
            )

            if Reservation.objects.filter(
                room_type=room_type,
                date=data.date,
                slot=data.slot,
            ).exists():
                raise SlotUnavailableError("That time slot is already reserved.")

            return Reservation.objects.create(
                user=user,
                room_type=room_type,
                date=data.date,
                slot=data.slot,
            )
    except IntegrityError as exc:
        raise SlotUnavailableError("That time slot was just reserved. Please pick another.") from exc


def update_reservation(
    *,
    user,
    reservation_id: int,
    new_data: ReservationInput,
) -> Reservation:
    """
    Update an existing reservation safely (future-only, owner-only).
    Locks:
    - Reservation row (to serialize edits)
    - RoomType row(s) involved (row-level locking)
    """
    _validate_slot(new_data.slot)
    _validate_not_past(new_data.date, new_data.slot)

    try:
        with transaction.atomic():
            reservation = (
                Reservation.objects.select_for_update()
                .select_related("room_type")
                .get(id=reservation_id)
            )

            if reservation.user_id != user.id:
                raise PermissionDenied("You do not have permission to edit this reservation.")

            if not reservation.is_future():
                raise PastReservationError("Past reservations cannot be edited.")

            room_type_ids = {reservation.room_type_id, new_data.room_type_id}
            list(RoomType.objects.select_for_update().filter(id__in=room_type_ids).only("id"))

            reservation.room_type_id = new_data.room_type_id
            reservation.date = new_data.date
            reservation.slot = new_data.slot
            reservation.save(update_fields=["room_type", "date", "slot", "updated_at"])
            return reservation
    except IntegrityError as exc:
        raise SlotUnavailableError("That time slot was just reserved. Please pick another.") from exc


def cancel_reservation(*, user, reservation_id: int) -> None:
    """
    Cancel (delete) an existing reservation (future-only, owner-only).
    """
    with transaction.atomic():
        reservation = (
            Reservation.objects.select_for_update()
            .get(id=reservation_id)
        )

        if reservation.user_id != user.id:
            raise PermissionDenied("You do not have permission to cancel this reservation.")

        if not reservation.is_future():
            raise PastReservationError("Past reservations cannot be cancelled.")

        reservation.delete()


