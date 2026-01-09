from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.views import LoginView, LogoutView
from django.shortcuts import redirect, render
from django.urls import reverse_lazy
from django.views.decorators.http import require_http_methods

from .forms import LoginForm, RegisterForm


class AppLoginView(LoginView):
    template_name = "accounts/login.html"
    authentication_form = LoginForm
    redirect_authenticated_user = True

    def form_valid(self, form):
        messages.success(self.request, "Welcome back.")
        return super().form_valid(form)

    def form_invalid(self, form):
        messages.error(self.request, "Login failed. Please check your credentials.")
        return super().form_invalid(form)


class AppLogoutView(LogoutView):
    next_page = reverse_lazy("home")


@require_http_methods(["GET", "POST"])
def register_view(request):
    if request.user.is_authenticated:
        return redirect("home")

    form = RegisterForm(request.POST or None)

    if request.method == "POST":
        if form.is_valid():
            user = form.save()
            login(request, user)
            messages.success(request, "Account created successfully.")
            return redirect("home")
        messages.error(request, "Please fix the highlighted fields and try again.")

    return render(request, "accounts/register.html", {"form": form})


