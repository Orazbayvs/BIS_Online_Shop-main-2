export type UserRole =
  | 'buyer'
  | 'seller'
  | 'manager'
  | 'warehouse'
  | 'admin'
  | 'head_manager'
  | 'security_manager'
  | 'accountant';

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  role: UserRole;
  shop_name?: string | null;
  shop_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_active?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
  created_at?: string;
}

export interface Category {
  id: number;
  name: string;
  category_name?: string;
  description: string;
  is_active: boolean;
}

export interface Product {
  id: number;
  name: string;
  product_name?: string;
  sku: string;
  price: string | number;
  description: string;
  stock_qty: number;
  image_url?: string | null;
  category: number;
  category_name?: string;
  owner?: number | null;
  is_active?: boolean;
  /** Aggregate review values returned by the catalogue, detail, and top-products APIs. */
  average_rating?: number;
  rating_count?: number;
  units_sold?: number;
}

export interface ReviewAuthor {
  id: number;
  /** Customer e-mail is intentionally omitted from public review/ticket data. */
  email?: string;
  first_name?: string;
  last_name?: string;
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface ProductReview {
  id: number;
  product: number;
  rating: number;
  comment?: string;
  /** Pending and rejected reviews are visible only to their author. */
  status?: ReviewStatus;
  /** Moderator's reason, returned only to the review author. */
  moderation_note?: string;
  user: ReviewAuthor;
  created_at: string;
  updated_at?: string;
  is_owner: boolean;
}

export interface SavedProductItem {
  id: number;
  product: number;
  product_detail?: Product | null;
  created_at: string;
  /** Present for wishlist records when an out-of-stock product also entered the waitlist. */
  waitlisted?: boolean;
  /** Waitlist entries become inactive once their one-time restock alert is sent. */
  is_active?: boolean;
  notified_at?: string | null;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  product?: number | null;
  product_detail?: Product | null;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
}

export type SupportTicketStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';

export interface SupportTicket {
  id: number;
  subject: string;
  message: string;
  category?: string;
  status: SupportTicketStatus;
  response?: string | null;
  customer?: ReviewAuthor | null;
  handled_by?: ReviewAuthor | null;
  created_at: string;
  updated_at?: string;
  resolved_at?: string | null;
}

export type PaymentMethod = 'card' | 'bank_transfer' | 'cash_on_delivery';
export type PaymentStatus = 'Pending' | 'Paid' | 'Failed' | 'Refunded';
export type OrderStatus = 'New' | 'Paid' | 'Preparing' | 'Shipped' | 'Delivered' | 'Cancelled';

/**
 * A safe card reference for the demo payment record. Full card numbers,
 * expiry dates, cardholder names, and CVVs must never leave the browser.
 */
export interface Payment {
  amount: string | number;
  method: PaymentMethod;
  status: PaymentStatus;
  paid_at?: string | null;
  card_brand?: string | null;
  card_last4?: string | null;
}

export interface OrderItem {
  product: number;
  product_name: string;
  quantity: number;
  unit_price: string | number;
}

export interface Order {
  id: number;
  customer_id?: number;
  order_date: string;
  status: OrderStatus;
  delivery_address: string;
  total_amount: string | number;
  items: OrderItem[];
  payment?: Payment;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface PagedResponse<T> {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
}

export interface SalesReportRow {
  product_id: number;
  product_name: string;
  units_sold: number;
  revenue: string | number;
  stock_qty: number;
}

export interface DashboardOverview {
  [key: string]: unknown;
}

export interface AuditLogEntry {
  id: number;
  event_type: string;
  actor?: number | null;
  actor_email?: string | null;
  target_user?: number | null;
  target_user_email?: string | null;
  product?: number | null;
  order?: number | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ModerationReview {
  id: number;
  product: number;
  product_name: string;
  user: ReviewAuthor;
  rating: number;
  comment: string;
  status: ReviewStatus;
  moderation_note: string;
  moderated_by?: ReviewAuthor | null;
  moderated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModerationQueue {
  counts: Record<ReviewStatus, number>;
  results: ModerationReview[];
}

export interface ProductSuggestion {
  id: number;
  name: string;
  category_name: string;
  price: string | number;
  stock_qty: number;
}

export interface AccountingMethodRow {
  method: PaymentMethod;
  label: string;
  count: number;
  collected: string;
  refunded: string;
  receivable: string;
}

export interface AccountingSummary {
  period: { date_from: string; date_to: string };
  currency: string;
  vat_rate: string;
  order_count: number;
  cancelled_order_count: number;
  booked_sales: string;
  cancelled_value: string;
  gross_receipts: string;
  refunded: string;
  collected: string;
  net_revenue: string;
  net_revenue_excluding_vat: string;
  vat_included: string;
  receivables: string;
  failed_payments: string;
  paid_payment_count: number;
  refunded_payment_count: number;
  pending_payment_count: number;
  average_order_value: string;
  by_payment_method: AccountingMethodRow[];
  by_month: Array<{ month: string; orders: number; booked_sales: string; collected: string; refunded: string }>;
  by_category: Array<{ category: string; units: number; collected: string }>;
}

export interface AccountingTransaction {
  order_id: number;
  order_date: string;
  order_status: OrderStatus;
  customer_id: number;
  amount: string;
  method: PaymentMethod;
  payment_status: PaymentStatus;
  paid_at?: string | null;
  card_brand?: string;
}

export interface BackupEntry {
  name: string;
  size_bytes: number;
  created_at: string;
  kind: 'json' | 'sqlite';
}

export interface BackupListResponse {
  database_vendor: string;
  results: BackupEntry[];
}

export interface TokenResponse {
  access: string;
  refresh?: string;
}
