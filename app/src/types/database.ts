export type UserRole = 'superadmin' | 'admin' | 'contable' | 'vendedor' | 'operativo';
export type AccountType = 'banco' | 'billetera' | 'proveedor_saldo_virtual';
export type InboxStatus =
  | 'recibido'
  | 'ocr_procesando'
  | 'ocr_listo'
  | 'pendiente_verificacion'
  | 'verificado'
  | 'rechazado'
  | 'aplicado'
  | 'duplicado'
  | 'descartado';
export type InboxSource = 'whatsapp' | 'upload_manual' | 'portal_b2b';
export type OcrConfidence = 'alta' | 'media' | 'baja';
export type LedgerEntryType = 'credito' | 'debito';
export type LedgerEntryCategory =
  | 'deposito_verificado'
  | 'entrega'
  | 'comision'
  | 'ajuste_credito'
  | 'ajuste_debito'
  | 'reversa';
export type ReconciliationStatus = 'sugerido' | 'confirmado' | 'rechazado';
export type ExceptionType =
  | 'ticket_sin_movimiento'
  | 'movimiento_sin_ticket'
  | 'duplicado_probable'
  | 'ocr_baja_confianza'
  | 'monto_discrepante';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface B2BClient {
  id: string;
  name: string;
  business_name: string | null;
  tax_id: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientPhone {
  id: string;
  client_id: string;
  phone_number: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Account {
  id: string;
  name: string;
  account_type: AccountType;
  bank_name: string | null;
  account_number: string | null;
  cbu: string | null;
  alias: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InboxItem {
  id: string;
  source: InboxSource;
  status: InboxStatus;
  wa_message_id: string | null;
  wa_phone_number: string | null;
  wa_timestamp: string | null;
  client_id: string | null;
  account_id: string | null;
  amount: number | null;
  transaction_date: string | null;
  reference_number: string | null;
  ocr_amount_confidence: OcrConfidence | null;
  ocr_date_confidence: OcrConfidence | null;
  ocr_reference_confidence: OcrConfidence | null;
  original_image_url: string | null;
  processed_image_url: string | null;
  notes: string | null;
  rejection_reason: string | null;
  assigned_to: string | null;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  client?: B2BClient;
  account?: Account;
}

export interface LedgerEntry {
  id: string;
  client_id: string;
  entry_type: LedgerEntryType;
  category: LedgerEntryCategory;
  amount: number;
  description: string;
  inbox_item_id: string | null;
  reconciliation_id: string | null;
  reversal_of: string | null;
  created_by: string;
  reason: string | null;
  created_at: string;
  // Joined
  client?: B2BClient;
  creator?: Profile;
}

export interface BankTransaction {
  id: string;
  account_id: string;
  import_id: string | null;
  transaction_date: string;
  amount: number;
  is_credit: boolean;
  reference: string | null;
  description: string | null;
  external_id: string | null;
  is_reconciled: boolean;
  source: string;
  created_by: string | null;
  created_at: string;
  account?: Account;
}

export interface Reconciliation {
  id: string;
  inbox_item_id: string;
  bank_transaction_id: string;
  status: ReconciliationStatus;
  match_score: number | null;
  match_reasons: string[];
  confirmed_by: string | null;
  confirmed_at: string | null;
  notes: string | null;
  created_at: string;
  inbox_item?: InboxItem;
  bank_transaction?: BankTransaction;
}

export interface AuditEvent {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  user?: Profile;
}

export interface ClientBalance {
  client_id: string;
  client_name: string;
  total_credito: number;
  total_debito: number;
  saldo: number;
}

export interface InboxSummary {
  status: InboxStatus;
  count: number;
  total_amount: number;
}

// Dashboard stats
export interface DashboardStats {
  total_recibidos: number;
  total_verificados: number;
  total_pendientes: number;
  total_pendientes_24h: number;
  monto_recibido: number;
  monto_verificado: number;
  monto_pendiente: number;
  client_balances: ClientBalance[];
  inbox_summary: InboxSummary[];
}
