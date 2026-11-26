import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BackupEntry } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { saveBlob } from '../../utils/download';
import { apiErrorMessage } from '../../utils/http';

@Component({
  selector: 'app-backups',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="ws-page container">
      <header class="ws-header">
        <div>
          <p class="ws-eyebrow">Database administration</p>
          <h1>Backups</h1>
          <p>Create a compressed, portable snapshot of every table. Backups contain password hashes and order data — store downloads securely.</p>
        </div>
        <button type="button" class="btn btn-secondary" (click)="load()" [disabled]="loading"><i class="fas fa-rotate" aria-hidden="true"></i> Refresh</button>
      </header>

      <form class="ws-toolbar" (ngSubmit)="create()" aria-label="Create a backup">
        <label>Label (optional)<input name="label" [(ngModel)]="label" maxlength="16" pattern="[A-Za-z0-9_]*" placeholder="before_release"></label>
        <button class="btn btn-primary btn-sm" type="submit" [disabled]="creating">
          <i class="fas fa-database" aria-hidden="true"></i> {{ creating ? 'Creating backup…' : 'Create backup now' }}
        </button>
        <span class="vendor" *ngIf="vendor">Database engine: <strong>{{ vendor }}</strong></span>
      </form>

      <p *ngIf="message" class="ws-message" [class.error]="isError" role="status">{{ message }}</p>
      <section *ngIf="loading" class="ws-empty" aria-live="polite">Loading backups…</section>

      <section *ngIf="!loading" class="ws-card">
        <h2>Available backups</h2>
        <p *ngIf="!backups.length" class="hint">No backups yet. Create one above or schedule <code>python configdrf/manage.py backup_db --keep 14</code>.</p>
        <div class="ws-table-wrap" *ngIf="backups.length">
          <table class="ws-table">
            <thead><tr><th>File</th><th>Type</th><th>Created</th><th class="num">Size</th><th><span class="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              <tr *ngFor="let backup of backups">
                <td><code>{{ backup.name }}</code></td>
                <td><span class="pill" [class.info]="backup.kind === 'json'">{{ backup.kind === 'json' ? 'Portable JSON' : 'SQLite snapshot' }}</span></td>
                <td>{{ backup.created_at | date:'medium' }}</td>
                <td class="num">{{ size(backup.size_bytes) }}</td>
                <td><button type="button" class="btn btn-secondary btn-sm" (click)="download(backup)" [disabled]="downloading === backup.name"><i class="fas fa-download" aria-hidden="true"></i> Download</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="ws-card">
        <h2>Restoring a backup</h2>
        <p class="hint">Restoring replaces all current data, so it is only available from the server command line. A safety backup of the current data is taken automatically first.</p>
        <pre><code>python configdrf/manage.py migrate
python configdrf/manage.py restore_db &lt;file-name&gt;.json.gz --yes-i-understand</code></pre>
      </section>
    </main>
  `,
  styles: [`
    .vendor { margin-left: auto; color: var(--text-light); font-size: .85rem; }
    .hint { color: var(--text-light); font-size: .9rem; }
    code { font-size: .82rem; }
    pre { margin-top: 12px; padding: 14px; overflow-x: auto; border-radius: 10px; background: var(--secondary); color: #f9fafb; }
  `],
})
export class BackupsComponent implements OnInit {
  backups: BackupEntry[] = [];
  vendor = '';
  label = '';
  loading = true;
  creating = false;
  downloading = '';
  message = '';
  isError = false;

  constructor(private readonly api: ApiService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.api.getBackups().subscribe({
      next: response => {
        this.backups = response.results;
        this.vendor = response.database_vendor;
        this.loading = false;
      },
      error: error => {
        this.loading = false;
        this.show(apiErrorMessage(error, 'We could not load the backup list.'), true);
      },
    });
  }

  create(): void {
    const label = this.label.trim();
    if (!/^[A-Za-z0-9_]*$/.test(label)) {
      this.show('Use only letters, numbers, and underscores in the label.', true);
      return;
    }
    this.creating = true;
    this.api.createBackup(label || 'manual').subscribe({
      next: backup => {
        this.creating = false;
        this.label = '';
        this.show(`Backup ${backup.name} created (${this.size(backup.size_bytes)}).`);
        this.load();
      },
      error: error => {
        this.creating = false;
        this.show(apiErrorMessage(error, 'The backup could not be created.'), true);
      },
    });
  }

  download(backup: BackupEntry): void {
    this.downloading = backup.name;
    this.api.downloadBackup(backup.name).subscribe({
      next: blob => {
        this.downloading = '';
        saveBlob(blob, backup.name);
      },
      error: error => {
        this.downloading = '';
        this.show(apiErrorMessage(error, 'The backup could not be downloaded.'), true);
      },
    });
  }

  size(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  private show(message: string, isError = false): void {
    this.message = message;
    this.isError = isError;
  }
}
