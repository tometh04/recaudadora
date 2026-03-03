-- ============================================================
-- MIGRATION 00001: Initial Schema
-- Sistema de Gestión Integral - Recaudadora (Andrés)
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'contable', 'vendedor', 'operativo');
CREATE TYPE account_type AS ENUM ('banco', 'billetera', 'proveedor_saldo_virtual');
CREATE TYPE inbox_status AS ENUM (
  'recibido',
  'ocr_procesando',
  'ocr_listo',
  'pendiente_verificacion',
  'verificado',
  'rechazado',
  'aplicado',
  'duplicado'
);
CREATE TYPE inbox_source AS ENUM ('whatsapp', 'upload_manual', 'portal_b2b');
CREATE TYPE ocr_confidence AS ENUM ('alta', 'media', 'baja');
CREATE TYPE ledger_entry_type AS ENUM ('credito', 'debito');
CREATE TYPE ledger_entry_category AS ENUM (
  'deposito_verificado',
  'entrega',
  'comision',
  'ajuste_credito',
  'ajuste_debito',
  'reversa'
);
CREATE TYPE reconciliation_status AS ENUM (
  'sugerido',
  'confirmado',
  'rechazado'
);
CREATE TYPE exception_type AS ENUM (
  'ticket_sin_movimiento',
  'movimiento_sin_ticket',
  'duplicado_probable',
  'ocr_baja_confianza',
  'monto_discrepante'
);

-- ============================================================
-- 1. USERS & RBAC (extends Supabase auth.users)
-- ============================================================

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'operativo',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. AUDIT LOG (append-only)
-- ============================================================

CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent updates and deletes on audit_events
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % not allowed', TG_OP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_audit
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- ============================================================
-- 3. B2B CLIENTS (Mutuales / Empresas)
-- ============================================================

CREATE TABLE public.b2b_clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  business_name TEXT,
  tax_id TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. CLIENT PHONE MAPPING (WhatsApp → Client)
-- ============================================================

CREATE TABLE public.client_phones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.b2b_clients(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(phone_number)
);

-- ============================================================
-- 5. ACCOUNTS / CHANNELS
-- ============================================================

CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  account_type account_type NOT NULL,
  bank_name TEXT,
  account_number TEXT,
  cbu TEXT,
  alias TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. INBOX ITEMS (Comprobantes)
-- ============================================================

CREATE TABLE public.inbox_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source inbox_source NOT NULL DEFAULT 'whatsapp',
  status inbox_status NOT NULL DEFAULT 'recibido',
  -- WhatsApp metadata
  wa_message_id TEXT UNIQUE,
  wa_phone_number TEXT,
  wa_timestamp TIMESTAMPTZ,
  -- Assignments
  client_id UUID REFERENCES public.b2b_clients(id),
  account_id UUID REFERENCES public.accounts(id),
  -- OCR extracted data (editable by operator)
  amount NUMERIC(15, 2),
  transaction_date DATE,
  reference_number TEXT,
  -- OCR confidence
  ocr_amount_confidence ocr_confidence,
  ocr_date_confidence ocr_confidence,
  ocr_reference_confidence ocr_confidence,
  -- Files
  original_image_url TEXT,
  processed_image_url TEXT,
  -- Metadata
  notes TEXT,
  rejection_reason TEXT,
  assigned_to UUID REFERENCES public.profiles(id),
  processed_by UUID REFERENCES public.profiles(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. OCR RESULTS (historical)
-- ============================================================

CREATE TABLE public.ocr_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inbox_item_id UUID NOT NULL REFERENCES public.inbox_items(id) ON DELETE CASCADE,
  raw_text TEXT,
  extracted_amount NUMERIC(15, 2),
  extracted_date DATE,
  extracted_reference TEXT,
  amount_confidence REAL,
  date_confidence REAL,
  reference_confidence REAL,
  model_version TEXT,
  processing_time_ms INTEGER,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 8. STATEMENT IMPORTS (CSV/XLSX uploads)
-- ============================================================

CREATE TABLE public.statement_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id),
  filename TEXT NOT NULL,
  file_url TEXT,
  rows_total INTEGER DEFAULT 0,
  rows_imported INTEGER DEFAULT 0,
  rows_skipped INTEGER DEFAULT 0,
  import_hash TEXT,
  imported_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 9. BANK TRANSACTIONS (movimientos)
-- ============================================================

CREATE TABLE public.bank_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES public.accounts(id),
  import_id UUID REFERENCES public.statement_imports(id),
  transaction_date DATE NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  is_credit BOOLEAN NOT NULL DEFAULT true,
  reference TEXT,
  description TEXT,
  external_id TEXT,
  is_reconciled BOOLEAN NOT NULL DEFAULT false,
  source TEXT DEFAULT 'import',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, external_id)
);

-- ============================================================
-- 10. RECONCILIATIONS (matching ticket <-> movimiento)
-- ============================================================

CREATE TABLE public.reconciliations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inbox_item_id UUID NOT NULL REFERENCES public.inbox_items(id),
  bank_transaction_id UUID NOT NULL REFERENCES public.bank_transactions(id),
  status reconciliation_status NOT NULL DEFAULT 'sugerido',
  match_score REAL,
  match_reasons JSONB DEFAULT '[]',
  confirmed_by UUID REFERENCES public.profiles(id),
  confirmed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(inbox_item_id, bank_transaction_id)
);

-- ============================================================
-- 11. LEDGER ENTRIES (Cuenta corriente - append-only)
-- ============================================================

CREATE TABLE public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.b2b_clients(id),
  entry_type ledger_entry_type NOT NULL,
  category ledger_entry_category NOT NULL,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  -- References
  inbox_item_id UUID REFERENCES public.inbox_items(id),
  reconciliation_id UUID REFERENCES public.reconciliations(id),
  reversal_of UUID REFERENCES public.ledger_entries(id),
  -- Audit
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent updates/deletes on ledger (append-only + reversals)
CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only: % not allowed. Use a reversal entry.', TG_OP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_ledger
  BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

-- ============================================================
-- 12. EXCEPTIONS
-- ============================================================

CREATE TABLE public.exceptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exception_type exception_type NOT NULL,
  inbox_item_id UUID REFERENCES public.inbox_items(id),
  bank_transaction_id UUID REFERENCES public.bank_transactions(id),
  description TEXT,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Inbox
CREATE INDEX idx_inbox_status_received ON public.inbox_items(status, created_at DESC);
CREATE INDEX idx_inbox_client ON public.inbox_items(client_id, created_at DESC);
CREATE INDEX idx_inbox_account ON public.inbox_items(account_id);
CREATE INDEX idx_inbox_wa_phone ON public.inbox_items(wa_phone_number);
CREATE INDEX idx_inbox_date ON public.inbox_items(transaction_date);

-- Bank transactions
CREATE INDEX idx_bank_tx_account_date ON public.bank_transactions(account_id, transaction_date, amount);
CREATE INDEX idx_bank_tx_reconciled ON public.bank_transactions(is_reconciled, account_id);
CREATE INDEX idx_bank_tx_date ON public.bank_transactions(transaction_date DESC);

-- Ledger
CREATE INDEX idx_ledger_client ON public.ledger_entries(client_id, created_at DESC);
CREATE INDEX idx_ledger_category ON public.ledger_entries(category, created_at DESC);

-- Audit
CREATE INDEX idx_audit_entity ON public.audit_events(entity_type, entity_id);
CREATE INDEX idx_audit_user ON public.audit_events(user_id, created_at DESC);
CREATE INDEX idx_audit_date ON public.audit_events(created_at DESC);

-- Client phones
CREATE INDEX idx_client_phones_phone ON public.client_phones(phone_number);

-- Exceptions
CREATE INDEX idx_exceptions_unresolved ON public.exceptions(is_resolved, created_at DESC);

-- Reconciliations
CREATE INDEX idx_reconciliations_inbox ON public.reconciliations(inbox_item_id);
CREATE INDEX idx_reconciliations_tx ON public.reconciliations(bank_transaction_id);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_b2b_clients
  BEFORE UPDATE ON public.b2b_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_accounts
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_inbox_items
  BEFORE UPDATE ON public.inbox_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- VIEWS (Dashboard helpers)
-- ============================================================

-- Client balance view
CREATE OR REPLACE VIEW public.v_client_balances AS
SELECT
  c.id AS client_id,
  c.name AS client_name,
  COALESCE(SUM(CASE WHEN le.entry_type = 'credito' THEN le.amount ELSE 0 END), 0) AS total_credito,
  COALESCE(SUM(CASE WHEN le.entry_type = 'debito' THEN le.amount ELSE 0 END), 0) AS total_debito,
  COALESCE(SUM(CASE WHEN le.entry_type = 'credito' THEN le.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN le.entry_type = 'debito' THEN le.amount ELSE 0 END), 0) AS saldo
FROM public.b2b_clients c
LEFT JOIN public.ledger_entries le ON le.client_id = c.id
WHERE c.is_active = true
GROUP BY c.id, c.name;

-- Inbox summary view
CREATE OR REPLACE VIEW public.v_inbox_summary AS
SELECT
  status,
  COUNT(*) AS count,
  COALESCE(SUM(amount), 0) AS total_amount
FROM public.inbox_items
GROUP BY status;

-- Pending > 24h view
CREATE OR REPLACE VIEW public.v_pending_24h AS
SELECT *
FROM public.inbox_items
WHERE status IN ('recibido', 'ocr_listo', 'pendiente_verificacion')
  AND created_at < now() - INTERVAL '24 hours';

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exceptions ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users can read all, write based on role
-- (enforced at app level for MVP; RLS as safety net)

CREATE POLICY "Authenticated users can read profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Superadmin/admin can manage profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('superadmin', 'admin')
    )
  );

-- For other tables: allow all authenticated for MVP
-- (RBAC enforced at API/middleware level)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'audit_events', 'b2b_clients', 'client_phones', 'accounts',
      'inbox_items', 'ocr_results', 'statement_imports',
      'bank_transactions', 'reconciliations', 'ledger_entries', 'exceptions'
    ])
  LOOP
    EXECUTE format(
      'CREATE POLICY "Authenticated read %1$s" ON public.%1$s FOR SELECT TO authenticated USING (true)',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "Authenticated insert %1$s" ON public.%1$s FOR INSERT TO authenticated WITH CHECK (true)',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "Authenticated update %1$s" ON public.%1$s FOR UPDATE TO authenticated USING (true)',
      tbl
    );
  END LOOP;
END;
$$;
