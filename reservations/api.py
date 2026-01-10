from __future__ import annotations

from datetime import date as date_type

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from .models import Reservation, RoomType, TimeSlot


def _parse_date(value: str) -> date_type:
    return date_type.fromisoformat(value)


@require_GET
@login_required
def availability_api(request):
    """
    GET /api/availability/?date=YYYY-MM-DD[&room_type_id=123]

    Returns reserved slot values per room type for the provided date.
    """
    date_str = request.GET.get("date", "").strip()
    if not date_str:
        return JsonResponse({"error": "Missing required query param: date"}, status=400)

    try:
        target_date = _parse_date(date_str)
    except ValueError:
        return JsonResponse({"error": "Invalid date. Expected YYYY-MM-DD."}, status=400)

    room_type_id = request.GET.get("room_type_id", "").strip()

    room_types_qs = RoomType.objects.filter(is_active=True).only("id", "name").order_by("display_order", "name")
    if room_type_id:
        if not room_type_id.isdigit():
            return JsonResponse({"error": "Invalid room_type_id. Expected an integer."}, status=400)
        room_types_qs = room_types_qs.filter(id=int(room_type_id))

    room_types = list(room_types_qs)
    room_type_ids = [rt.id for rt in room_types]

    reserved_rows = (
        Reservation.objects.filter(date=target_date, room_type_id__in=room_type_ids)
        .values("room_type_id", "slot")
    )

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


