from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from core.audit import record_audit_event
from core.backup import backup_dir, create_backup, restore_backup


class Command(BaseCommand):
    help = (
        'Restore a .json.gz backup created by backup_db. ALL current data is replaced. '
        'A safety backup of the current data is written first. Run migrate before restoring.'
    )

    def add_arguments(self, parser):
        parser.add_argument('backup', help='Backup file name in BACKUP_DIR, or a path to a .json.gz file.')
        parser.add_argument(
            '--yes-i-understand',
            action='store_true',
            dest='confirmed',
            help='Required: confirms that every current row will be replaced.',
        )
        parser.add_argument(
            '--skip-safety-backup',
            action='store_true',
            help='Do not back up the current data first (not recommended).',
        )

    def handle(self, *args, **options):
        candidate = Path(options['backup'])
        path = candidate if candidate.is_file() else backup_dir() / candidate.name
        if not path.is_file():
            raise CommandError(f'Backup not found: {options["backup"]}')
        if not path.name.endswith('.json.gz'):
            raise CommandError('Only .json.gz backups can be restored. Restore SQLite/pg_dump files with their native tools.')
        if not options['confirmed']:
            raise CommandError('Restoring replaces ALL data. Re-run with --yes-i-understand to continue.')

        if not options['skip_safety_backup']:
            safety = create_backup('prerestore')
            self.stdout.write(f'Safety backup of current data: {safety}')
        try:
            restore_backup(path)
        except Exception as exc:  # noqa: BLE001 - report any loaddata problem clearly
            raise CommandError(f'Restore failed: {exc}') from exc
        record_audit_event('database_backup_restored', metadata={'file': path.name})
        self.stdout.write(self.style.SUCCESS(f'Database restored from {path.name}.'))
