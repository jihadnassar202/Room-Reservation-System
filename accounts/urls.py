from django.urls import path

from .views import AppLoginView, AppLogoutView, google_login_redirect, register_view


app_name = "accounts"

urlpatterns = [
    path("login/", AppLoginView.as_view(), name="login"),
    path("logout/", AppLogoutView.as_view(), name="logout"),
    path("register/", register_view, name="register"),
    path("google/login/", google_login_redirect, name="google_login_start"),
]



