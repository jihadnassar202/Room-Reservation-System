# Room Reservation System

Django + PostgreSQL room reservation system (Task 4).

## What This Project Does

This is a full-featured web application for managing meeting room reservations. The system allows users to:

- **Check Room Availability**: View available time slots for different room types on any given date
- **Create Reservations**: Book meeting rooms for specific dates and time slots (9:00 AM - 6:00 PM, hourly slots)
- **Manage Reservations**: Edit and cancel existing reservations
- **View Personal Reservations**: See all your current and past reservations in one place
- **Email Confirmations**: Automatically receive email notifications when reservations are created, updated, or cancelled

The system includes:
- Multiple room types with different capacities and equipment
- Real-time availability checking via AJAX API
- Double-booking prevention using database constraints and row-level locking
- User authentication with both local accounts and Google OAuth (via django-allauth)
- Django admin interface for managing rooms and reservations
- RESTful API endpoints for programmatic access

## What I Learned

Through building this project, we learned and practiced:

- **Django Framework**: Building a complete web application using Django's MVT (Model-View-Template) architecture
- **Database Modeling**: Designing relational database schemas with proper relationships (ForeignKey), constraints, and indexes
- **PostgreSQL Integration**: Working with PostgreSQL as the production database, including migrations and database-specific features
- **Authentication & Authorization**: Implementing user authentication, login/logout, and protecting routes with decorators
- **Social Authentication**: Integrating OAuth 2.0 with Google using django-allauth for seamless sign-in
- **Database Concurrency**: Handling race conditions with row-level locking (`select_for_update`) and database transactions
- **Form Handling**: Creating and validating Django forms with dynamic field choices
- **REST API Development**: Building JSON APIs for AJAX interactions, including proper HTTP status codes and error handling
- **Email Functionality**: Sending transactional emails via SMTP with Django's email backend
- **Frontend Integration**: Implementing dynamic UI interactions with JavaScript and AJAX
- **Environment Configuration**: Managing sensitive configuration with environment variables and `.env` files
- **Django Admin Customization**: Extending the admin interface with custom forms, filters, and displays
- **Security Best Practices**: Using CSRF protection, secure session management, and never committing secrets
- **Time Zone Handling**: Working with timezone-aware datetimes in Django

## Demo checklist

See `DEMO_VIDEO.md`.

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

## Seed default Room Types (admin helper)

To quickly seed predefined room types (idempotent):

```bash
python3 manage.py seed_room_types
```

To also update existing rows to match the defaults:

```bash
python3 manage.py seed_room_types --update-existing
```


