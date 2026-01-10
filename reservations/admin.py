from django import forms
from django.contrib import admin
from django.db.models import Q
from django.utils import timezone
from django.utils.html import format_html

from .models import Reservation, RoomType


admin.site.site_header = "Room Reservation Admin"
admin.site.site_title = "Room Reservation Admin"
admin.site.index_title = "Room Reservation Controls"


class ReservationAdminForm(forms.ModelForm):
    class Meta:
        model = Reservation
        fields = "__all__"

    def clean(self):
        cleaned = super().clean()
        room_type = cleaned.get("room_type")
        date = cleaned.get("date")
        slot = cleaned.get("slot")

        if room_type and date and slot is not None:
            conflict = (
                Reservation.objects.filter(room_type=room_type, date=date, slot=slot)
                .exclude(pk=self.instance.pk)
                .exists()
            )
            if conflict:
                raise forms.ValidationError(
                    "This room type is already reserved for that date and time slot."
                )
        return cleaned


class ReservationStatusFilter(admin.SimpleListFilter):
    title = "status"
    parameter_name = "status"

    def lookups(self, request, model_admin):
        return (("ongoing", "Ongoing"), ("past", "Past"))

    def queryset(self, request, queryset):
        value = self.value()
        if not value:
            return queryset

        today = timezone.localdate()
        current_hour = timezone.localtime().hour

        if value == "ongoing":
            return queryset.filter(Q(date__gt=today) | Q(date=today, slot__gte=current_hour))
        if value == "past":
            return queryset.filter(Q(date__lt=today) | Q(date=today, slot__lt=current_hour))
        return queryset


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
    form = ReservationAdminForm
    list_display = ("id", "user_email", "room_type", "date", "time_slot", "status_badge", "created_at")
    list_filter = ("room_type", "date", ReservationStatusFilter)
    search_fields = ("user__email", "user__username")
    ordering = ("-date", "slot")
    readonly_fields = ("status_display", "created_at", "updated_at")
    autocomplete_fields = ("user", "room_type")
    list_select_related = ("user", "room_type")

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset.select_related("user", "room_type")

    @admin.display(description="User", ordering="user__email")
    def user_email(self, obj: Reservation) -> str:
        return obj.user.email or obj.user.username

    @admin.display(description="Time slot", ordering="slot")
    def time_slot(self, obj: Reservation) -> str:
        return obj.get_slot_display()

    @admin.display(description="Status", ordering="date")
    def status_badge(self, obj: Reservation) -> str:
        color = "#c9b26b" if obj.is_future() else "#7e8571"
        return format_html(
            '<span style="padding:3px 8px;border-radius:999px;'
            "background-color: rgba(201, 178, 107, 0.12);"
            "border: 1px solid rgba(201, 178, 107, 0.25);"
            "color: {};"
            'font-weight: 600; font-size: 11px; letter-spacing: 0.3px;">{}</span>',
            color,
            obj.status,
        )

    @admin.display(description="Status")
    def status_display(self, obj: Reservation) -> str:
        return obj.status

    def get_readonly_fields(self, request, obj=None):
        readonly = list(super().get_readonly_fields(request, obj))
        if obj and obj.is_past():
            readonly.extend(["user", "room_type", "date", "slot"])
        return readonly

    def has_delete_permission(self, request, obj=None):
        if obj and obj.is_past():
            return False
        return super().has_delete_permission(request, obj)

    def has_change_permission(self, request, obj=None):
        has_perm = super().has_change_permission(request, obj)
        if not has_perm:
            return False
        if obj and obj.is_past():
            return request.method in ("GET", "HEAD", "OPTIONS")
        return True

    def get_actions(self, request):
        actions = super().get_actions(request)
        actions.pop("delete_selected", None)
        return actions

    def changeform_view(self, request, object_id=None, form_url="", extra_context=None):
        obj = self.get_object(request, object_id)
        extra_context = extra_context or {}
        if obj and obj.is_past():
            extra_context.update(
                {
                    "show_save": False,
                    "show_save_and_continue": False,
                    "show_save_and_add_another": False,
                    "show_delete_link": False,
                }
            )
        return super().changeform_view(request, object_id, form_url, extra_context=extra_context)

    def save_model(self, request, obj, form, change):
        # Ensure model-level validation (including double-booking check) runs before saving.
        obj.full_clean()
        return super().save_model(request, obj, form, change)

