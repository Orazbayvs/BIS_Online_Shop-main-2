import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ModerationReview, ReviewStatus } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { apiErrorMessage } from '../../utils/http';

type Filter = ReviewStatus | 'all';

@Component({
  selector: 'app-review-moderation',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="ws-page container">
      <header class="ws-header">
        <div>
          <p class="ws-eyebrow">Customer feedback</p>
          <h1>Review moderation</h1>
          <p>New and edited reviews stay hidden until approved. Rejected reviews are returned to their author with your reason.</p>
        </div>
        <button type="button" class="btn btn-secondary" (click)="load()" [disabled]="loading">
          <i class="fas fa-rotate" aria-hidden="true"></i> Refresh
        </button>
      </header>

      <nav class="ws-tabs" aria-label="Review status">
        <button *ngFor="let tab of tabs" type="button" [class.active]="filter === tab.value" (click)="setFilter(tab.value)">
          {{ tab.label }}<span class="count" *ngIf="tab.value !== 'all'">{{ counts[tab.value] ?? 0 }}</span>
        </button>
      </nav>

      <p *ngIf="message" class="ws-message" [class.error]="isError" role="status">{{ message }}</p>
      <section *ngIf="loading" class="ws-empty" aria-live="polite">Loading reviews…</section>
      <section *ngIf="!loading && !reviews.length" class="ws-empty ws-card">
        <i class="fas fa-circle-check fa-2x" aria-hidden="true"></i>
        <h2>{{ filter === 'pending' ? 'All caught up' : 'Nothing here' }}</h2>
        <p>{{ filter === 'pending' ? 'There are no reviews waiting for moderation.' : 'No reviews match this filter.' }}</p>
      </section>

      <section *ngIf="!loading && reviews.length" class="review-list">
        <article *ngFor="let review of reviews" class="ws-card review">
          <header>
            <div>
              <a [routerLink]="['/products', review.product]" class="product">{{ review.product_name }}</a>
              <p class="meta">
                <span class="stars" [attr.aria-label]="review.rating + ' out of 5 stars'"><span *ngFor="let star of stars" [class.on]="star <= review.rating" aria-hidden="true">★</span></span>
                · {{ author(review) }} · {{ review.updated_at | date:'medium' }}
              </p>
            </div>
            <span class="pill" [class.warn]="review.status === 'pending'" [class.ok]="review.status === 'approved'" [class.bad]="review.status === 'rejected'">{{ statusLabel(review.status) }}</span>
          </header>
          <p class="comment" *ngIf="review.comment; else noComment">{{ review.comment }}</p>
          <ng-template #noComment><p class="comment muted">Rating only — no written comment.</p></ng-template>
          <p *ngIf="review.status !== 'pending' && review.moderated_by" class="decision">
            {{ review.status === 'approved' ? 'Approved' : 'Rejected' }} by {{ author({ user: review.moderated_by }) }}
            <ng-container *ngIf="review.moderated_at"> · {{ review.moderated_at | date:'short' }}</ng-container>
            <ng-container *ngIf="review.moderation_note"> — “{{ review.moderation_note }}”</ng-container>
          </p>
          <div class="decide">
            <label class="ws-field note">
              <span>Reason (required to reject)</span>
              <input [name]="'note-' + review.id" [(ngModel)]="notes[review.id]" maxlength="250" placeholder="e.g. contains personal data, off-topic, offensive language">
            </label>
            <div class="ws-actions">
              <button type="button" class="btn btn-success btn-sm" (click)="decide(review, 'approved')" [disabled]="pendingId === review.id || review.status === 'approved'">
                <i class="fas fa-check" aria-hidden="true"></i> Approve
              </button>
              <button type="button" class="btn btn-danger btn-sm" (click)="decide(review, 'rejected')" [disabled]="pendingId === review.id || review.status === 'rejected'">
                <i class="fas fa-xmark" aria-hidden="true"></i> Reject
              </button>
            </div>
          </div>
        </article>
      </section>
    </main>
  `,
  styles: [`
    .review-list { display: grid; gap: 14px; }
    .review header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .product { color: var(--secondary); font-weight: 800; font-size: 1.05rem; }
    .product:hover { color: var(--primary-dark); }
    .meta { color: var(--text-light); font-size: .85rem; }
    .stars span { color: #d1d5db; }
    .stars span.on { color: #eab308; }
    .comment { margin: 12px 0; white-space: pre-line; line-height: 1.55; }
    .comment.muted, .decision { color: var(--text-light); font-size: .88rem; }
    .decision { margin-bottom: 10px; }
    .decide { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--border); }
    .note { flex: 1 1 320px; }
  `],
})
export class ReviewModerationComponent implements OnInit {
  reviews: ModerationReview[] = [];
  counts: Partial<Record<ReviewStatus, number>> = {};
  notes: Record<number, string> = {};
  filter: Filter = 'pending';
  loading = true;
  pendingId: number | null = null;
  message = '';
  isError = false;
  readonly stars = [1, 2, 3, 4, 5];
  readonly tabs: Array<{ value: Filter; label: string }> = [
    { value: 'pending', label: 'Waiting' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'all', label: 'All' },
  ];

  constructor(private readonly api: ApiService) {}

  ngOnInit(): void {
    this.load();
  }

  setFilter(filter: Filter): void {
    if (this.filter === filter) return;
    this.filter = filter;
    this.message = '';
    this.load();
  }

  load(): void {
    this.loading = true;
    this.api.getModerationQueue(this.filter).subscribe({
      next: queue => {
        this.reviews = queue.results;
        this.counts = queue.counts;
        this.loading = false;
      },
      error: error => {
        this.loading = false;
        this.reviews = [];
        this.showMessage(apiErrorMessage(error, 'We could not load reviews for moderation.'), true);
      },
    });
  }

  decide(review: ModerationReview, status: 'approved' | 'rejected'): void {
    const note = (this.notes[review.id] ?? '').trim();
    if (status === 'rejected' && note.length < 3) {
      this.showMessage('Enter a reason (at least 3 characters) before rejecting a review.', true);
      return;
    }
    this.pendingId = review.id;
    this.api.moderateReview(review.id, { status, note }).subscribe({
      next: updated => {
        this.pendingId = null;
        delete this.notes[review.id];
        this.showMessage(`Review of ${updated.product_name} ${status === 'approved' ? 'approved and published' : 'rejected'}. The customer was notified.`);
        this.load();
      },
      error: error => {
        this.pendingId = null;
        this.showMessage(apiErrorMessage(error, 'We could not save this decision.'), true);
      },
    });
  }

  author(review: { user?: { first_name?: string; last_name?: string } | null }): string {
    const user = review.user;
    return [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Customer';
  }

  statusLabel(status: ReviewStatus): string {
    return status === 'pending' ? 'Waiting' : status === 'approved' ? 'Published' : 'Rejected';
  }

  private showMessage(message: string, isError = false): void {
    this.message = message;
    this.isError = isError;
  }
}
