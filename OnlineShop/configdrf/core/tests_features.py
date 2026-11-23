"""Tests for review moderation, accounting, backups, catalogue search, and login fixes."""

import gzip
import json
import shutil
import tempfile
from decimal import Decimal
from io import StringIO
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import (
    Category,
    CustomerNotification,
    Order,
    OrderItem,
    Payment,
    Product,
    ProductReview,
    SecurityAuditLog,
)

User = get_user_model()


def make_user(email, role, **extra):
    return User.objects.create_user(
        email=email, password='Strong-pass-2026', role=role,
        first_name=email.split('@')[0], last_name='Test', address='1 Test Street', **extra,
    )


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class FeatureTestBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.buyer = make_user('buyer@example.com', 'buyer')
        self.other_buyer = make_user('other@example.com', 'buyer')
        self.manager = make_user('manager@example.com', 'manager')
        self.head = make_user('head@example.com', 'head_manager')
        self.security = make_user('security@example.com', 'security_manager')
        self.accountant = make_user('accountant@example.com', 'accountant')
        self.warehouse = make_user('warehouse@example.com', 'warehouse')
        self.admin = make_user('dba@example.com', 'admin')
        self.audio = Category.objects.create(name='Audio')
        self.home = Category.objects.create(name='Home appliances')
        self.headphones = Product.objects.create(
            name='Wireless Headphones', sku='HP-1', price='100.00', description='Noise cancelling',
            stock_qty=5, category=self.audio,
        )
        self.speaker = Product.objects.create(
            name='Bluetooth Speaker', sku='SP-1', price='250.00', description='Portable sound',
            stock_qty=0, category=self.audio,
        )
        self.kettle = Product.objects.create(
            name='Electric Kettle', sku='KT-1', price='40.00', description='Fast boil',
            stock_qty=12, category=self.home,
        )

    def make_order(self, user, product, quantity, status, payment_status, method='card'):
        order = Order.objects.create(
            user=user, status=status, delivery_address='Street 1',
            total_amount=Decimal(product.price) * quantity,
        )
        OrderItem.objects.create(order=order, product=product, quantity=quantity, unit_price=product.price)
        Payment.objects.create(
            order=order, amount=order.total_amount, method=method, status=payment_status,
            paid_at=timezone.now() if payment_status == 'Paid' else None,
        )
        return order


class ReviewModerationTests(FeatureTestBase):
    def post_review(self, user=None, rating=4, comment='Good product'):
        self.client.force_authenticate(user or self.buyer)
        return self.client.post(
            f'/api/products/{self.headphones.id}/reviews/',
            {'rating': rating, 'comment': comment}, format='json',
        )

    def test_new_review_is_pending_hidden_from_public_but_visible_to_author(self):
        created = self.post_review()
        own_view = self.client.get(f'/api/products/{self.headphones.id}/reviews/')
        self.client.force_authenticate(self.other_buyer)
        public_view = self.client.get(f'/api/products/{self.headphones.id}/reviews/')
        product = self.client.get(f'/api/products/{self.headphones.id}/')

        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data['status'], 'pending')
        self.assertEqual(len(own_view.data), 1)
        self.assertEqual(public_view.data, [])
        self.assertEqual(product.data['rating_count'], 0)

    def test_manager_approves_review_customer_is_notified_and_rating_counts(self):
        review_id = self.post_review(rating=5).data['id']
        self.client.force_authenticate(self.manager)
        queue = self.client.get('/api/reviews/moderation/')
        approved = self.client.patch(f'/api/reviews/{review_id}/moderate/', {'status': 'approved'}, format='json')
        self.client.force_authenticate(None)
        public_view = self.client.get(f'/api/products/{self.headphones.id}/reviews/')
        product = self.client.get(f'/api/products/{self.headphones.id}/')

        self.assertEqual(queue.status_code, 200)
        self.assertEqual(queue.data['counts']['pending'], 1)
        self.assertEqual([row['id'] for row in queue.data['results']], [review_id])
        self.assertNotIn('email', queue.data['results'][0]['user'])
        self.assertEqual(approved.status_code, 200)
        self.assertEqual(len(public_view.data), 1)
        self.assertEqual(product.data['average_rating'], 5.0)
        self.assertTrue(CustomerNotification.objects.filter(
            user=self.buyer, notification_type='review_moderated',
        ).exists())
        self.assertTrue(SecurityAuditLog.objects.filter(event_type='product_review_moderated').exists())

    def test_rejection_requires_reason_and_author_sees_it(self):
        review_id = self.post_review().data['id']
        self.client.force_authenticate(self.manager)
        missing_reason = self.client.patch(f'/api/reviews/{review_id}/moderate/', {'status': 'rejected'}, format='json')
        rejected = self.client.patch(
            f'/api/reviews/{review_id}/moderate/', {'status': 'rejected', 'note': 'Contains a phone number'},
            format='json',
        )
        self.client.force_authenticate(self.buyer)
        own_view = self.client.get(f'/api/products/{self.headphones.id}/reviews/')

        self.assertEqual(missing_reason.status_code, 400)
        self.assertEqual(rejected.status_code, 200)
        self.assertEqual(own_view.data[0]['status'], 'rejected')
        self.assertEqual(own_view.data[0]['moderation_note'], 'Contains a phone number')

    def test_editing_approved_review_sends_it_back_to_moderation(self):
        review = ProductReview.objects.create(product=self.headphones, user=self.buyer, rating=5)
        self.client.force_authenticate(self.buyer)
        edited = self.client.patch(
            f'/api/products/{self.headphones.id}/reviews/{review.id}/', {'rating': 2, 'comment': ''}, format='json',
        )
        review.refresh_from_db()

        self.assertEqual(edited.status_code, 200)
        self.assertEqual(review.status, 'pending')
        self.assertEqual(review.comment, '')
        self.assertEqual(self.client.get(f'/api/products/{self.headphones.id}/').data['rating_count'], 0)

    def test_only_sales_or_head_managers_can_moderate(self):
        review_id = self.post_review().data['id']
        for user in (self.buyer, self.warehouse, self.accountant, self.security):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get('/api/reviews/moderation/').status_code, 403)
            self.assertEqual(self.client.patch(
                f'/api/reviews/{review_id}/moderate/', {'status': 'approved'}, format='json',
            ).status_code, 403)
        self.client.force_authenticate(self.head)
        self.assertEqual(self.client.patch(
            f'/api/reviews/{review_id}/moderate/', {'status': 'approved'}, format='json',
        ).status_code, 200)

    def test_dashboard_reports_pending_reviews(self):
        self.post_review()
        self.client.force_authenticate(self.head)
        self.assertEqual(self.client.get('/api/dashboard/overview/').data['pending_reviews'], 1)


class AccountingTests(FeatureTestBase):
    def setUp(self):
        super().setUp()
        self.make_order(self.buyer, self.headphones, 2, 'Delivered', 'Paid')            # 200 paid
        self.make_order(self.buyer, self.kettle, 1, 'New', 'Pending', 'cash_on_delivery')  # 40 receivable
        self.make_order(self.other_buyer, self.kettle, 3, 'Cancelled', 'Refunded')      # 120 refunded
        self.make_order(self.other_buyer, self.headphones, 1, 'Cancelled', 'Failed')    # 100 failed

    def test_summary_reconciles_payments(self):
        self.client.force_authenticate(self.accountant)
        response = self.client.get('/api/accounting/summary/')
        data = response.data

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['order_count'], 2)
        self.assertEqual(data['cancelled_order_count'], 2)
        self.assertEqual(data['booked_sales'], Decimal('240.00'))
        self.assertEqual(data['collected'], Decimal('200.00'))
        self.assertEqual(data['refunded'], Decimal('120.00'))
        self.assertEqual(data['gross_receipts'], Decimal('320.00'))
        self.assertEqual(data['receivables'], Decimal('40.00'))
        self.assertEqual(data['vat_included'], Decimal('21.43'))
        self.assertEqual(data['net_revenue_excluding_vat'], Decimal('178.57'))
        self.assertEqual(data['average_order_value'], Decimal('120.00'))
        card = next(row for row in data['by_payment_method'] if row['method'] == 'card')
        self.assertEqual(card['collected'], Decimal('200.00'))
        self.assertEqual(data['by_category'][0]['category'], 'Audio')
        self.assertEqual(len(data['by_month']), 1)

    def test_transactions_filter_and_hide_customer_contact_data(self):
        self.client.force_authenticate(self.head)
        response = self.client.get('/api/accounting/transactions/?status=Paid')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        row = response.data['results'][0]
        self.assertEqual(row['amount'], Decimal('200.00'))
        self.assertNotIn('email', row)
        self.assertNotIn('delivery_address', row)

    def test_csv_export_and_audit(self):
        self.client.force_authenticate(self.accountant)
        response = self.client.get('/api/accounting/export/')
        body = response.content.decode('utf-8-sig')

        self.assertEqual(response.status_code, 200)
        self.assertIn('text/csv', response['Content-Type'])
        self.assertIn('Order ID,Order date', body)
        self.assertEqual(len(body.strip().splitlines()), 5)
        self.assertTrue(SecurityAuditLog.objects.filter(event_type='accounting_ledger_exported').exists())

    def test_period_filter_and_validation(self):
        self.client.force_authenticate(self.accountant)
        empty = self.client.get('/api/accounting/summary/?date_from=2000-01-01&date_to=2000-01-31')
        bad = self.client.get('/api/accounting/summary/?date_from=2026-02-10&date_to=2026-01-01')
        malformed = self.client.get('/api/accounting/summary/?date_from=yesterday')

        self.assertEqual(empty.data['collected'], Decimal('0.00'))
        self.assertEqual(empty.data['order_count'], 0)
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(malformed.status_code, 400)

    def test_other_roles_cannot_read_accounting(self):
        for user in (self.buyer, self.manager, self.warehouse, self.security):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get('/api/accounting/summary/').status_code, 403)
            self.assertEqual(self.client.get('/api/accounting/export/').status_code, 403)

    def test_head_manager_can_create_and_assign_accountant(self):
        self.client.force_authenticate(self.head)
        created = self.client.post('/api/users/', {
            'email': 'books@example.com', 'password': 'Very-strong-pass-2026', 'first_name': 'Book',
            'last_name': 'Keeper', 'role': 'accountant',
        }, format='json')
        reassigned = self.client.patch(f'/api/users/{self.buyer.id}/role/', {'role': 'accountant'}, format='json')

        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data['role'], 'accountant')
        self.assertEqual(reassigned.status_code, 200)


class BackupTests(FeatureTestBase):
    def setUp(self):
        super().setUp()
        self.tmp = Path(tempfile.mkdtemp())
        self.override = override_settings(BACKUP_DIR=self.tmp)
        self.override.enable()

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_backup_command_writes_portable_fixture_and_rotates(self):
        call_command('backup_db', label='nightly', stdout=StringIO())
        call_command('backup_db', label='nightly', stdout=StringIO())
        call_command('backup_db', label='nightly', keep=1, stdout=StringIO())
        files = sorted(self.tmp.glob('*.json.gz'))

        self.assertEqual(len(files), 1)
        with gzip.open(files[0], 'rt', encoding='utf-8') as handle:
            rows = json.load(handle)
        models = {row['model'] for row in rows}
        self.assertIn('core.product', models)
        self.assertIn('core.user', models)
        self.assertNotIn('contenttypes.contenttype', models)

    def test_restore_requires_confirmation(self):
        call_command('backup_db', stdout=StringIO())
        name = next(self.tmp.glob('*.json.gz')).name
        with self.assertRaises(CommandError):
            call_command('restore_db', name, stdout=StringIO())

    def test_admin_api_creates_lists_and_downloads_backup(self):
        self.client.force_authenticate(self.admin)
        created = self.client.post('/api/backups/', {'label': 'before_demo'}, format='json')
        listed = self.client.get('/api/backups/')
        download = self.client.get(f"/api/backups/{created.data['name']}/download/")

        self.assertEqual(created.status_code, 201)
        self.assertEqual(listed.data['results'][0]['name'], created.data['name'])
        self.assertEqual(download.status_code, 200)
        self.assertGreater(len(b''.join(download.streaming_content)), 100)
        self.assertTrue(SecurityAuditLog.objects.filter(event_type='database_backup_created').exists())

    def test_backup_api_is_admin_only_and_rejects_path_traversal(self):
        for user in (self.head, self.security, self.accountant, self.buyer):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get('/api/backups/').status_code, 403)
            self.assertEqual(self.client.post('/api/backups/', {}, format='json').status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get('/api/backups/..%2Fsettings.py/download/').status_code, 404)
        self.assertEqual(self.client.post('/api/backups/', {'label': '../x'}, format='json').status_code, 400)


class BackupRestoreRoundTripTests(TransactionTestCase):
    """loaddata/flush need real transactions, so this runs outside the default test wrapper."""

    def test_restore_brings_back_deleted_data(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            with override_settings(BACKUP_DIR=tmp):
                category = Category.objects.create(name='Restore me')
                Product.objects.create(
                    name='Kept product', sku='KEEP-1', price='10.00', description='x', category=category,
                )
                call_command('backup_db', label='roundtrip', stdout=StringIO())
                name = next(tmp.glob('*roundtrip*.json.gz')).name
                Product.objects.all().delete()
                call_command('restore_db', name, yes_i_understand=True, stdout=StringIO())
                self.assertTrue(Product.objects.filter(sku='KEEP-1').exists())
                self.assertTrue(any(path.name.startswith('onlineshop-') and 'prerestore' in path.name
                                    for path in tmp.iterdir()))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


class CatalogueSearchTests(FeatureTestBase):
    def ids(self, query):
        response = self.client.get(f'/api/products/{query}')
        self.assertEqual(response.status_code, 200, response.data)
        return [row['id'] for row in response.data['results']]

    def test_price_stock_and_rating_filters(self):
        ProductReview.objects.create(product=self.kettle, user=self.buyer, rating=5)
        ProductReview.objects.create(product=self.headphones, user=self.buyer, rating=2)
        ProductReview.objects.create(
            product=self.headphones, user=self.other_buyer, rating=5, status=ProductReview.STATUS_PENDING,
        )

        self.assertEqual(self.ids('?min_price=50&max_price=150'), [self.headphones.id])
        self.assertEqual(set(self.ids('?in_stock=true')), {self.headphones.id, self.kettle.id})
        self.assertEqual(self.ids('?min_rating=4'), [self.kettle.id])
        self.assertEqual(self.ids('?ordering=rating')[0], self.kettle.id)

    def test_search_matches_sku_and_category_name(self):
        self.assertEqual(self.ids('?search=kt-1'), [self.kettle.id])
        self.assertEqual(set(self.ids('?search=appliances')), {self.kettle.id})

    def test_ordering_options_and_page_size(self):
        self.make_order(self.buyer, self.kettle, 4, 'Paid', 'Paid')
        self.assertEqual(self.ids('?ordering=popular')[0], self.kettle.id)
        self.assertEqual(self.ids('?ordering=newest')[0], self.kettle.id)
        self.assertEqual(self.ids('?ordering=-price')[0], self.speaker.id)
        paged = self.client.get('/api/products/?page_size=2')
        self.assertEqual(paged.data['count'], 3)
        self.assertEqual(len(paged.data['results']), 2)
        self.assertIsNotNone(paged.data['next'])

    def test_invalid_filters_are_rejected(self):
        self.assertEqual(self.client.get('/api/products/?min_price=abc').status_code, 400)
        self.assertEqual(self.client.get('/api/products/?min_price=-1').status_code, 400)
        self.assertEqual(self.client.get('/api/products/?min_price=9&max_price=1').status_code, 400)
        self.assertEqual(self.client.get('/api/products/?min_rating=7').status_code, 400)

    def test_suggestions_prefer_prefix_matches_and_skip_inactive(self):
        Product.objects.create(
            name='Hidden Kettle', sku='HD-1', price='9.00', description='x', category=self.home, is_active=False,
        )
        Product.objects.create(name='Tea Kettle', sku='TK-1', price='15.00', description='x', category=self.home)
        response = self.client.get('/api/products/suggest/?q=ket')
        names = [row['name'] for row in response.data]

        self.assertEqual(names, ['Electric Kettle', 'Tea Kettle'])
        self.assertEqual(self.client.get('/api/products/suggest/?q=k').data, [])


class LoginTests(FeatureTestBase):
    def test_login_email_is_case_insensitive(self):
        response = self.client.post(
            '/api/login/', {'email': '  Buyer@Example.COM ', 'password': 'Strong-pass-2026'}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.data)
