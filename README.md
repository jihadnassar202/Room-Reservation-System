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


