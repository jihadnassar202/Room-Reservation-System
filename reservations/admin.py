from django.contrib import admin

from .models import Reservation, RoomType


@admin.register(RoomType)
class RoomTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "capacity_range", "is_active", "display_order", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name",)
    ordering = ("display_order", "name")

    @admin.display(description="Capacity")
    def capacity_range(self, obj: RoomType) -> str:
        if obj.capacity_min is None and obj.capacity_max is None:
            return "—"
        if obj.capacity_min is None:
            return f"≤ {obj.capacity_max}"
        if obj.capacity_max is None:
            return f"≥ {obj.capacity_min}"
        return f"{obj.capacity_min}–{obj.capacity_max}"


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ("room_type", "date", "slot", "user", "created_at")
    list_filter = ("room_type", "date", "slot")
    search_fields = ("user__username", "room_type__name")
    autocomplete_fields = ("user", "room_type")



