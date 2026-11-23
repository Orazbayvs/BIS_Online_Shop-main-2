from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from core.audit import record_audit_event
from core.backup import create_backup, create_sqlite_snapshot, prune_backups


class Command(BaseCommand):
    help = (
        'Create a compressed, portable JSON backup of the database in BACKUP_DIR. '
        'Use --native for an additional SQLite snapshot and --keep to rotate old backups. '
        'Suitable for cron / Task Scheduler.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--label', default='cli', help='Short label (letters, digits, _).')
        parser.add_argument(
            '--native',
            action='store_true',
            help='Also write a native SQLite snapshot (SQLite only; use pg_dump for PostgreSQL).',
        )
        parser.add_argument(
            '--keep',
            type=int,
            default=0,
            help='Keep only the newest N backups of each kind (0 = keep everything).',
        )

    def handle(self, *args, **options):
        if options['keep'] < 0:
            raise CommandError('--keep must be zero or a positive number.')
        created = [create_backup(options['label'])]
        if options['native']:
            if connection.vendor != 'sqlite':
                raise CommandError('--native works only with SQLite. Use pg_dump for PostgreSQL.')
            created.append(create_sqlite_snapshot(options['label']))
        removed = prune_backups(options['keep']) if options['keep'] else []
        for path in created:
            self.stdout.write(self.style.SUCCESS(f'Backup written: {path}'))
            record_audit_event(
                'database_backup_created',
                metadata={'file': path.name, 'size_bytes': path.stat().st_size, 'source': 'cli'},
            )
        for name in removed:
            self.stdout.write(f'Removed old backup: {name}')
