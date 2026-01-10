# Generated manually (initial migration).
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="RoomType",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("name", models.CharField(max_length=80, unique=True)),
                ("description", models.TextField(blank=True)),
                ("is_active", models.BooleanField(default=True)),
                ("display_order", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["display_order", "name"],
            },
        ),
        migrations.CreateModel(
            name="Reservation",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("date", models.DateField()),
                (
                    "slot",
                    models.PositiveSmallIntegerField(
                        choices=[
                            (9, "09:00–10:00"),
                            (10, "10:00–11:00"),
                            (11, "11:00–12:00"),
                            (12, "12:00–13:00"),
                            (13, "13:00–14:00"),
                            (14, "14:00–15:00"),
                            (15, "15:00–16:00"),
                            (16, "16:00–17:00"),
                            (17, "17:00–18:00"),
                        ]
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "room_type",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="reservations",
                        to="reservations.roomtype",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reservations",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-date", "-slot", "-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="reservation",
            index=models.Index(fields=["user", "date"], name="idx_res_user_date"),
        ),
        migrations.AddIndex(
            model_name="reservation",
            index=models.Index(fields=["room_type", "date"], name="idx_res_room_date"),
        ),
        migrations.AddConstraint(
            model_name="reservation",
            constraint=models.UniqueConstraint(
                fields=("room_type", "date", "slot"), name="unique_reservation_roomtype_date_slot"
            ),
        ),
    ]



