'use client';

import { useState, useEffect, useMemo } from 'react';
import { isDemoMode } from '@/lib/use-demo';
import {
  DEMO_INBOX,
  DEMO_CLIENT_BALANCES,
  DEMO_INBOX_SUMMARY,
} from '@/lib/demo-data';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  BarChart3,
  PieChartIcon,
  Activity,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts';
import { subDays, format, startOfDay, isAfter } from 'date-fns';
import { es } from 'date-fns/locale';
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

interface DailyVolume {
  date: string;
  label: string;
  recibidos: number;
  verificados: number;
}

interface CumulativeData {
  date: string;
  label: string;
  monto: number;
}

const STATUS_CHART_COLORS: Record<string, string> = {
  recibido: '#3b82f6',
  ocr_procesando: '#eab308',
  ocr_listo: '#6366f1',
  pendiente_verificacion: '#f97316',
  verificado: '#22c55e',
  rechazado: '#ef4444',
  aplicado: '#10b981',
  duplicado: '#6b7280',
};

const STATUS_CHART_LABELS: Record<string, string> = {
  recibido: 'Recibido',
  ocr_procesando: 'OCR Procesando',
  ocr_listo: 'OCR Listo',
  pendiente_verificacion: 'Pend. Verif.',
  verificado: 'Verificado',
  rechazado: 'Rechazado',
  aplicado: 'Aplicado',
  duplicado: 'Duplicado',
};

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
    <Card className="hover:border-primary/20 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-muted-foreground text-sm">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
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
      </CardContent>
    </Card>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm font-medium" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

function AreaTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm font-medium" style={{ color: entry.color }}>
          {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

function PieTooltipContent({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl">
      <p className="text-sm font-medium" style={{ color: d.payload.fill }}>
        {d.name}: {d.value}
      </p>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
  const [dailyVolume, setDailyVolume] = useState<DailyVolume[]>([]);
  const [cumulativeData, setCumulativeData] = useState<CumulativeData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  function buildDailyVolume(items: { status: string; created_at: string }[]): DailyVolume[] {
    const today = startOfDay(new Date());
    const days: DailyVolume[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = subDays(today, i);
      const dayStr = format(day, 'yyyy-MM-dd');
      const label = format(day, 'dd/MM', { locale: es });
      const dayItems = items.filter(
        (it) => format(startOfDay(new Date(it.created_at)), 'yyyy-MM-dd') === dayStr
      );
      days.push({
        date: dayStr,
        label,
        recibidos: dayItems.length,
        verificados: dayItems.filter(
          (it) => it.status === 'verificado' || it.status === 'aplicado'
        ).length,
      });
    }
    return days;
  }

  function buildCumulativeData(
    items: { status: string; amount: number | null; created_at: string }[]
  ): CumulativeData[] {
    const today = startOfDay(new Date());
    const thirtyDaysAgo = subDays(today, 29);
    const verified = items
      .filter(
        (it) =>
          (it.status === 'verificado' || it.status === 'aplicado') &&
          isAfter(new Date(it.created_at), thirtyDaysAgo)
      )
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const days: CumulativeData[] = [];
    let cumulative = 0;
    for (let i = 29; i >= 0; i--) {
      const day = subDays(today, i);
      const dayStr = format(day, 'yyyy-MM-dd');
      const label = format(day, 'dd/MM', { locale: es });
      const dayAmount = verified
        .filter((it) => format(startOfDay(new Date(it.created_at)), 'yyyy-MM-dd') === dayStr)
        .reduce((s, it) => s + (it.amount || 0), 0);
      cumulative += dayAmount;
      days.push({ date: dayStr, label, monto: cumulative });
    }
    return days;
  }

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
      setDailyVolume(buildDailyVolume(items));
      setCumulativeData(buildCumulativeData(items));
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const [inboxRes, balancesRes, summaryRes, pending24hRes, chartDataRes] =
      await Promise.all([
        supabase.from('inbox_items').select('status, amount'),
        supabase.from('v_client_balances').select('*'),
        supabase.from('v_inbox_summary').select('*'),
        supabase.from('v_pending_24h').select('id', { count: 'exact' }),
        supabase.from('inbox_items').select('status, amount, created_at'),
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

    const chartItems = chartDataRes.data || [];
    setDailyVolume(buildDailyVolume(chartItems));
    setCumulativeData(buildCumulativeData(chartItems as { status: string; amount: number | null; created_at: string }[]));
    setLoading(false);
  }

  const pieData = useMemo(() => {
    return summary
      .filter((s) => s.count > 0)
      .map((s) => ({
        name: STATUS_CHART_LABELS[s.status] || s.status,
        value: s.count,
        fill: STATUS_CHART_COLORS[s.status] || '#6b7280',
      }));
  }, [summary]);

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
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 text-primary" />
          Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Vista general de la operacion
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
          subtitle="Requieren atencion"
          icon={AlertTriangle}
          color="bg-red-500/10 text-red-400"
          trend={stats.pendientes24h > 0 ? 'down' : undefined}
        />
      </div>

      {/* Charts Row 1: Bar + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar Chart - Daily Volume */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              Volumen Diario (14 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dailyVolume.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyVolume} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={{ stroke: '#475569' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={{ stroke: '#475569' }}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="recibidos"
                    name="Recibidos"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={24}
                  />
                  <Bar
                    dataKey="verificados"
                    name="Verificados"
                    fill="#22c55e"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm py-16 text-center">
                No hay datos para mostrar
              </p>
            )}
          </CardContent>
        </Card>

        {/* Pie/Donut Chart - Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-purple-400" />
              Por Estado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltipContent />} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) => (
                      <span className="text-muted-foreground text-xs">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm py-16 text-center">
                No hay comprobantes
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chart Row 2: Area Chart - Cumulative Verified */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            Monto Verificado Acumulado (30 dias)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cumulativeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={cumulativeData}>
                <defs>
                  <linearGradient id="gradientVerified" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={{ stroke: '#475569' }}
                  tickLine={false}
                  interval={4}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={{ stroke: '#475569' }}
                  tickLine={false}
                  tickFormatter={(v: number) =>
                    v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()
                  }
                />
                <Tooltip content={<AreaTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="monto"
                  name="Acumulado"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#gradientVerified)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-12 text-center">
              No hay datos para mostrar
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Saldos por Cliente */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              Saldos por Cliente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {balances.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">
                No hay clientes con movimientos
              </p>
            ) : (
              <div className="space-y-3">
                {balances.map((b) => (
                  <div
                    key={b.client_id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted transition"
                  >
                    <div>
                      <p className="text-foreground text-sm font-medium">
                        {b.client_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Credito: {formatCurrency(b.total_credito)} | Debito:{' '}
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
          </CardContent>
        </Card>

        {/* Resumen por Estado */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              Resumen por Estado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">
                No hay comprobantes aun
              </p>
            ) : (
              <div className="space-y-3">
                {summary.map((s) => {
                  const total = summary.reduce((acc, x) => acc + x.count, 0);
                  const pct = total > 0 ? (s.count / total) * 100 : 0;
                  return (
                    <div key={s.status}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-muted-foreground text-sm capitalize">
                          {s.status.replace(/_/g, ' ')}
                        </span>
                        <span className="text-foreground text-sm font-medium">
                          {s.count}
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
