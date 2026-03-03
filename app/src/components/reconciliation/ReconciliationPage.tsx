'use client';

import { useState, useEffect } from 'react';
import { isDemoMode } from '@/lib/use-demo';
import {
  DEMO_INBOX,
  DEMO_BANK_TRANSACTIONS,
  DEMO_ACCOUNTS,
} from '@/lib/demo-data';
import {
  GitCompareArrows,
  Upload,
  CheckCircle,
  XCircle,
  AlertTriangle,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { InboxItem, BankTransaction, Account } from '@/types/database';

export default function ReconciliationPage() {
  const [unmatched, setUnmatched] = useState<InboxItem[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [suggestions, setSuggestions] = useState<
    { inbox: InboxItem; tx: BankTransaction; score: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  function buildSuggestions(
    inbox: InboxItem[],
    txs: BankTransaction[]
  ): { inbox: InboxItem; tx: BankTransaction; score: number }[] {
    const sugs: { inbox: InboxItem; tx: BankTransaction; score: number }[] = [];
    for (const item of inbox) {
      if (!item.amount) continue;
      for (const tx of txs) {
        if (!tx.is_credit) continue;
        const amountDiff = Math.abs(item.amount - tx.amount);
        if (amountDiff < 0.01) {
          sugs.push({ inbox: item, tx, score: 100 });
        } else if (amountDiff / item.amount < 0.02) {
          sugs.push({ inbox: item, tx, score: 80 });
        }
      }
    }
    sugs.sort((a, b) => b.score - a.score);
    return sugs;
  }

  async function loadData() {
    setLoading(true);

    if (isDemoMode()) {
      const inbox = DEMO_INBOX.filter((i) =>
        ['verificado', 'pendiente_verificacion', 'ocr_listo'].includes(i.status)
      );
      const txs = DEMO_BANK_TRANSACTIONS.filter((t) => !t.is_reconciled);
      setUnmatched(inbox);
      setTransactions(txs);
      setAccounts(DEMO_ACCOUNTS);
      setSuggestions(buildSuggestions(inbox, txs));
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const [inboxRes, txRes, accountsRes] = await Promise.all([
      supabase
        .from('inbox_items')
        .select('*, client:b2b_clients(name), account:accounts(name)')
        .in('status', ['verificado', 'pendiente_verificacion', 'ocr_listo'])
        .order('created_at', { ascending: false }),
      supabase
        .from('bank_transactions')
        .select('*, account:accounts(name)')
        .eq('is_reconciled', false)
        .order('transaction_date', { ascending: false }),
      supabase.from('accounts').select('*').eq('is_active', true),
    ]);

    const inbox = (inboxRes.data as InboxItem[]) || [];
    const txs = (txRes.data as BankTransaction[]) || [];
    setUnmatched(inbox);
    setTransactions(txs);
    setAccounts((accountsRes.data as Account[]) || []);
    setSuggestions(buildSuggestions(inbox, txs));
    setLoading(false);
  }

  async function confirmMatch(inboxId: string, txId: string) {
    if (isDemoMode()) {
      setUnmatched((prev) => prev.filter((i) => i.id !== inboxId));
      setTransactions((prev) => prev.filter((t) => t.id !== txId));
      setSuggestions((prev) =>
        prev.filter((s) => s.inbox.id !== inboxId && s.tx.id !== txId)
      );
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from('reconciliations').insert({
      inbox_item_id: inboxId,
      bank_transaction_id: txId,
      status: 'confirmado',
      confirmed_by: user?.id,
      confirmed_at: new Date().toISOString(),
      match_score: 100,
    });

    await supabase
      .from('inbox_items')
      .update({ status: 'verificado' })
      .eq('id', inboxId);
    await supabase
      .from('bank_transactions')
      .update({ is_reconciled: true })
      .eq('id', txId);

    await supabase.from('audit_events').insert({
      user_id: user?.id,
      action: 'reconciliation_confirmed',
      entity_type: 'reconciliations',
      after_data: { inbox_item_id: inboxId, bank_transaction_id: txId },
    });

    loadData();
  }

  function rejectSuggestion(inboxId: string, txId: string) {
    setSuggestions((prev) =>
      prev.filter((s) => !(s.inbox.id === inboxId && s.tx.id === txId))
    );
  }

  async function handleImportCSV(file: File, accountId: string) {
    if (isDemoMode()) {
      setShowImport(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const text = await file.text();
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: importRecord } = await supabase
      .from('statement_imports')
      .insert({
        account_id: accountId,
        filename: file.name,
        rows_total: lines.length - 1,
        imported_by: user?.id,
      })
      .select()
      .single();

    const headers = lines[0].toLowerCase().split(',').map((h) => h.trim());
    let imported = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      if (cols.length < 2) continue;

      const dateIdx = headers.findIndex(
        (h) => h.includes('fecha') || h.includes('date')
      );
      const amountIdx = headers.findIndex(
        (h) =>
          h.includes('monto') || h.includes('amount') || h.includes('importe')
      );
      const refIdx = headers.findIndex(
        (h) => h.includes('ref') || h.includes('comprobante')
      );
      const descIdx = headers.findIndex(
        (h) => h.includes('desc') || h.includes('concepto')
      );

      const rawAmount = parseFloat(
        (cols[amountIdx >= 0 ? amountIdx : 1] || '0').replace(/[^0-9.-]/g, '')
      );

      await supabase.from('bank_transactions').insert({
        account_id: accountId,
        import_id: importRecord?.id,
        transaction_date:
          cols[dateIdx >= 0 ? dateIdx : 0] ||
          new Date().toISOString().split('T')[0],
        amount: Math.abs(rawAmount),
        is_credit: rawAmount > 0,
        reference: refIdx >= 0 ? cols[refIdx] : null,
        description: descIdx >= 0 ? cols[descIdx] : null,
        external_id: `${file.name}-${i}`,
        source: 'import',
        created_by: user?.id,
      });
      imported++;
    }

    if (importRecord) {
      await supabase
        .from('statement_imports')
        .update({ rows_imported: imported })
        .eq('id', importRecord.id);
    }

    setShowImport(false);
    loadData();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <GitCompareArrows className="w-6 h-6 text-indigo-400" />
            Conciliación
          </h1>
          <p className="text-slate-400 mt-1">
            Matching ticket ↔ movimiento bancario
          </p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
        >
          <Upload className="w-4 h-4" />
          Importar movimientos
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <p className="text-slate-400 text-sm">Tickets sin movimiento</p>
          <p className="text-2xl font-bold text-orange-400 mt-1">
            {unmatched.length}
          </p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <p className="text-slate-400 text-sm">Movimientos sin ticket</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">
            {transactions.length}
          </p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <p className="text-slate-400 text-sm">Sugerencias de match</p>
          <p className="text-2xl font-bold text-green-400 mt-1">
            {suggestions.length}
          </p>
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            Sugerencias de Match
          </h2>
          <div className="space-y-3">
            {suggestions.slice(0, 10).map((sug, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700"
              >
                <div className="flex-1 grid grid-cols-2 gap-4">
                  {/* Ticket */}
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Ticket</p>
                    <p className="text-white text-sm font-medium">
                      {formatCurrency(sug.inbox.amount || 0)}
                    </p>
                    <p className="text-slate-400 text-xs">
                      {(sug.inbox.client as unknown as { name: string })
                        ?.name || 'Sin cliente'}
                    </p>
                  </div>
                  {/* Transaction */}
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Movimiento</p>
                    <p className="text-white text-sm font-medium">
                      {formatCurrency(sug.tx.amount)}
                    </p>
                    <p className="text-slate-400 text-xs">
                      {formatDate(sug.tx.transaction_date)} —{' '}
                      {(sug.tx.account as unknown as { name: string })?.name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded">
                    {sug.score}%
                  </span>
                  <button
                    onClick={() => confirmMatch(sug.inbox.id, sug.tx.id)}
                    className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition"
                    title="Confirmar match"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => rejectSuggestion(sug.inbox.id, sug.tx.id)}
                    className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition"
                    title="Rechazar"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unmatched items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tickets sin movimiento */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            Tickets sin movimiento ({unmatched.length})
          </h2>
          {unmatched.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">
              Todo conciliado
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {unmatched.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-slate-800/50 rounded-lg text-sm"
                >
                  <div className="flex justify-between">
                    <span className="text-white font-medium">
                      {item.amount ? formatCurrency(item.amount) : '—'}
                    </span>
                    <span className="text-slate-500 text-xs">
                      {item.transaction_date || '—'}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs mt-1">
                    {(item.client as unknown as { name: string })?.name ||
                      'Sin cliente'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Movimientos sin ticket */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
            Movimientos sin ticket ({transactions.length})
          </h2>
          {transactions.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">
              No hay movimientos pendientes
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="p-3 bg-slate-800/50 rounded-lg text-sm"
                >
                  <div className="flex justify-between">
                    <span
                      className={cn(
                        'font-medium',
                        tx.is_credit ? 'text-green-400' : 'text-red-400'
                      )}
                    >
                      {tx.is_credit ? '+' : '-'}
                      {formatCurrency(tx.amount)}
                    </span>
                    <span className="text-slate-500 text-xs">
                      {formatDate(tx.transaction_date)}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs mt-1">
                    {(tx.account as unknown as { name: string })?.name} —{' '}
                    {tx.description || tx.reference || '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Import Modal */}
      {showImport && (
        <ImportModal
          accounts={accounts}
          onClose={() => setShowImport(false)}
          onImport={handleImportCSV}
        />
      )}
    </div>
  );
}

function ImportModal({
  accounts,
  onClose,
  onImport,
}: {
  accounts: Account[];
  onClose: () => void;
  onImport: (file: File, accountId: string) => void;
}) {
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md m-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
            Importar Movimientos
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Cuenta *
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Seleccionar cuenta</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Archivo CSV *
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Formato: fecha, monto, referencia, descripción
            </p>
            <label className="flex items-center justify-center p-8 border-2 border-dashed border-slate-700 rounded-xl cursor-pointer hover:border-slate-600 transition">
              <div className="text-center">
                <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-slate-300 text-sm">
                  {file ? file.name : 'Seleccionar archivo CSV'}
                </p>
              </div>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <button
            onClick={() => {
              if (file && accountId) onImport(file, accountId);
            }}
            disabled={!file || !accountId}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
          >
            Importar
          </button>
        </div>
      </div>
    </div>
  );
}
