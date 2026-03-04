'use client';

import { useState, useEffect, useCallback } from 'react';
import { isDemoMode } from '@/lib/use-demo';
import { DEMO_INBOX, DEMO_CLIENTS, DEMO_ACCOUNTS } from '@/lib/demo-data';
import { useAppStore } from '@/lib/store';
import {
  FileCheck,
  Search,
  Upload,
  Eye,
  CheckCircle,
  XCircle,
  Copy,
  X,
  ImageIcon,
  User,
  Building2,
  Trash2,
} from 'lucide-react';
import {
  cn,
  formatCurrency,
  formatDateTime,
  timeAgo,
  STATUS_LABELS,
  STATUS_COLORS,
} from '@/lib/utils';
import type { InboxItem, InboxStatus, B2BClient, Account } from '@/types/database';

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [clients, setClients] = useState<B2BClient[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InboxStatus | 'todos'>('todos');
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<{ action: 'verificar' | 'rechazar' | 'eliminar'; count: number } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);

    if (isDemoMode()) {
      setItems(DEMO_INBOX);
      setClients(DEMO_CLIENTS);
      setAccounts(DEMO_ACCOUNTS);
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const [itemsRes, clientsRes, accountsRes] = await Promise.all([
      supabase
        .from('inbox_items')
        .select('*, client:b2b_clients(*), account:accounts(*)')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('b2b_clients').select('*').eq('is_active', true),
      supabase.from('accounts').select('*').eq('is_active', true),
    ]);
    setItems((itemsRes.data as InboxItem[]) || []);
    setClients((clientsRes.data as B2BClient[]) || []);
    setAccounts((accountsRes.data as Account[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, search]);

  // Auto-apply commission when verifying a comprobante
  async function applyCommission(itemId: string, clientId: string | null, amount: number | null) {
    if (!amount || amount <= 0) return;
    if (isDemoMode()) return;

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Find commission rule: client-specific first, then general (client_id IS NULL)
    let rule: { percentage: number; fixed_fee: number; min_amount: number } | null = null;

    if (clientId) {
      const { data } = await supabase
        .from('commission_rules')
        .select('percentage, fixed_fee, min_amount')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (data) rule = data;
    }

    if (!rule) {
      const { data } = await supabase
        .from('commission_rules')
        .select('percentage, fixed_fee, min_amount')
        .is('client_id', null)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (data) rule = data;
    }

    if (!rule) return;
    if (amount < rule.min_amount) return;

    const commission = Math.max(amount * rule.percentage / 100, rule.fixed_fee);
    if (commission <= 0) return;

    // Create ledger entry for commission (debit)
    if (clientId) {
      await supabase.from('ledger_entries').insert({
        client_id: clientId,
        entry_type: 'debito',
        category: 'comision',
        amount: commission,
        description: `Comision ${rule.percentage}% sobre deposito de ${formatCurrency(amount)}`,
        inbox_item_id: itemId,
        created_by: user?.id,
      });

      // Audit event
      await supabase.from('audit_events').insert({
        user_id: user?.id,
        action: 'commission_applied',
        entity_type: 'ledger_entries',
        entity_id: itemId,
        after_data: { client_id: clientId, amount, commission, percentage: rule.percentage },
      });
    }
  }

  async function updateItem(id: string, updates: Partial<InboxItem>) {
    if (isDemoMode()) {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
      );
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    // If verifying, also create credit ledger entry + commission
    if (updates.status === 'verificado') {
      const item = items.find((i) => i.id === id);
      if (item) {
        const cId = (updates as any).client_id ?? item.client_id;
        const amt = (updates as any).amount ?? item.amount;
        const { data: { user } } = await supabase.auth.getUser();

        // Create credit ledger entry
        if (cId && amt && amt > 0) {
          await supabase.from('ledger_entries').insert({
            client_id: cId,
            entry_type: 'credito',
            category: 'deposito_verificado',
            amount: amt,
            description: `Deposito verificado${item.reference_number ? ` - Ref: ${item.reference_number}` : ''}`,
            inbox_item_id: id,
            created_by: user?.id,
          });

          // Apply commission
          await applyCommission(id, cId, amt);
        }
      }
    }

    await supabase.from('inbox_items').update(updates).eq('id', id);
    loadData();
  }

  async function handleUpload(file: File) {
    if (isDemoMode()) {
      const newItem: InboxItem = {
        id: `inb-demo-${Date.now()}`,
        source: 'upload_manual',
        status: 'recibido',
        wa_message_id: null,
        wa_phone_number: null,
        wa_timestamp: null,
        client_id: null,
        account_id: null,
        amount: null,
        transaction_date: null,
        reference_number: null,
        ocr_amount_confidence: null,
        ocr_date_confidence: null,
        ocr_reference_confidence: null,
        original_image_url: null,
        processed_image_url: null,
        notes: null,
        rejection_reason: null,
        assigned_to: null,
        processed_by: null,
        processed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setItems((prev) => [newItem, ...prev]);
      setShowUpload(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const fileName = `${Date.now()}-${file.name}`;
    const { data: uploadData } = await supabase.storage
      .from('comprobantes')
      .upload(fileName, file);

    if (uploadData) {
      const {
        data: { publicUrl },
      } = supabase.storage.from('comprobantes').getPublicUrl(fileName);

      await supabase.from('inbox_items').insert({
        source: 'upload_manual',
        status: 'recibido',
        original_image_url: publicUrl,
      });
      setShowUpload(false);
      loadData();
    }
  }

  const filtered = items.filter((item) => {
    if (statusFilter !== 'todos' && item.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.client?.name?.toLowerCase().includes(q) ||
        item.wa_phone_number?.includes(q) ||
        item.reference_number?.toLowerCase().includes(q) ||
        item.amount?.toString().includes(q)
      );
    }
    return true;
  });

  // When opening a comprobante, auto-mark as pendiente_verificacion to reduce badge
  const handleSelectItem = useCallback(async (item: InboxItem) => {
    setSelectedItem(item);

    const needsStatusUpdate = item.status === 'recibido' || item.status === 'ocr_listo';
    if (needsStatusUpdate && !isDemoMode()) {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      await supabase
        .from('inbox_items')
        .update({ status: 'pendiente_verificacion' })
        .eq('id', item.id);

      setItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, status: 'pendiente_verificacion' as InboxStatus } : i
      ));
      setSelectedItem({ ...item, status: 'pendiente_verificacion' as InboxStatus });

      const { count } = await supabase
        .from('inbox_items')
        .select('id', { count: 'exact', head: true })
        .in('status', ['recibido', 'ocr_procesando', 'ocr_listo']);
      if (count !== null) {
        useAppStore.getState().setInboxUnprocessedCount(count);
      }
    }
  }, []);

  // Bulk actions
  async function handleBulkAction(action: 'verificar' | 'rechazar' | 'eliminar') {
    const ids = Array.from(selectedIds);

    if (isDemoMode()) {
      if (action === 'eliminar') {
        setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
      } else {
        const newStatus = action === 'verificar' ? 'verificado' : 'rechazado';
        setItems(prev => prev.map(i =>
          selectedIds.has(i.id) ? { ...i, status: newStatus as InboxStatus } : i
        ));
      }
      setSelectedIds(new Set());
      setBulkConfirm(null);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (action === 'eliminar') {
      // Delete/nullify all FK dependencies before deleting inbox_items
      await supabase.from('ocr_results').delete().in('inbox_item_id', ids);
      await supabase.from('reconciliations').delete().in('inbox_item_id', ids);
      await supabase.from('ledger_entries').update({ inbox_item_id: null }).in('inbox_item_id', ids);
      await supabase.from('exceptions').delete().in('inbox_item_id', ids);
      const { error } = await supabase.from('inbox_items').delete().in('id', ids);
      if (error) {
        console.error('Error deleting inbox_items:', error);
        alert(`Error al eliminar: ${error.message}`);
        setBulkConfirm(null);
        return;
      }
    } else {
      const newStatus = action === 'verificar' ? 'verificado' : 'rechazado';
      await supabase.from('inbox_items').update({ status: newStatus }).in('id', ids);

      // If bulk verifying, create credit ledger entries + commissions
      if (action === 'verificar') {
        const verifiedItems = items.filter((i) => selectedIds.has(i.id) && i.client_id && i.amount && i.amount > 0);
        for (const item of verifiedItems) {
          await supabase.from('ledger_entries').insert({
            client_id: item.client_id,
            entry_type: 'credito',
            category: 'deposito_verificado',
            amount: item.amount,
            description: `Deposito verificado (bulk)${item.reference_number ? ` - Ref: ${item.reference_number}` : ''}`,
            inbox_item_id: item.id,
            created_by: user?.id,
          });
          await applyCommission(item.id, item.client_id, item.amount);
        }
      }
    }

    await supabase.from('audit_events').insert({
      user_id: user?.id,
      action: `bulk_${action}`,
      entity_type: 'inbox_items',
      after_data: { item_ids: ids, count: ids.length },
    });

    setSelectedIds(new Set());
    setBulkConfirm(null);
    loadData();

    // Refresh badge
    const { count } = await supabase
      .from('inbox_items')
      .select('id', { count: 'exact', head: true })
      .in('status', ['recibido', 'ocr_procesando', 'ocr_listo']);
    if (count !== null) {
      useAppStore.getState().setInboxUnprocessedCount(count);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(i => i.id)));
    }
  }

  const statusCounts = items.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filtered.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileCheck className="w-6 h-6 text-blue-400" />
            Comprobantes
          </h1>
          <p className="text-slate-400 mt-1">
            {items.length} comprobantes totales
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
        >
          <Upload className="w-4 h-4" />
          Subir comprobante
        </button>
      </div>

      {/* Status pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter('todos')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium transition',
            statusFilter === 'todos'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          )}
        >
          Todos ({items.length})
        </button>
        {Object.entries(STATUS_LABELS).map(([key, label]) => {
          const count = statusCounts[key] || 0;
          if (count === 0) return null;
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(key as InboxStatus)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition',
                statusFilter === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              )}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Buscar por cliente, telefono, referencia, monto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Items Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="p-4 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                  />
                </th>
                <th className="text-left p-4 text-slate-400 font-medium">
                  Comprobante
                </th>
                <th className="text-left p-4 text-slate-400 font-medium">
                  Estado
                </th>
                <th className="text-left p-4 text-slate-400 font-medium">
                  Cliente
                </th>
                <th className="text-left p-4 text-slate-400 font-medium">
                  Cuenta
                </th>
                <th className="text-right p-4 text-slate-400 font-medium">
                  Monto
                </th>
                <th className="text-left p-4 text-slate-400 font-medium">
                  Fecha Tx
                </th>
                <th className="text-left p-4 text-slate-400 font-medium">
                  Recibido
                </th>
                <th className="text-left p-4 text-slate-400 font-medium">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Cargando...
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    No hay comprobantes
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    className={cn(
                      'border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition',
                      selectedIds.has(item.id) && 'bg-blue-900/10'
                    )}
                    onClick={() => handleSelectItem(item)}
                  >
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                      />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                          {(item.processed_image_url || item.original_image_url) ? (
                            <img
                              src={item.processed_image_url || item.original_image_url!}
                              alt=""
                              className="w-10 h-10 object-cover rounded-lg"
                            />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-slate-500" />
                          )}
                        </div>
                        <div>
                          <p className="text-white text-xs font-mono">
                            {item.id.slice(0, 8)}
                          </p>
                          <p className="text-slate-500 text-xs capitalize">
                            {item.source.replace(/_/g, ' ')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span
                        className={cn(
                          'px-2 py-1 rounded-md text-xs font-medium',
                          STATUS_COLORS[item.status]
                        )}
                      >
                        {STATUS_LABELS[item.status]}
                      </span>
                    </td>
                    <td className="p-4 text-slate-300">
                      {item.client?.name || (
                        <span className="text-slate-600 italic">
                          Sin asignar
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-slate-300">
                      {item.account?.name || (
                        <span className="text-slate-600 italic">—</span>
                      )}
                    </td>
                    <td className="p-4 text-right font-mono text-white">
                      {item.amount ? formatCurrency(item.amount) : '—'}
                    </td>
                    <td className="p-4 text-slate-300 text-xs">
                      {item.transaction_date || '—'}
                    </td>
                    <td className="p-4 text-slate-500 text-xs">
                      {timeAgo(item.created_at)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectItem(item);
                          }}
                          className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition"
                          title="Ver detalle"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {item.status === 'pendiente_verificacion' && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateItem(item.id, { status: 'verificado' });
                              }}
                              className="p-1.5 rounded hover:bg-green-900/30 text-slate-400 hover:text-green-400 transition"
                              title="Verificar"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateItem(item.id, { status: 'rechazado' });
                              }}
                              className="p-1.5 rounded hover:bg-red-900/30 text-slate-400 hover:text-red-400 transition"
                              title="Rechazar"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {item.status === 'recibido' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateItem(item.id, { status: 'duplicado' });
                            }}
                            className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-yellow-400 transition"
                            title="Marcar duplicado"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-800 border border-slate-700 rounded-2xl px-6 py-3 shadow-2xl flex items-center gap-4">
          <span className="text-white text-sm font-medium">
            {selectedIds.size} seleccionados
          </span>
          <div className="w-px h-6 bg-slate-700" />
          <button
            onClick={() => setBulkConfirm({ action: 'verificar', count: selectedIds.size })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition"
          >
            <CheckCircle className="w-4 h-4" />
            Verificar
          </button>
          <button
            onClick={() => setBulkConfirm({ action: 'rechazar', count: selectedIds.size })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm rounded-lg transition"
          >
            <XCircle className="w-4 h-4" />
            Rechazar
          </button>
          <button
            onClick={() => setBulkConfirm({ action: 'eliminar', count: selectedIds.size })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition"
          >
            <Trash2 className="w-4 h-4" />
            Eliminar
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bulk Confirm Dialog */}
      {bulkConfirm && (
        <BulkConfirmDialog
          action={bulkConfirm.action}
          count={bulkConfirm.count}
          onConfirm={() => handleBulkAction(bulkConfirm.action)}
          onCancel={() => setBulkConfirm(null)}
        />
      )}

      {/* Detail Modal */}
      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          clients={clients}
          accounts={accounts}
          onClose={() => setSelectedItem(null)}
          onUpdate={(updates) => {
            updateItem(selectedItem.id, updates);
            setSelectedItem(null);
          }}
        />
      )}

      {/* Upload Modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUpload={handleUpload}
        />
      )}
    </div>
  );
}

function BulkConfirmDialog({
  action,
  count,
  onConfirm,
  onCancel,
}: {
  action: 'verificar' | 'rechazar' | 'eliminar';
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const config = {
    verificar: { title: 'Verificar comprobantes', color: 'bg-green-600 hover:bg-green-700', icon: CheckCircle, description: `Se marcaran ${count} comprobantes como verificados.` },
    rechazar: { title: 'Rechazar comprobantes', color: 'bg-orange-600 hover:bg-orange-700', icon: XCircle, description: `Se marcaran ${count} comprobantes como rechazados.` },
    eliminar: { title: 'Eliminar comprobantes', color: 'bg-red-600 hover:bg-red-700', icon: Trash2, description: `Se eliminaran ${count} comprobantes de forma permanente. Esta accion es irreversible.` },
  }[action];

  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm m-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={cn('p-2 rounded-lg', action === 'eliminar' ? 'bg-red-500/10' : action === 'rechazar' ? 'bg-orange-500/10' : 'bg-green-500/10')}>
            <Icon className={cn('w-5 h-5', action === 'eliminar' ? 'text-red-400' : action === 'rechazar' ? 'text-orange-400' : 'text-green-400')} />
          </div>
          <h3 className="text-lg font-semibold text-white">{config.title}</h3>
        </div>
        <p className="text-slate-400 text-sm mb-6">{config.description}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={cn('flex-1 py-2 text-white text-sm font-medium rounded-lg transition', config.color)}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemDetailModal({
  item,
  clients,
  accounts,
  onClose,
  onUpdate,
}: {
  item: InboxItem;
  clients: B2BClient[];
  accounts: Account[];
  onClose: () => void;
  onUpdate: (updates: Partial<InboxItem>) => void;
}) {
  const [clientId, setClientId] = useState(item.client_id || '');
  const [accountId, setAccountId] = useState(item.account_id || '');
  const [amount, setAmount] = useState(item.amount?.toString() || '');
  const [txDate, setTxDate] = useState(item.transaction_date || '');
  const [reference, setReference] = useState(item.reference_number || '');
  const [ocrData, setOcrData] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    if (isDemoMode()) return;
    (async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data } = await supabase
          .from('ocr_results')
          .select('raw_response')
          .eq('inbox_item_id', item.id)
          .maybeSingle();
        if (data?.raw_response) {
          setOcrData(data.raw_response as Record<string, any>);
        }
      } catch { /* ignore */ }
    })();
  }, [item.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto m-4">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Detalle de Comprobante
            </h2>
            <p className="text-slate-500 text-xs font-mono">{item.id}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Image / PDF preview */}
          <div>
            {(item.processed_image_url || item.original_image_url) ? (
              <img
                src={item.processed_image_url || item.original_image_url!}
                alt="Comprobante"
                className="w-full rounded-lg border border-slate-700"
              />
            ) : (
              <div className="w-full h-64 bg-slate-800 rounded-lg flex items-center justify-center">
                <ImageIcon className="w-12 h-12 text-slate-600" />
              </div>
            )}
            <div className="mt-3 space-y-1">
              <p className="text-xs text-slate-500">
                Fuente:{' '}
                <span className="text-slate-300 capitalize">
                  {item.source.replace(/_/g, ' ')}
                </span>
              </p>
              {item.wa_phone_number && (
                <p className="text-xs text-slate-500">
                  Telefono:{' '}
                  <span className="text-slate-300">{item.wa_phone_number}</span>
                </p>
              )}
              <p className="text-xs text-slate-500">
                Recibido:{' '}
                <span className="text-slate-300">
                  {formatDateTime(item.created_at)}
                </span>
              </p>
            </div>

            {ocrData && (
              <div className="mt-4 space-y-2">
                {(ocrData.sender_name || ocrData.sender_cuit) && (
                  <div className="p-2.5 bg-slate-800/60 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-xs font-medium text-blue-400">Emisor (OCR)</span>
                    </div>
                    {ocrData.sender_name && <p className="text-sm text-white">{ocrData.sender_name}</p>}
                    {ocrData.sender_cuit && <p className="text-xs text-slate-400">CUIT: {ocrData.sender_cuit}</p>}
                  </div>
                )}
                {(ocrData.receiver_name || ocrData.receiver_cuit) && (
                  <div className="p-2.5 bg-slate-800/60 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-xs font-medium text-green-400">Receptor (OCR)</span>
                    </div>
                    {ocrData.receiver_name && <p className="text-sm text-white">{ocrData.receiver_name}</p>}
                    {ocrData.receiver_cuit && <p className="text-xs text-slate-400">CUIT: {ocrData.receiver_cuit}</p>}
                  </div>
                )}
                {ocrData.bank_name && (
                  <div className="p-2.5 bg-slate-800/60 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="text-xs font-medium text-yellow-400">Entidad (OCR)</span>
                    </div>
                    <p className="text-sm text-white">{ocrData.bank_name}</p>
                    {ocrData.account_number && <p className="text-xs text-slate-400">Cuenta: {ocrData.account_number}</p>}
                  </div>
                )}
                {ocrData.description && (
                  <p className="text-xs text-slate-500 italic">{ocrData.description}</p>
                )}
              </div>
            )}
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div>
              <span className={cn('px-3 py-1.5 rounded-lg text-sm font-medium', STATUS_COLORS[item.status])}>
                {STATUS_LABELS[item.status]}
              </span>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Cliente</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Sin asignar</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {!clientId && ocrData?.sender_name && (
                <p className="text-xs text-blue-400 mt-1">OCR detecta: {ocrData.sender_name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Cuenta / Canal</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Sin asignar</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {!accountId && ocrData?.bank_name && (
                <p className="text-xs text-yellow-400 mt-1">OCR detecta: {ocrData.bank_name}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Monto</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {item.ocr_amount_confidence && (
                  <p className="text-xs text-slate-500 mt-1">OCR: {item.ocr_amount_confidence}</p>
                )}
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Fecha Tx</label>
                <input
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Referencia</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Nro de comprobante"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() =>
                  onUpdate({
                    client_id: clientId || null,
                    account_id: accountId || null,
                    amount: amount ? parseFloat(amount) : null,
                    transaction_date: txDate || null,
                    reference_number: reference || null,
                    status:
                      item.status === 'recibido' || item.status === 'ocr_listo'
                        ? 'pendiente_verificacion'
                        : item.status,
                  } as Partial<InboxItem>)
                }
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
              >
                Guardar
              </button>
              {(item.status === 'pendiente_verificacion' ||
                item.status === 'ocr_listo') && (
                <button
                  onClick={() =>
                    onUpdate({ status: 'verificado' } as Partial<InboxItem>)
                  }
                  className="py-2 px-4 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition"
                >
                  Verificar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UploadModal({
  onClose,
  onUpload,
}: {
  onClose: () => void;
  onUpload: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md m-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            Subir Comprobante
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-xl p-12 text-center transition',
            dragging
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-slate-700 hover:border-slate-600'
          )}
        >
          <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-300 text-sm mb-1">
            Arrastra la imagen aca
          </p>
          <p className="text-slate-500 text-xs">o</p>
          <label className="mt-3 inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg cursor-pointer transition">
            Seleccionar archivo
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
