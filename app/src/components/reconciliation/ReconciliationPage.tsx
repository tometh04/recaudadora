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
  FileSpreadsheet,
  History,
  RotateCcw,
  CheckCheck,
  Filter,
  Calendar,
} from 'lucide-react';
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { InboxItem, BankTransaction, Account, Reconciliation } from '@/types/database';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function ReconciliationPage() {
  const [unmatched, setUnmatched] = useState<InboxItem[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [suggestions, setSuggestions] = useState<
    { inbox: InboxItem; tx: BankTransaction; score: number }[]
  >([]);
  const [history, setHistory] = useState<Reconciliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  // Manual match selection
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<string | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);

  // Filters
  const [accountFilter, setAccountFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Bulk
  const [bulkLoading, setBulkLoading] = useState(false);

  // Undo loading
  const [undoLoading, setUndoLoading] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [accountFilter, dateFrom, dateTo]);

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
      setHistory([]);
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    let inboxQuery = supabase
      .from('inbox_items')
      .select('*, client:b2b_clients(name), account:accounts(name)')
      .in('status', ['verificado', 'pendiente_verificacion', 'ocr_listo'])
      .order('created_at', { ascending: false });

    let txQuery = supabase
      .from('bank_transactions')
      .select('*, account:accounts(name)')
      .eq('is_reconciled', false)
      .order('transaction_date', { ascending: false });

    if (accountFilter) {
      inboxQuery = inboxQuery.eq('account_id', accountFilter);
      txQuery = txQuery.eq('account_id', accountFilter);
    }
    if (dateFrom) {
      inboxQuery = inboxQuery.gte('transaction_date', dateFrom);
      txQuery = txQuery.gte('transaction_date', dateFrom);
    }
    if (dateTo) {
      inboxQuery = inboxQuery.lte('transaction_date', dateTo);
      txQuery = txQuery.lte('transaction_date', dateTo);
    }

    const [inboxRes, txRes, accountsRes, historyRes] = await Promise.all([
      inboxQuery,
      txQuery,
      supabase.from('accounts').select('*').eq('is_active', true),
      supabase
        .from('reconciliations')
        .select(
          '*, inbox_item:inbox_items(id, amount, client_id, transaction_date, client:b2b_clients(name)), bank_transaction:bank_transactions(id, amount, transaction_date, description, account:accounts(name))'
        )
        .eq('status', 'confirmado')
        .order('confirmed_at', { ascending: false })
        .limit(50),
    ]);

    const inbox = (inboxRes.data as InboxItem[]) || [];
    const txs = (txRes.data as BankTransaction[]) || [];
    setUnmatched(inbox);
    setTransactions(txs);
    setAccounts((accountsRes.data as Account[]) || []);
    setSuggestions(buildSuggestions(inbox, txs));
    setHistory((historyRes.data as Reconciliation[]) || []);
    setLoading(false);
  }

  async function confirmMatch(inboxId: string, txId: string, score: number = 100) {
    if (isDemoMode()) {
      setUnmatched((prev) => prev.filter((i) => i.id !== inboxId));
      setTransactions((prev) => prev.filter((t) => t.id !== txId));
      setSuggestions((prev) =>
        prev.filter((s) => s.inbox.id !== inboxId && s.tx.id !== txId)
      );
      setSelectedTicket(null);
      setSelectedTx(null);
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
      match_score: score,
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
      after_data: { inbox_item_id: inboxId, bank_transaction_id: txId, match_score: score },
    });

    setSelectedTicket(null);
    setSelectedTx(null);
    loadData();
  }

  async function handleManualMatch() {
    if (!selectedTicket || !selectedTx) return;
    setMatchLoading(true);
    await confirmMatch(selectedTicket, selectedTx, 100);
    setMatchLoading(false);
  }

  async function handleBulkConfirm() {
    if (suggestions.length === 0) return;
    setBulkLoading(true);

    if (isDemoMode()) {
      const inboxIds = new Set(suggestions.map((s) => s.inbox.id));
      const txIds = new Set(suggestions.map((s) => s.tx.id));
      setUnmatched((prev) => prev.filter((i) => !inboxIds.has(i.id)));
      setTransactions((prev) => prev.filter((t) => !txIds.has(t.id)));
      setSuggestions([]);
      setBulkLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    for (const sug of suggestions) {
      await supabase.from('reconciliations').insert({
        inbox_item_id: sug.inbox.id,
        bank_transaction_id: sug.tx.id,
        status: 'confirmado',
        confirmed_by: user?.id,
        confirmed_at: new Date().toISOString(),
        match_score: sug.score,
      });

      await supabase
        .from('inbox_items')
        .update({ status: 'verificado' })
        .eq('id', sug.inbox.id);
      await supabase
        .from('bank_transactions')
        .update({ is_reconciled: true })
        .eq('id', sug.tx.id);
    }

    await supabase.from('audit_events').insert({
      user_id: user?.id,
      action: 'bulk_reconciliation_confirmed',
      entity_type: 'reconciliations',
      after_data: { count: suggestions.length, matches: suggestions.map(s => ({ inbox_id: s.inbox.id, tx_id: s.tx.id })) },
    });

    setBulkLoading(false);
    loadData();
  }

  async function undoReconciliation(rec: Reconciliation) {
    if (isDemoMode()) return;
    setUndoLoading(rec.id);

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Delete reconciliation
    await supabase.from('reconciliations').delete().eq('id', rec.id);

    // Revert inbox status
    await supabase
      .from('inbox_items')
      .update({ status: 'verificado' })
      .eq('id', rec.inbox_item_id);

    // Revert bank transaction
    await supabase
      .from('bank_transactions')
      .update({ is_reconciled: false })
      .eq('id', rec.bank_transaction_id);

    await supabase.from('audit_events').insert({
      user_id: user?.id,
      action: 'reconciliation_undone',
      entity_type: 'reconciliations',
      before_data: { reconciliation_id: rec.id, inbox_item_id: rec.inbox_item_id, bank_transaction_id: rec.bank_transaction_id },
    });

    setUndoLoading(null);
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

  const selectedTicketItem = unmatched.find((i) => i.id === selectedTicket);
  const selectedTxItem = transactions.find((t) => t.id === selectedTx);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <GitCompareArrows className="w-6 h-6 text-indigo-400" />
            Conciliacion
          </h1>
          <p className="text-muted-foreground mt-1">
            Matching ticket ↔ movimiento bancario
          </p>
        </div>
        <Button onClick={() => setShowImport(true)}>
          <Upload className="w-4 h-4" />
          Importar movimientos
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select
            value={accountFilter || '_none'}
            onValueChange={(v) => setAccountFilter(v === '_none' ? '' : v)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Todas las cuentas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Todas las cuentas</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-auto"
              placeholder="Desde"
            />
            <span className="text-muted-foreground">—</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-auto"
              placeholder="Hasta"
            />
          </div>
          {(accountFilter || dateFrom || dateTo) && (
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setAccountFilter('');
                setDateFrom('');
                setDateTo('');
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm">Tickets sin movimiento</p>
            <p className="text-2xl font-bold text-orange-400 mt-1">
              {unmatched.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm">Movimientos sin ticket</p>
            <p className="text-2xl font-bold text-yellow-400 mt-1">
              {transactions.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm">Sugerencias de match</p>
            <p className="text-2xl font-bold text-green-400 mt-1">
              {suggestions.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Manual Match Bar */}
      {(selectedTicket || selectedTx) && (
        <Card className="border-indigo-700 bg-indigo-900/30">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <GitCompareArrows className="w-5 h-5 text-indigo-400" />
              <div className="text-sm">
                <span className="text-muted-foreground">Match manual: </span>
                {selectedTicketItem ? (
                  <span className="text-foreground font-medium">
                    Ticket {formatCurrency(selectedTicketItem.amount || 0)} —{' '}
                    {(selectedTicketItem.client as unknown as { name: string })?.name || 'Sin cliente'}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Seleccionar ticket ←</span>
                )}
                <span className="text-indigo-400 mx-2">↔</span>
                {selectedTxItem ? (
                  <span className="text-foreground font-medium">
                    Mov. {formatCurrency(selectedTxItem.amount)} —{' '}
                    {formatDate(selectedTxItem.transaction_date)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Seleccionar movimiento →</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedTicket && selectedTx && (
                <Button
                  onClick={handleManualMatch}
                  disabled={matchLoading}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="w-4 h-4" />
                  {matchLoading ? 'Confirmando...' : 'Confirmar Match'}
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedTicket(null);
                  setSelectedTx(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              Sugerencias de Match
            </CardTitle>
            <Button
              onClick={handleBulkConfirm}
              disabled={bulkLoading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCheck className="w-4 h-4" />
              {bulkLoading ? 'Confirmando...' : `Confirmar todos (${suggestions.length})`}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestions.slice(0, 20).map((sug, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border"
              >
                <div className="flex-1 grid grid-cols-2 gap-4">
                  {/* Ticket */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Ticket</p>
                    <p className="text-foreground text-sm font-medium">
                      {formatCurrency(sug.inbox.amount || 0)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {(sug.inbox.client as unknown as { name: string })
                        ?.name || 'Sin cliente'}{' '}
                      · {sug.inbox.transaction_date || '—'}
                    </p>
                  </div>
                  {/* Transaction */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Movimiento</p>
                    <p className="text-foreground text-sm font-medium">
                      {formatCurrency(sug.tx.amount)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatDate(sug.tx.transaction_date)} —{' '}
                      {(sug.tx.account as unknown as { name: string })?.name}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">
                    {sug.score}%
                  </Badge>
                  <Button
                    size="icon"
                    onClick={() => confirmMatch(sug.inbox.id, sug.tx.id, sug.score)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                    title="Confirmar match"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => rejectSuggestion(sug.inbox.id, sug.tx.id)}
                    title="Rechazar"
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Unmatched items — Manual Selection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tickets sin movimiento */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
              Tickets sin movimiento ({unmatched.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Click en un ticket para match manual
            </p>
          </CardHeader>
          <CardContent>
            {unmatched.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">
                Todo conciliado
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {unmatched.map((item) => (
                  <div
                    key={item.id}
                    onClick={() =>
                      setSelectedTicket(
                        selectedTicket === item.id ? null : item.id
                      )
                    }
                    className={cn(
                      'p-3 rounded-lg text-sm cursor-pointer transition-all',
                      selectedTicket === item.id
                        ? 'bg-indigo-600/20 border-2 border-indigo-500 ring-1 ring-indigo-500/50'
                        : 'bg-muted/50 border border-transparent hover:border-border'
                    )}
                  >
                    <div className="flex justify-between">
                      <span className="text-foreground font-medium">
                        {item.amount ? formatCurrency(item.amount) : '—'}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {item.transaction_date || '—'}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs mt-1">
                      {(item.client as unknown as { name: string })?.name ||
                        'Sin cliente'}{' '}
                      ·{' '}
                      {(item.account as unknown as { name: string })?.name ||
                        'Sin cuenta'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Movimientos sin ticket */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              Movimientos sin ticket ({transactions.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Click en un movimiento para match manual
            </p>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">
                No hay movimientos pendientes
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    onClick={() =>
                      setSelectedTx(selectedTx === tx.id ? null : tx.id)
                    }
                    className={cn(
                      'p-3 rounded-lg text-sm cursor-pointer transition-all',
                      selectedTx === tx.id
                        ? 'bg-indigo-600/20 border-2 border-indigo-500 ring-1 ring-indigo-500/50'
                        : 'bg-muted/50 border border-transparent hover:border-border'
                    )}
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
                      <span className="text-muted-foreground text-xs">
                        {formatDate(tx.transaction_date)}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs mt-1">
                      {(tx.account as unknown as { name: string })?.name} —{' '}
                      {tx.description || tx.reference || '—'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reconciliation History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <History className="w-5 h-5 text-blue-400" />
            Historial de Conciliaciones ({history.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">
              No hay conciliaciones confirmadas aun
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Movimiento</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="text-right">Accion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((rec) => {
                  const inboxItem = rec.inbox_item as unknown as {
                    id: string;
                    amount: number;
                    transaction_date: string;
                    client: { name: string } | null;
                  };
                  const bankTx = rec.bank_transaction as unknown as {
                    id: string;
                    amount: number;
                    transaction_date: string;
                    description: string;
                    account: { name: string } | null;
                  };

                  return (
                    <TableRow
                      key={rec.id}
                      className="hover:bg-muted/50"
                    >
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {rec.confirmed_at
                          ? formatDateTime(rec.confirmed_at)
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <p className="text-foreground font-medium">
                          {inboxItem
                            ? formatCurrency(inboxItem.amount || 0)
                            : '—'}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {inboxItem?.client?.name || 'Sin cliente'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-foreground font-medium">
                          {bankTx ? formatCurrency(bankTx.amount || 0) : '—'}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {bankTx?.account?.name || '—'} ·{' '}
                          {bankTx?.transaction_date
                            ? formatDate(bankTx.transaction_date)
                            : '—'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">
                          {rec.match_score || 0}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => undoReconciliation(rec)}
                          disabled={undoLoading === rec.id}
                          title="Deshacer conciliacion"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {undoLoading === rec.id ? 'Deshaciendo...' : 'Deshacer'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Import Modal */}
      <ImportModal
        accounts={accounts}
        open={showImport}
        onOpenChange={setShowImport}
        onImport={handleImportCSV}
      />
    </div>
  );
}

function ImportModal({
  accounts,
  open,
  onOpenChange,
  onImport,
}: {
  accounts: Account[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (file: File, accountId: string) => void;
}) {
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
            Importar Movimientos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1">Cuenta *</Label>
            <Select
              value={accountId || '_none'}
              onValueChange={(v) => setAccountId(v === '_none' ? '' : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar cuenta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Seleccionar cuenta</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1">Archivo CSV *</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Formato: fecha, monto, referencia, descripcion
            </p>
            <label className="flex items-center justify-center p-8 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-muted-foreground transition">
              <div className="text-center">
                <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">
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
        </div>

        <DialogFooter>
          <Button
            onClick={() => {
              if (file && accountId) onImport(file, accountId);
            }}
            disabled={!file || !accountId}
            className="w-full"
          >
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
