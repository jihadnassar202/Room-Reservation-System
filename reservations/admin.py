from django.contrib import admin

from .models import Reservation, RoomType


@admin.register(RoomType)
class RoomTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "display_order", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name",)
    ordering = ("display_order", "name")


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ("room_type", "date", "slot", "user", "created_at")
    list_filter = ("room_type", "date", "slot")
    search_fields = ("user__username", "room_type__name")
    autocomplete_fields = ("user", "room_type")


