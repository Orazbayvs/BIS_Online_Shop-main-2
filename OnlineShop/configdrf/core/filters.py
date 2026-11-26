"""Filtering and search for requests: orders, support tickets, wishlist and waiting list.

Every filter is optional, so a request without query parameters returns the same
data as before. Invalid values return a clear 400 validation error instead of being
silently ignored. Each function receives a queryset that is already limited to what
the caller may see (for example only the customer's own orders), so filters can only
narrow results, never widen access.
"""

from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation

from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import Order, Payment, SupportTicket

MAX_SEARCH_LENGTH = 120


def _search_terms(params):
    value = (params.get('search') or '').strip()[:MAX_SEARCH_LENGTH]
    return value.split()[:8]


def _choices(params, name, allowed):
    """Accept one value or a comma-separated list: ?status=New,Paid."""
    raw = (params.get(name) or '').strip()
    if not raw:
        return []
    values = [item.strip() for item in raw.split(',') if item.strip()]
    invalid = [item for item in values if item not in allowed]
    if invalid:
        raise ValidationError({name: f"Choose from: {', '.join(allowed)}."})
    return values


def _date(params, name):
    raw = params.get(name)
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except (TypeError, ValueError) as exc:
        raise ValidationError({name: 'Use the YYYY-MM-DD date format.'}) from exc


def _date_range(queryset, params, field):
    date_from = _date(params, 'date_from')
    date_to = _date(params, 'date_to')
    if date_from and date_to and date_from > date_to:
        raise ValidationError({'date_from': 'The start date must be on or before the end date.'})
    tz = timezone.get_current_timezone()
    if date_from:
        queryset = queryset.filter(**{f'{field}__gte': timezone.make_aware(datetime.combine(date_from, time.min), tz)})
    if date_to:
        end = timezone.make_aware(datetime.combine(date_to + timedelta(days=1), time.min), tz)
        queryset = queryset.filter(**{f'{field}__lt': end})
    return queryset


def _decimal(params, name):
    raw = params.get(name)
    if raw in (None, ''):
        return None
    try:
        value = Decimal(str(raw))
    except (InvalidOperation, ValueError) as exc:
        raise ValidationError({name: 'Enter a valid non-negative number.'}) from exc
    if not value.is_finite() or value < 0:
        raise ValidationError({name: 'Enter a valid non-negative number.'})
    return value


def _ordering(params, options, default):
    value = params.get('ordering') or default
    if value not in options:
        raise ValidationError({'ordering': f"Choose from: {', '.join(options)}."})
    return options[value]


def _id_term(term):
    """'#12' or '12' can mean a record number."""
    cleaned = term.lstrip('#')
    return int(cleaned) if cleaned.isdigit() and len(cleaned) <= 9 else None


ORDER_ORDERING = {
    'newest': ('-order_date', '-id'),
    'oldest': ('order_date', 'id'),
    'total': ('total_amount', 'id'),
    '-total': ('-total_amount', '-id'),
}


def filter_orders(queryset, params, *, staff=False):
    """Orders: status, payment method/status, period, total range, search, ordering.

    Customers search their order number and product names. Staff can also search the
    delivery address and filter by customer ID.
    """
    statuses = _choices(params, 'status', [value for value, _ in Order.STATUS_CHOICES])
    if statuses:
        queryset = queryset.filter(status__in=statuses)
    methods = _choices(params, 'payment_method', [value for value, _ in Payment.METHODS])
    if methods:
        queryset = queryset.filter(payment__method__in=methods)
    payment_statuses = _choices(params, 'payment_status', [value for value, _ in Payment.STATUSES])
    if payment_statuses:
        queryset = queryset.filter(payment__status__in=payment_statuses)
    queryset = _date_range(queryset, params, 'order_date')

    min_total = _decimal(params, 'min_total')
    max_total = _decimal(params, 'max_total')
    if min_total is not None and max_total is not None and min_total > max_total:
        raise ValidationError({'min_total': 'Minimum total cannot be greater than maximum total.'})
    if min_total is not None:
        queryset = queryset.filter(total_amount__gte=min_total)
    if max_total is not None:
        queryset = queryset.filter(total_amount__lte=max_total)

    if staff and params.get('customer'):
        try:
            queryset = queryset.filter(user_id=int(params['customer']))
        except (TypeError, ValueError) as exc:
            raise ValidationError({'customer': 'Customer must be a numeric ID.'}) from exc

    for term in _search_terms(params):
        condition = Q(items__product__name__icontains=term)
        order_id = _id_term(term)
        if order_id is not None:
            condition |= Q(pk=order_id)
        if staff:
            condition |= Q(delivery_address__icontains=term)
        queryset = queryset.filter(condition)

    return queryset.distinct().order_by(*_ordering(params, ORDER_ORDERING, 'newest'))


TICKET_ORDERING = {
    'updated': ('-updated_at', '-id'),
    'newest': ('-created_at', '-id'),
    'oldest': ('created_at', 'id'),
}


def filter_support_tickets(queryset, params, *, user, staff=False):
    """Support requests: status, category, period, search, staff assignment, ordering."""
    statuses = _choices(params, 'status', [value for value, _ in SupportTicket.STATUS_CHOICES])
    if statuses:
        queryset = queryset.filter(status__in=statuses)
    categories = _choices(params, 'category', [value for value, _ in SupportTicket.CATEGORY_CHOICES])
    if categories:
        queryset = queryset.filter(category__in=categories)
    queryset = _date_range(queryset, params, 'created_at')

    assigned = params.get('assigned')
    if assigned:
        if not staff:
            raise ValidationError({'assigned': 'Only support staff can filter by assignment.'})
        if assigned == 'me':
            queryset = queryset.filter(handled_by=user)
        elif assigned == 'unassigned':
            queryset = queryset.filter(handled_by__isnull=True)
        else:
            raise ValidationError({'assigned': 'Choose me or unassigned.'})

    for term in _search_terms(params):
        condition = (
            Q(subject__icontains=term)
            | Q(message__icontains=term)
            | Q(response__icontains=term)
        )
        ticket_id = _id_term(term)
        if ticket_id is not None:
            condition |= Q(pk=ticket_id)
        if staff:
            condition |= Q(customer__first_name__icontains=term) | Q(customer__last_name__icontains=term)
        queryset = queryset.filter(condition)

    return queryset.order_by(*_ordering(params, TICKET_ORDERING, 'updated'))


SAVED_ORDERING = {
    'newest': ('-created_at', '-id'),
    'oldest': ('created_at', 'id'),
    'name': ('product__name', 'id'),
    'price': ('product__price', 'id'),
    '-price': ('-product__price', '-id'),
}


def filter_saved_products(queryset, params):
    """Wishlist / waiting-list entries: search, category, availability, ordering."""
    for term in _search_terms(params):
        queryset = queryset.filter(
            Q(product__name__icontains=term)
            | Q(product__description__icontains=term)
            | Q(product__sku__iexact=term)
            | Q(product__category__name__icontains=term)
        )
    category = params.get('category')
    if category:
        try:
            queryset = queryset.filter(product__category_id=int(category))
        except (TypeError, ValueError) as exc:
            raise ValidationError({'category': 'Category must be a valid numeric ID.'}) from exc
    availability = params.get('availability')
    if availability:
        if availability == 'in_stock':
            queryset = queryset.filter(product__stock_qty__gt=0)
        elif availability == 'out_of_stock':
            queryset = queryset.filter(product__stock_qty=0)
        else:
            raise ValidationError({'availability': 'Choose in_stock or out_of_stock.'})
    return queryset.order_by(*_ordering(params, SAVED_ORDERING, 'newest'))


def filter_waitlist_status(queryset, params):
    """active = still waiting, notified = restock alert already sent.

    By default both are shown. Entries the customer removed themselves (inactive and
    never notified) are hidden, so a removed alert does not come back after a reload.
    """
    value = params.get('status') or 'all'
    if value == 'active':
        return queryset.filter(is_active=True)
    if value == 'notified':
        return queryset.filter(notified_at__isnull=False)
    if value == 'all':
        return queryset.filter(Q(is_active=True) | Q(notified_at__isnull=False))
    raise ValidationError({'status': 'Choose active, notified, or all.'})
