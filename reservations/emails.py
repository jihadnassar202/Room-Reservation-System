from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date as date_type

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from .models import TimeSlot


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ReservationEmailPayload:
    to_email: str
    event: str  # created|updated|cancelled
    room_name: str
    date: date_type
    slot_value: int

    @property
    def slot_label(self) -> str:
        try:
            return TimeSlot(int(self.slot_value)).label
        except Exception:  # pragma: no cover
            return str(self.slot_value)


def send_reservation_email(payload: ReservationEmailPayload) -> bool:
    """
    Send reservation email. Returns True if attempted, False if skipped.
    Never raises (logs on failure).
    """
    if not payload.to_email:
        return False

    context = {
        "room_name": payload.room_name,
        "date": payload.date,
        "slot_label": payload.slot_label,
    }

    try:
        subject = render_to_string(f"emails/reservation_{payload.event}_subject.txt", context).strip()
        text_body = render_to_string(f"emails/reservation_{payload.event}.txt", context)
        html_body = render_to_string(f"emails/reservation_{payload.event}.html", context)

        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[payload.to_email],
        )
        if html_body:
            msg.attach_alternative(html_body, "text/html")
        msg.send(fail_silently=False)
        return True
    except Exception:
        logger.exception("Failed to send reservation email (%s) to %s", payload.event, payload.to_email)
        return True


