from django import template


register = template.Library()


@register.filter
def add_class(bound_field, css_class: str):
    """
    Render a BoundField widget with CSS classes appended.
    Usage: {{ form.username|add_class:"form-control" }}
    """
    existing = bound_field.field.widget.attrs.get("class", "")
    combined = f"{existing} {css_class}".strip()
    return bound_field.as_widget(attrs={"class": combined})



