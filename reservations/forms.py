from __future__ import annotations

from datetime import date as date_type

from django import forms

from .models import Reservation, RoomType, TimeSlot


class ReservationCreateForm(forms.Form):
    room_type = forms.ModelChoiceField(
        queryset=RoomType.objects.none(),
        empty_label="Select a room type",
    )
    date = forms.DateField(
        widget=forms.DateInput(attrs={"type": "date"}),
    )
    slot = forms.TypedChoiceField(
        choices=[],
        coerce=int,
        empty_value=None,
    )

    def __init__(self, *args, room_types_qs=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["room_type"].queryset = room_types_qs if room_types_qs is not None else RoomType.objects.filter(is_active=True)

        room_type_id = self.data.get("room_type") if self.is_bound else None
        date_str = self.data.get("date") if self.is_bound else None

        if not room_type_id:
            initial_rt = self.initial.get("room_type")
            if isinstance(initial_rt, RoomType):
                room_type_id = str(initial_rt.id)
            elif initial_rt:
                room_type_id = str(initial_rt)

        if not date_str:
            initial_date = self.initial.get("date")
            if isinstance(initial_date, date_type):
                date_str = initial_date.isoformat()
            elif initial_date:
                date_str = str(initial_date)

        self.fields["slot"].choices = self._available_slot_choices(room_type_id, date_str)

    def _available_slot_choices(self, room_type_id: str | None, date_str: str | None):
        if not room_type_id or not date_str:
            return []
        if not str(room_type_id).isdigit():
            return []
        try:
            target_date = date_type.fromisoformat(str(date_str))
        except ValueError:
            return []

        reserved = set(
            Reservation.objects.filter(room_type_id=int(room_type_id), date=target_date).values_list("slot", flat=True)
        )
        return [(v, label) for v, label in TimeSlot.choices if v not in reserved]


