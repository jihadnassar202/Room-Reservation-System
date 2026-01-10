from __future__ import annotations

from django.core.management.base import BaseCommand

from reservations.seed import seed_default_room_types


class Command(BaseCommand):
    help = "Seed default Room Types (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--update-existing",
            action="store_true",
            help="Update existing room types to match the default seed values.",
        )

    def handle(self, *args, **options):
        result = seed_default_room_types(update_existing=options["update_existing"])
        self.stdout.write(
            self.style.SUCCESS(
                f"Seed completed: created={result['created']} updated={result['updated']} skipped={result['skipped']}"
            )
        )


