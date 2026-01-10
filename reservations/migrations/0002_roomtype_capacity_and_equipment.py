from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("reservations", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="roomtype",
            name="capacity_min",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="roomtype",
            name="capacity_max",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="roomtype",
            name="default_equipment",
            field=models.JSONField(blank=True, default=list),
        ),
    ]


