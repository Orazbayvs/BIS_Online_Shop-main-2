"""Database backup and restore helpers.

Backups are portable, compressed Django JSON fixtures (``*.json.gz``) so a backup
taken from SQLite can be restored into PostgreSQL and vice versa. For SQLite an
optional native snapshot (``*.sqlite3``) can also be produced with the SQLite
online-backup API; for PostgreSQL use ``pg_dump`` (see docs/BACKUP_AND_RESTORE.md).

Backup files contain password hashes and order data. They are written to
``settings.BACKUP_DIR`` (outside the web root), are only listed/downloaded by
system administrators, and file names are validated to prevent path traversal.
"""

import os
import re
import sqlite3
from datetime import datetime, timezone as dt_timezone
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.db import connection
from django.http import FileResponse, Http404
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit import record_audit_event
from .models import User

BACKUP_PREFIX = 'onlineshop'
BACKUP_NAME_RE = re.compile(r'^onlineshop-\d{8}-\d{6}(?:-[a-z0-9_]{1,20})?\.(?:json\.gz|sqlite3)$')
# Rebuilt automatically by migrate/flush, or short-lived security state.
EXCLUDED_MODELS = (
    'contenttypes',
    'auth.permission',
    'sessions',
    'token_blacklist',
)


def backup_dir() -> Path:
    path = Path(getattr(settings, 'BACKUP_DIR', Path(settings.BASE_DIR) / 'backups'))
    path.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(path, 0o700)
    except OSError:
        pass
    return path


def _stamp(label=''):
    stamp = datetime.now(dt_timezone.utc).strftime('%Y%m%d-%H%M%S')
    clean = re.sub(r'[^a-z0-9_]', '', (label or '').lower())[:20]
    return f'{BACKUP_PREFIX}-{stamp}' + (f'-{clean}' if clean else '')


def _target(label, extension) -> Path:
    """Choose a file name that matches BACKUP_NAME_RE and does not exist yet."""
    clean = re.sub(r'[^a-z0-9_]', '', (label or '').lower())[:16]
    path = backup_dir() / f'{_stamp(clean)}.{extension}'
    index = 1
    while path.exists():
        if index > 99:
            raise RuntimeError('Could not choose a unique backup file name.')
        path = backup_dir() / f'{_stamp(f"{clean}_{index}" if clean else f"n{index}")}.{extension}'
        index += 1
    return path


def create_backup(label='') -> Path:
    """Write a compressed, portable JSON fixture of the whole database."""
    target = _target(label, 'json.gz')
    call_command(
        'dumpdata',
        exclude=list(EXCLUDED_MODELS),
        natural_foreign=True,
        output=str(target),
        verbosity=0,
    )
    try:
        os.chmod(target, 0o600)
    except OSError:
        pass
    return target


def create_sqlite_snapshot(label='') -> Path:
    """Consistent native copy of a SQLite database using the online-backup API."""
    if connection.vendor != 'sqlite':
        raise RuntimeError('Native snapshots are only available for SQLite. Use pg_dump for PostgreSQL.')
    target = _target(label, 'sqlite3')
    source_name = settings.DATABASES['default']['NAME']
    source = sqlite3.connect(str(source_name))
    destination = sqlite3.connect(str(target))
    try:
        with destination:
            source.backup(destination)
    finally:
        destination.close()
        source.close()
    try:
        os.chmod(target, 0o600)
    except OSError:
        pass
    return target


def list_backups():
    entries = []
    for path in backup_dir().iterdir():
        if path.is_file() and BACKUP_NAME_RE.match(path.name):
            stat = path.stat()
            entries.append({
                'name': path.name,
                'size_bytes': stat.st_size,
                'created_at': datetime.fromtimestamp(stat.st_mtime, tz=dt_timezone.utc),
                'kind': 'sqlite' if path.name.endswith('.sqlite3') else 'json',
            })
    return sorted(entries, key=lambda item: item['name'], reverse=True)


def resolve_backup(name) -> Path:
    if not isinstance(name, str) or not BACKUP_NAME_RE.match(name):
        raise Http404('Backup not found.')
    path = backup_dir() / name
    if not path.is_file():
        raise Http404('Backup not found.')
    return path


def prune_backups(keep: int):
    """Delete the oldest backups so at most ``keep`` of each kind remain."""
    removed = []
    if keep < 1:
        return removed
    for kind in ('json', 'sqlite'):
        backups = [item for item in list_backups() if item['kind'] == kind]
        for item in backups[keep:]:
            (backup_dir() / item['name']).unlink(missing_ok=True)
            removed.append(item['name'])
    return removed


def restore_backup(path: Path):
    """Replace all data with the fixture contents (schema must already be migrated)."""
    if not path.name.endswith('.json.gz'):
        raise ValueError('Only .json.gz backups can be restored with this command.')
    call_command('flush', interactive=False, verbosity=0)
    call_command('loaddata', str(path), verbosity=0)


class IsSystemAdministrator(permissions.BasePermission):
    message = 'Only database administrators can manage backups.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            getattr(user, 'is_authenticated', False)
            and (user.is_superuser or user.role == User.ROLE_ADMIN)
        )


class BackupList(APIView):
    permission_classes = [IsSystemAdministrator]

    def get(self, request):
        return Response({
            'database_vendor': connection.vendor,
            'backup_dir_configured': bool(getattr(settings, 'BACKUP_DIR', None)),
            'results': list_backups(),
        })

    def post(self, request):
        label = str(request.data.get('label', 'manual'))[:20]
        if label and not re.fullmatch(r'[A-Za-z0-9_]*', label):
            raise ValidationError({'label': 'Use only letters, numbers, and underscores.'})
        path = create_backup(label or 'manual')
        record_audit_event(
            'database_backup_created',
            actor=request.user,
            metadata={'file': path.name, 'size_bytes': path.stat().st_size, 'source': 'api'},
        )
        entry = next(item for item in list_backups() if item['name'] == path.name)
        return Response(entry, status=status.HTTP_201_CREATED)


class BackupDownload(APIView):
    permission_classes = [IsSystemAdministrator]

    def get(self, request, name):
        path = resolve_backup(name)
        record_audit_event(
            'database_backup_downloaded',
            actor=request.user,
            metadata={'file': path.name},
        )
        return FileResponse(path.open('rb'), as_attachment=True, filename=path.name)
