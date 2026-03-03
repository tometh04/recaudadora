'use client';

import { useState, useEffect } from 'react';
import { isDemoMode } from '@/lib/use-demo';
import {
  DEMO_INBOX,
  DEMO_CLIENT_BALANCES,
  DEMO_INBOX_SUMMARY,
} from '@/lib/demo-data';
import { formatCurrency } from '@/lib/utils';
import {
  LayoutDashboard,
  Inbox,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import type { ClientBalance, InboxSummary } from '@/types/database';

interface Stats {
  recibidos: number;
  verificados: number;
  pendientes: number;
  pendientes24h: number;
  montoRecibido: number;
  montoVerificado: number;
  montoPendiente: number;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  trend,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
  trend?: 'up' | 'down';
}) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              {trend === 'up' && (
                <ArrowUpRight className="w-3 h-3 text-green-400" />
              )}
              {trend === 'down' && (
                <ArrowDownRight className="w-3 h-3 text-red-400" />
              )}
              {subtitle}
            </p>
          )}
        </div>
        <div className={`p-2.5 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    recibidos: 0,
    verificados: 0,
    pendientes: 0,
    pendientes24h: 0,
    montoRecibido: 0,
    montoVerificado: 0,
    montoPendiente: 0,
  });
  const [balances, setBalances] = useState<ClientBalance[]>([]);
  const [summary, setSummary] = useState<InboxSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);

    if (isDemoMode()) {
      const items = DEMO_INBOX;
      const recibidos = items.length;
      const verificados = items.filter(
        (i) => i.status === 'verificado' || i.status === 'aplicado'
      ).length;
      const pendientes = items.filter(
        (i) =>
          !['verificado', 'aplicado', 'rechazado', 'duplicado'].includes(
            i.status
          )
      ).length;

      // Items older than 24h that are still pending
      const cutoff = Date.now() - 24 * 3600000;
      const pendientes24h = items.filter((i) => {
        if (['verificado', 'aplicado', 'rechazado', 'duplicado'].includes(i.status))
          return false;
        return new Date(i.created_at).getTime() < cutoff;
      }).length;

      setStats({
        recibidos,
        verificados,
        pendientes,
        pendientes24h,
        montoRecibido: items.reduce((s, i) => s + (i.amount || 0), 0),
        montoVerificado: items
          .filter((i) => i.status === 'verificado' || i.status === 'aplicado')
          .reduce((s, i) => s + (i.amount || 0), 0),
        montoPendiente: items
          .filter(
            (i) =>
              !['verificado', 'aplicado', 'rechazado', 'duplicado'].includes(
                i.status
              )
          )
          .reduce((s, i) => s + (i.amount || 0), 0),
      });
      setBalances(DEMO_CLIENT_BALANCES);
      setSummary(DEMO_INBOX_SUMMARY);
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const [inboxRes, balancesRes, summaryRes, pending24hRes] =
      await Promise.all([
        supabase.from('inbox_items').select('status, amount'),
        supabase.from('v_client_balances').select('*'),
        supabase.from('v_inbox_summary').select('*'),
        supabase.from('v_pending_24h').select('id', { count: 'exact' }),
      ]);

    const items = inboxRes.data || [];
    const recibidos = items.length;
    const verificados = items.filter(
      (i) => i.status === 'verificado' || i.status === 'aplicado'
    ).length;
    const pendientes = items.filter(
      (i) =>
        !['verificado', 'aplicado', 'rechazado', 'duplicado'].includes(
          i.status
        )
    ).length;

    setStats({
      recibidos,
      verificados,
      pendientes,
      pendientes24h: pending24hRes.count || 0,
      montoRecibido: items.reduce((s, i) => s + (i.amount || 0), 0),
      montoVerificado: items
        .filter(
          (i) => i.status === 'verificado' || i.status === 'aplicado'
        )
        .reduce((s, i) => s + (i.amount || 0), 0),
      montoPendiente: items
        .filter(
          (i) =>
            !['verificado', 'aplicado', 'rechazado', 'duplicado'].includes(
              i.status
            )
        )
        .reduce((s, i) => s + (i.amount || 0), 0),
    });
    setBalances((balancesRes.data as ClientBalance[]) || []);
    setSummary((summaryRes.data as InboxSummary[]) || []);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 text-blue-400" />
          Dashboard
        </h1>
        <p className="text-slate-400 mt-1">
          Vista general de la operación
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Comprobantes Recibidos"
          value={stats.recibidos.toString()}
          subtitle={formatCurrency(stats.montoRecibido)}
          icon={Inbox}
          color="bg-blue-500/10 text-blue-400"
        />
        <StatCard
          title="Verificados"
          value={stats.verificados.toString()}
          subtitle={formatCurrency(stats.montoVerificado)}
          icon={CheckCircle2}
          color="bg-green-500/10 text-green-400"
          trend="up"
        />
        <StatCard
          title="Pendientes"
          value={stats.pendientes.toString()}
          subtitle={formatCurrency(stats.montoPendiente)}
          icon={Clock}
          color="bg-orange-500/10 text-orange-400"
        />
        <StatCard
          title="Pendientes >24h"
          value={stats.pendientes24h.toString()}
          subtitle="Requieren atención"
          icon={AlertTriangle}
          color="bg-red-500/10 text-red-400"
          trend={stats.pendientes24h > 0 ? 'down' : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Saldos por Cliente */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-blue-400" />
            Saldos por Cliente
          </h2>
          {balances.length === 0 ? (
            <p className="text-slate-500 text-sm py-8 text-center">
              No hay clientes con movimientos
            </p>
          ) : (
            <div className="space-y-3">
              {balances.map((b) => (
                <div
                  key={b.client_id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-800/50 transition"
                >
                  <div>
                    <p className="text-white text-sm font-medium">
                      {b.client_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Crédito: {formatCurrency(b.total_credito)} | Débito:{' '}
                      {formatCurrency(b.total_debito)}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-bold ${
                      b.saldo >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {formatCurrency(b.saldo)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resumen por Estado */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Resumen por Estado
          </h2>
          {summary.length === 0 ? (
            <p className="text-slate-500 text-sm py-8 text-center">
              No hay comprobantes aún
            </p>
          ) : (
            <div className="space-y-3">
              {summary.map((s) => {
                const total = summary.reduce((acc, x) => acc + x.count, 0);
                const pct = total > 0 ? (s.count / total) * 100 : 0;
                return (
                  <div key={s.status}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-300 text-sm capitalize">
                        {s.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-white text-sm font-medium">
                        {s.count}
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
