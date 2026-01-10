from django.conf import settings


def oauth_flags(request):
    return {
        "GOOGLE_OAUTH_ENABLED": getattr(settings, "GOOGLE_OAUTH_ENABLED", False),
    }


