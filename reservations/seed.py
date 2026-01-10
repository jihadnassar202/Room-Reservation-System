from __future__ import annotations

from dataclasses import dataclass

from django.db import transaction

from .models import RoomType


@dataclass(frozen=True)
class RoomTypeSeed:
    name: str
    capacity_min: int
    capacity_max: int
    default_equipment: list[str]
    display_order: int
    description: str = ""


DEFAULT_ROOM_TYPES: list[RoomTypeSeed] = [
    RoomTypeSeed(
        name="Lecture Hall",
        capacity_min=50,
        capacity_max=200,
        default_equipment=["Projector", "AC", "Whiteboard", "Sound system"],
        display_order=10,
        description="Large hall suitable for lectures and presentations.",
    ),
    RoomTypeSeed(
        name="Lab",
        capacity_min=20,
        capacity_max=40,
        default_equipment=["AC", "Whiteboard", "Computers"],
        display_order=20,
        description="Hands-on lab room for practical sessions.",
    ),
    RoomTypeSeed(
        name="Seminar Room",
        capacity_min=10,
        capacity_max=25,
        default_equipment=["Projector", "AC", "Whiteboard"],
        display_order=30,
        description="Small room suitable for discussions and seminars.",
    ),
    RoomTypeSeed(
        name="Conference Room",
        capacity_min=8,
        capacity_max=20,
        default_equipment=["Projector", "AC", "Whiteboard", "Video conferencing"],
        display_order=40,
        description="Meeting room suitable for conferences and client meetings.",
    ),
]


def seed_default_room_types(*, update_existing: bool = False) -> dict[str, int]:
    """
    Idempotently seed default Room Types.

    - If update_existing is False: creates missing room types only (does not overwrite edits).
    - If update_existing is True: updates existing room types to match defaults.
    """
    created = 0
    updated = 0
    skipped = 0

    with transaction.atomic():
        for rt in DEFAULT_ROOM_TYPES:
            defaults = {
                "capacity_min": rt.capacity_min,
                "capacity_max": rt.capacity_max,
                "default_equipment": rt.default_equipment,
                "display_order": rt.display_order,
                "description": rt.description,
                "is_active": True,
            }

            if update_existing:
                _, was_created = RoomType.objects.update_or_create(name=rt.name, defaults=defaults)
                if was_created:
                    created += 1
                else:
                    updated += 1
            else:
                _, was_created = RoomType.objects.get_or_create(name=rt.name, defaults=defaults)
                if was_created:
                    created += 1
                else:
                    skipped += 1

    return {"created": created, "updated": updated, "skipped": skipped}


