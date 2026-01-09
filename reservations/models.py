from datetime import datetime, time, timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class RoomType(models.Model):
    name = models.CharField(max_length=80, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "name"]

    def __str__(self) -> str:  # pragma: no cover
        return self.name


class TimeSlot(models.IntegerChoices):
    H09 = 9, "09:00–10:00"
    H10 = 10, "10:00–11:00"
    H11 = 11, "11:00–12:00"
    H12 = 12, "12:00–13:00"
    H13 = 13, "13:00–14:00"
    H14 = 14, "14:00–15:00"
    H15 = 15, "15:00–16:00"
    H16 = 16, "16:00–17:00"
    H17 = 17, "17:00–18:00"


class Reservation(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reservations",
    )
    room_type = models.ForeignKey(RoomType, on_delete=models.PROTECT, related_name="reservations")
    date = models.DateField()
    slot = models.PositiveSmallIntegerField(choices=TimeSlot.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["room_type", "date", "slot"],
                name="unique_reservation_roomtype_date_slot",
            )
        ]
        indexes = [
            models.Index(fields=["user", "date"], name="idx_res_user_date"),
            models.Index(fields=["room_type", "date"], name="idx_res_room_date"),
        ]
        ordering = ["-date", "-slot", "-created_at"]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.room_type} · {self.date} · {self.get_slot_display()} · {self.user}"

    def start_datetime(self) -> datetime:
        """
        Timezone-aware start datetime for this reservation.
        """
        naive = datetime.combine(self.date, time(hour=int(self.slot)))
        return timezone.make_aware(naive, timezone.get_current_timezone())

    def end_datetime(self) -> datetime:
        """
        Timezone-aware end datetime for this reservation.
        Assumption: each slot is 1 hour.
        """
        return self.start_datetime() + timedelta(hours=1)

    def is_future(self) -> bool:
        """
        True if the reservation has not ended yet.
        """
        return self.end_datetime() >= timezone.now()


