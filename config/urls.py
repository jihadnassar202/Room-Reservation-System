from django.contrib import admin
from django.urls import include, path
from django.utils.module_loading import autodiscover_modules
from django.views.generic import TemplateView


# Trigger admin autodiscovery to ensure all models are registered first
# This includes allauth models that auto-register themselves
autodiscover_modules("admin", register_to=admin.site)


# Unregister irrelevant models from admin after autodiscovery
# This ensures allauth models are registered first, then we remove them
def unregister_irrelevant_admin_models():
    """Remove Site and allauth models from admin index."""
    from django.contrib.sites.models import Site

    try:
        from allauth.socialaccount.models import SocialAccount, SocialApp, SocialToken
    except ImportError:
        SocialAccount = SocialApp = SocialToken = None

    models_to_unregister = [Site]
    if SocialAccount:
        models_to_unregister.extend([SocialAccount, SocialApp, SocialToken])

    for model in models_to_unregister:
        try:
            admin.site.unregister(model)
        except admin.sites.NotRegistered:
            pass


unregister_irrelevant_admin_models()


urlpatterns = [
    path("admin/", admin.site.urls),
    path("accounts/", include("accounts.urls")),
    path("social/", include("allauth.urls")),
    path("", include("reservations.urls")),
    path("", TemplateView.as_view(template_name="pages/home.html"), name="home"),
]


