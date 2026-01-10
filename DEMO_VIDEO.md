# Demo video checklist (Task 4)

Use this as a step-by-step script for your submission video.

## Pre-demo setup (quick)

- Ensure `.env` exists locally (never commit it) and contains:
  - `DJANGO_SECRET_KEY`
  - DB settings (`POSTGRES_*`) or `USE_SQLITE=1` for local-only smoke tests
- Ensure at least 2–3 `RoomType` rows exist (Admin → Room Types), e.g.:
  - Single
  - Double
  - Meeting Room
  - Conference Room

## 1) Authentication

- Show **Register** and **Login** pages (Bootstrap UI, no alerts).
- Register a user (include an email if you want to demonstrate email confirmations).
- Login/logout.

## 2) Google Sign-In (OAuth) (Day 3 feature)

- Show that the “Continue with Google” button is enabled only when configured.
- Google Console config (local dev):
  - Authorized JS origin: `http://localhost:8000`
  - Redirect URI: `http://localhost:8000/social/google/login/callback/`
- Sign in with Google successfully and land back in the app.

## 3) Checkout page + dynamic availability (AJAX)

- Open **Checkout**.
- Change date → availability table refreshes **without full reload**.
- Use room filter → rows filter instantly (client-side).
- Point out **reserved slots** are disabled/red.

## 4) Create reservation (no double booking)

- From Checkout:
  - Click an available slot → click “Reserve selected slot”
  - Confirm in modal → success toast → table refreshes
- In another browser/incognito (or another user):
  - Confirm the slot is now reserved/disabled
  - Attempt to reserve the same slot → show conflict toast (409 handling) + table refresh

## 5) Create reservation (form page)

- Open **New Reservation** page.
- Change date / room type:
  - Slot dropdown updates dynamically (debounced AJAX)
  - Only available slots appear
  - Slot badges show reserved vs available
- Reserve → confirm modal → toast → redirect to “My Reservations”.

## 6) My Reservations (Upcoming vs Past)

- Show **Upcoming** reservations:
  - Edit button is available
  - Cancel uses confirm modal + AJAX + toast (no reload)
- Show **Past** reservations:
  - View-only (no edit/cancel)

## 7) Edit reservation (future-only)

- From “My Reservations” → click **Edit**:
  - Change date/type → live availability updates (AJAX)
  - Save changes → confirm modal → toast → back to “My Reservations”

## 8) Email confirmations (Day 3 feature)

- If `EMAIL_HOST` is not set, emails print to terminal (console backend):
  - Create / Edit / Cancel a reservation and show the email output.
- If SMTP is configured:
  - Show an email received for create/update/cancel.

## Final notes to mention

- UI feedback uses **toasts** and **modals** only (no alerts).
- Double-booking is prevented with:
  - DB unique constraint `(room_type, date, slot)`
  - `transaction.atomic()` + row-level locking (`select_for_update`)
  - Clean conflict handling (409) on the UI.


