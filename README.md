# Room Reservation System

Django + PostgreSQL room reservation system (Task 4).

## Local setup (high level)

- Create and activate a virtualenv
- Install requirements from `requirements.txt`
- Configure environment variables (see `.env.example`)
- Run migrations and start the server

## Environment variables

Copy `env.example` to `.env` (or export vars in your shell) and adjust values.

Important:
- `.env` is gitignored and must never be committed.
- Set `DJANGO_SECRET_KEY` in `.env` (do not hardcode secrets in the repository).

## Google OAuth (Day 3)

This project uses `django-allauth` for Google Sign-In.

- Configure in `.env`:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `DJANGO_SITE_ID` (default `1`)
- OAuth entry point (after running the server): `/social/google/login/`
- Callback URL to whitelist in Google Console (typical local dev): `/social/google/login/callback/`

## Email confirmations (Day 3)

Reservation confirmation emails are sent on:
- Create reservation
- Update reservation
- Cancel reservation

Configure SMTP in `.env` using:
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS` / `EMAIL_USE_SSL`
- `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`
- `DEFAULT_FROM_EMAIL`

If `EMAIL_HOST` is empty, Django uses the **console email backend** (emails are printed to the terminal).


