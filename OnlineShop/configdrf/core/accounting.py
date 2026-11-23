"""Accounting (bookkeeping) reports built from orders and payment records.

Definitions used by every report so figures always reconcile:

* **Booked sales** - total of orders that were not cancelled in the period.
* **Collected** - payments whose status is ``Paid`` (money actually received).
* **Refunded** - payments that were collected and later returned (``Refunded``).
* **Gross receipts** - collected + refunded (everything that was ever received).
* **Receivables** - ``Pending`` payments on orders that are still active
  (for example cash on delivery that has not been delivered yet).
* **VAT included** - the VAT portion contained in the collected amount. Prices are
  VAT-inclusive, so VAT = collected * rate / (100 + rate).

Only accountants, head managers, and system administrators can read these reports.
They expose customer IDs but never names, e-mail, addresses, or card numbers.
"""

import csv
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db.models import Count, DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncMonth
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import permissions
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit import record_audit_event
from .models import Order, OrderItem, Payment, User

MONEY = DecimalField(max_digits=14, decimal_places=2)
ZERO = Value(Decimal('0.00'), output_field=MONEY)
CENT = Decimal('0.01')
MAX_PERIOD_DAYS = 3660


def _money(value):
    return (Decimal(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def vat_rate():
    return Decimal(str(getattr(settings, 'ACCOUNTING_VAT_RATE', '12')))


class IsAccountant(permissions.BasePermission):
    message = 'Only accountants, head managers, and administrators can view accounting data.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            getattr(user, 'is_authenticated', False)
            and (
                user.is_superuser
                or user.role in (User.ROLE_ACCOUNTANT, User.ROLE_HEAD_MANAGER, User.ROLE_ADMIN)
            )
        )


def _parse_date(value, name):
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError({name: 'Use the YYYY-MM-DD date format.'}) from exc


def accounting_period(params):
    """Return (date_from, date_to, start_datetime, end_datetime_exclusive)."""
    today = timezone.localdate()
    date_to = _parse_date(params['date_to'], 'date_to') if params.get('date_to') else today
    date_from = (
        _parse_date(params['date_from'], 'date_from')
        if params.get('date_from')
        else date_to - timedelta(days=29)
    )
    if date_from > date_to:
        raise ValidationError({'date_from': 'The start date must be on or before the end date.'})
    if (date_to - date_from).days > MAX_PERIOD_DAYS:
        raise ValidationError({'date_from': 'Choose a period of at most 10 years.'})
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(date_from, time.min), tz)
    end = timezone.make_aware(datetime.combine(date_to + timedelta(days=1), time.min), tz)
    return date_from, date_to, start, end


def _payment_totals(payments):
    return payments.aggregate(
        collected=Coalesce(Sum('amount', filter=Q(status='Paid')), ZERO),
        refunded=Coalesce(Sum('amount', filter=Q(status='Refunded')), ZERO),
        receivable=Coalesce(
            Sum('amount', filter=Q(status='Pending') & ~Q(order__status='Cancelled')),
            ZERO,
        ),
        failed=Coalesce(Sum('amount', filter=Q(status='Failed')), ZERO),
        paid_count=Count('id', filter=Q(status='Paid')),
        refunded_count=Count('id', filter=Q(status='Refunded')),
        pending_count=Count('id', filter=Q(status='Pending') & ~Q(order__status='Cancelled')),
    )


def build_summary(params):
    date_from, date_to, start, end = accounting_period(params)
    orders = Order.objects.filter(order_date__gte=start, order_date__lt=end)
    active_orders = orders.exclude(status='Cancelled')
    payments = Payment.objects.filter(order__in=orders)

    order_totals = orders.aggregate(
        order_count=Count('id', filter=~Q(status='Cancelled')),
        cancelled_count=Count('id', filter=Q(status='Cancelled')),
        booked_sales=Coalesce(Sum('total_amount', filter=~Q(status='Cancelled')), ZERO),
        cancelled_value=Coalesce(Sum('total_amount', filter=Q(status='Cancelled')), ZERO),
    )
    totals = _payment_totals(payments)
    collected = _money(totals['collected'])
    refunded = _money(totals['refunded'])
    rate = vat_rate()
    vat_included = _money(collected * rate / (Decimal('100') + rate)) if rate > 0 else Decimal('0.00')
    order_count = order_totals['order_count']
    booked_sales = _money(order_totals['booked_sales'])

    by_method = []
    method_rows = {
        row['method']: row
        for row in payments.values('method').annotate(
            count=Count('id'),
            collected=Coalesce(Sum('amount', filter=Q(status='Paid')), ZERO),
            refunded=Coalesce(Sum('amount', filter=Q(status='Refunded')), ZERO),
            receivable=Coalesce(
                Sum('amount', filter=Q(status='Pending') & ~Q(order__status='Cancelled')),
                ZERO,
            ),
        )
    }
    for method, label in Payment.METHODS:
        row = method_rows.get(method, {})
        by_method.append({
            'method': method,
            'label': label,
            'count': row.get('count', 0),
            'collected': _money(row.get('collected')),
            'refunded': _money(row.get('refunded')),
            'receivable': _money(row.get('receivable')),
        })

    by_month = [
        {
            'month': row['month'].date().isoformat() if hasattr(row['month'], 'date') else str(row['month']),
            'orders': row['orders'],
            'booked_sales': _money(row['booked_sales']),
            'collected': _money(row['collected']),
            'refunded': _money(row['refunded']),
        }
        for row in orders.annotate(month=TruncMonth('order_date'))
        .values('month')
        .annotate(
            orders=Count('id', filter=~Q(status='Cancelled')),
            booked_sales=Coalesce(Sum('total_amount', filter=~Q(status='Cancelled')), ZERO),
            collected=Coalesce(Sum('payment__amount', filter=Q(payment__status='Paid')), ZERO),
            refunded=Coalesce(Sum('payment__amount', filter=Q(payment__status='Refunded')), ZERO),
        )
        .order_by('month')
    ]

    by_category = [
        {
            'category': row['product__category__name'],
            'units': row['units'],
            'collected': _money(row['collected']),
        }
        for row in OrderItem.objects.filter(order__in=active_orders, order__payment__status='Paid')
        .values('product__category__name')
        .annotate(
            units=Sum('quantity'),
            collected=Coalesce(Sum(F('quantity') * F('unit_price'), output_field=MONEY), ZERO),
        )
        .order_by('-collected', 'product__category__name')
    ]

    return {
        'period': {'date_from': date_from.isoformat(), 'date_to': date_to.isoformat()},
        'currency': 'KZT',
        'vat_rate': rate,
        'order_count': order_count,
        'cancelled_order_count': order_totals['cancelled_count'],
        'booked_sales': booked_sales,
        'cancelled_value': _money(order_totals['cancelled_value']),
        'gross_receipts': _money(collected + refunded),
        'refunded': refunded,
        'collected': collected,
        'net_revenue': collected,
        'net_revenue_excluding_vat': _money(collected - vat_included),
        'vat_included': vat_included,
        'receivables': _money(totals['receivable']),
        'failed_payments': _money(totals['failed']),
        'paid_payment_count': totals['paid_count'],
        'refunded_payment_count': totals['refunded_count'],
        'pending_payment_count': totals['pending_count'],
        'average_order_value': _money(booked_sales / order_count) if order_count else Decimal('0.00'),
        'by_payment_method': by_method,
        'by_month': by_month,
        'by_category': by_category,
    }


def transaction_queryset(params):
    _, _, start, end = accounting_period(params)
    payments = Payment.objects.select_related('order').filter(
        order__order_date__gte=start,
        order__order_date__lt=end,
    )
    payment_status = params.get('status')
    if payment_status:
        if payment_status not in dict(Payment.STATUSES):
            raise ValidationError({'status': 'Choose Pending, Paid, Failed, or Refunded.'})
        payments = payments.filter(status=payment_status)
    method = params.get('method')
    if method:
        if method not in dict(Payment.METHODS):
            raise ValidationError({'method': 'Choose card, bank_transfer, or cash_on_delivery.'})
        payments = payments.filter(method=method)
    return payments.order_by('-order__order_date', '-order_id')


def transaction_row(payment):
    order = payment.order
    return {
        'order_id': order.id,
        'order_date': order.order_date,
        'order_status': order.status,
        'customer_id': order.user_id,
        'amount': _money(payment.amount),
        'method': payment.method,
        'payment_status': payment.status,
        'paid_at': payment.paid_at,
        'card_brand': payment.card_brand,
    }


class AccountingSummary(APIView):
    permission_classes = [IsAccountant]

    def get(self, request):
        return Response(build_summary(request.query_params))


class AccountingTransactions(APIView):
    permission_classes = [IsAccountant]

    def get(self, request):
        try:
            limit = min(max(int(request.query_params.get('limit', 200)), 1), 1000)
        except (TypeError, ValueError) as exc:
            raise ValidationError({'limit': 'Limit must be a whole number.'}) from exc
        payments = transaction_queryset(request.query_params)
        total = payments.count()
        return Response({
            'count': total,
            'results': [transaction_row(payment) for payment in payments[:limit]],
        })


class AccountingExport(APIView):
    """CSV ledger for spreadsheets / 1C import. Formula-like cells are neutralised."""

    permission_classes = [IsAccountant]

    @staticmethod
    def _safe(value):
        text = '' if value is None else str(value)
        return "'" + text if text[:1] in ('=', '+', '-', '@') else text

    def get(self, request):
        date_from, date_to, _, _ = accounting_period(request.query_params)
        payments = transaction_queryset(request.query_params)
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        filename = f'onlineshop-ledger-{date_from.isoformat()}-{date_to.isoformat()}.csv'
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.write('﻿')  # Excel opens UTF-8 correctly with a BOM.
        writer = csv.writer(response)
        writer.writerow([
            'Order ID', 'Order date', 'Order status', 'Customer ID', 'Amount (KZT)',
            'Payment method', 'Payment status', 'Paid at', 'Card brand',
        ])
        for payment in payments.iterator():
            row = transaction_row(payment)
            writer.writerow([self._safe(value) for value in (
                row['order_id'],
                timezone.localtime(row['order_date']).strftime('%Y-%m-%d %H:%M'),
                row['order_status'],
                row['customer_id'],
                row['amount'],
                row['method'],
                row['payment_status'],
                timezone.localtime(row['paid_at']).strftime('%Y-%m-%d %H:%M') if row['paid_at'] else '',
                row['card_brand'],
            )])
        record_audit_event(
            'accounting_ledger_exported',
            actor=request.user,
            metadata={'date_from': date_from.isoformat(), 'date_to': date_to.isoformat()},
        )
        return response
