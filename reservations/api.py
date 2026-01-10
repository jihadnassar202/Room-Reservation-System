from __future__ import annotations

import json
from datetime import date as date_type

from django.core.exceptions import PermissionDenied
from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from django.views.decorators.http import require_POST

from .models import Reservation, RoomType, TimeSlot
from .services import (
    PastReservationError,
    ReservationInput,
    SlotUnavailableError,
    cancel_reservation,
    create_reservation,
    update_reservation,
)


def _parse_date(value: str) -> date_type:
    return date_type.fromisoformat(value)


@require_GET
def availability_api(request):
    """
    GET /api/availability/?date=YYYY-MM-DD[&room_type_id=123]

    Returns reserved slot values per room type for the provided date.
    """
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Authentication required."}, status=401)

    date_str = request.GET.get("date", "").strip()
    if not date_str:
        return JsonResponse({"error": "Missing required query param: date"}, status=400)

    try:
        target_date = _parse_date(date_str)
    except ValueError:
        return JsonResponse({"error": "Invalid date. Expected YYYY-MM-DD."}, status=400)

    room_type_id = request.GET.get("room_type_id", "").strip()
    exclude_reservation_id = request.GET.get("exclude_reservation_id", "").strip()
    exclude_id = None
    if exclude_reservation_id:
        if not exclude_reservation_id.isdigit():
            return JsonResponse({"error": "Invalid exclude_reservation_id. Expected an integer."}, status=400)
        exclude_id = int(exclude_reservation_id)

    room_types_qs = RoomType.objects.filter(is_active=True).only("id", "name").order_by("display_order", "name")
    if room_type_id:
        if not room_type_id.isdigit():
            return JsonResponse({"error": "Invalid room_type_id. Expected an integer."}, status=400)
        room_types_qs = room_types_qs.filter(id=int(room_type_id))

    room_types = list(room_types_qs)
    room_type_ids = [rt.id for rt in room_types]

    reserved_qs = Reservation.objects.filter(date=target_date, room_type_id__in=room_type_ids)
    if exclude_id is not None:
        reserved_qs = reserved_qs.exclude(id=exclude_id)

    reserved_rows = reserved_qs.values("room_type_id", "slot")

    reserved_map: dict[int, set[int]] = {rt.id: set() for rt in room_types}
    for row in reserved_rows:
        reserved_map[row["room_type_id"]].add(int(row["slot"]))

    return JsonResponse(
        {
            "date": target_date.isoformat(),
            "time_slots": [{"value": v, "label": label} for v, label in TimeSlot.choices],
            "room_types": [
                {
                    "id": rt.id,
                    "name": rt.name,
                    "reserved_slots": sorted(reserved_map.get(rt.id, set())),
                }
                for rt in room_types
            ],
        }
    )


@require_POST
def create_reservation_api(request):
    """
    POST /api/reservations/
    Payload (JSON):
      - room_type_id: int
      - date: YYYY-MM-DD
      - slot: int (TimeSlot value)
    """
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Authentication required."}, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON payload."}, status=400)

    room_type_id = payload.get("room_type_id")
    date_str = (payload.get("date") or "").strip()
    slot = payload.get("slot")

    if not isinstance(room_type_id, int):
        return JsonResponse({"error": "room_type_id must be an integer."}, status=400)
    if not date_str:
        return JsonResponse({"error": "date is required."}, status=400)
    if not isinstance(slot, int):
        return JsonResponse({"error": "slot must be an integer."}, status=400)

    try:
        target_date = _parse_date(date_str)
    except ValueError:
        return JsonResponse({"error": "Invalid date. Expected YYYY-MM-DD."}, status=400)

    try:
        reservation = create_reservation(
            user=request.user,
            data=ReservationInput(room_type_id=room_type_id, date=target_date, slot=slot),
        )
    except ValidationError as exc:
        return JsonResponse({"error": "Validation error.", "details": exc.message_dict}, status=400)
    except PastReservationError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except SlotUnavailableError as exc:
        return JsonResponse({"error": str(exc)}, status=409)
    except RoomType.DoesNotExist:
        return JsonResponse({"error": "Room type not found."}, status=404)

    return JsonResponse(
        {
            "success": True,
            "reservation_id": reservation.id,
            "message": "Reservation created successfully.",
        },
        status=201,
    )


@require_POST
def update_reservation_api(request, reservation_id: int):
    """
    POST /api/reservations/<id>/update/
    Payload (JSON):
      - room_type_id: int
      - date: YYYY-MM-DD
      - slot: int (TimeSlot value)
    """
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Authentication required."}, status=401)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON payload."}, status=400)

    room_type_id = payload.get("room_type_id")
    date_str = (payload.get("date") or "").strip()
    slot = payload.get("slot")

    if not isinstance(room_type_id, int):
        return JsonResponse({"error": "room_type_id must be an integer."}, status=400)
    if not date_str:
        return JsonResponse({"error": "date is required."}, status=400)
    if not isinstance(slot, int):
        return JsonResponse({"error": "slot must be an integer."}, status=400)

    try:
        target_date = _parse_date(date_str)
    except ValueError:
        return JsonResponse({"error": "Invalid date. Expected YYYY-MM-DD."}, status=400)

    try:
        reservation = update_reservation(
            user=request.user,
            reservation_id=reservation_id,
            new_data=ReservationInput(room_type_id=room_type_id, date=target_date, slot=slot),
        )
    except Reservation.DoesNotExist:
        return JsonResponse({"error": "Reservation not found."}, status=404)
    except RoomType.DoesNotExist:
        return JsonResponse({"error": "Room type not found."}, status=404)
    except PermissionDenied:
        return JsonResponse({"error": "You do not have permission to edit this reservation."}, status=403)
    except ValidationError as exc:
        return JsonResponse({"error": "Validation error.", "details": exc.message_dict}, status=400)
    except PastReservationError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except SlotUnavailableError as exc:
        return JsonResponse({"error": str(exc)}, status=409)

    return JsonResponse(
        {
            "success": True,
            "reservation_id": reservation.id,
            "message": "Reservation updated successfully.",
        }
    )


@require_POST
def cancel_reservation_api(request, reservation_id: int):
    """
    POST /api/reservations/<id>/cancel/
    """
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Authentication required."}, status=401)

    try:
        cancel_reservation(user=request.user, reservation_id=reservation_id)
    except Reservation.DoesNotExist:
        return JsonResponse({"error": "Reservation not found."}, status=404)
    except PastReservationError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except PermissionDenied:
        return JsonResponse(
            {"error": "You do not have permission to cancel this reservation."},
            status=403,
        )

    return JsonResponse({"success": True, "message": "Reservation cancelled."})


