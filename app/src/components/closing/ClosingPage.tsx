'use client';

import { useState, useEffect } from 'react';
import { isDemoMode } from '@/lib/use-demo';
import { formatCurrency, formatDate } from '@/lib/utils';
import { format, subDays } from 'date-fns';
import {
  CalendarCheck,
  Lock,
  Unlock,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Save,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';

interface DaySummary {
  totalReceived: number;
  totalVerified: number;
  totalRejected: number;
  amountReceived: number;
  amountVerified: number;
  amountCommissions: number;
  pendingCount: number;
}

interface DailyClosing {
  id: string;
  closing_date: string;
  total_received: number;
  total_verified: number;
  total_rejected: number;
  amount_received: number;
  amount_verified: number;
  amount_commissions: number;
  pending_count: number;
  notes: string | null;
  closed_by: string | null;
  created_at: string;
}

function generateDemoSummary(): DaySummary {
  return {
    totalReceived: 12,
    totalVerified: 8,
    totalRejected: 1,
    amountReceived: 385000,
    amountVerified: 295000,
    amountCommissions: 4425,
    pendingCount: 3,
  };
}

const DEMO_CLOSINGS: DailyClosing[] = [
  {
    id: 'close-1',
    closing_date: format(subDays(new Date(), 1), 'yyyy-MM-dd'),
    total_received: 15,
    total_verified: 12,
    total_rejected: 2,
    amount_received: 520000,
    amount_verified: 410000,
    amount_commissions: 6150,
    pending_count: 1,
    notes: 'Dia normal, 1 pendiente de cliente Cooperativa Sur.',
    closed_by: 'demo-user-1',
    created_at: subDays(new Date(), 1).toISOString(),
  },
  {
    id: 'close-2',
    closing_date: format(subDays(new Date(), 2), 'yyyy-MM-dd'),
    total_received: 9,
    total_verified: 9,
    total_rejected: 0,
    amount_received: 280000,
    amount_verified: 280000,
    amount_commissions: 4200,
    pending_count: 0,
    notes: null,
    closed_by: 'demo-user-1',
    created_at: subDays(new Date(), 2).toISOString(),
  },
];

export default function ClosingPage() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [closings, setClosings] = useState<DailyClosing[]>([]);
  const [existingClosing, setExistingClosing] = useState<DailyClosing | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  async function loadData() {
    setLoading(true);

    if (isDemoMode()) {
      setSummary(generateDemoSummary());
      setClosings(DEMO_CLOSINGS);
      const existing = DEMO_CLOSINGS.find((c) => c.closing_date === selectedDate);
      setExistingClosing(existing || null);
      setNotes(existing?.notes || '');
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    // Load data for selected date
    const dayStart = `${selectedDate}T00:00:00`;
    const dayEnd = `${selectedDate}T23:59:59`;

    const [inboxRes, commissionsRes, closingRes, historyRes] = await Promise.all([
      supabase
        .from('inbox_items')
        .select('status, amount')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd),
      supabase
        .from('ledger_entries')
        .select('amount')
        .eq('category', 'comision')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd),
      supabase
        .from('daily_closings')
        .select('*')
        .eq('closing_date', selectedDate)
        .maybeSingle(),
      supabase
        .from('daily_closings')
        .select('*')
        .order('closing_date', { ascending: false })
        .limit(30),
    ]);

    const dayItems = inboxRes.data || [];
    const commissions = commissionsRes.data || [];

    const totalReceived = dayItems.length;
    const totalVerified = dayItems.filter((i) => i.status === 'verificado' || i.status === 'aplicado').length;
    const totalRejected = dayItems.filter((i) => i.status === 'rechazado').length;
    const pendingCount = dayItems.filter(
      (i) => !['verificado', 'aplicado', 'rechazado', 'duplicado'].includes(i.status)
    ).length;
    const amountReceived = dayItems.reduce((s, i) => s + (i.amount || 0), 0);
    const amountVerified = dayItems
      .filter((i) => i.status === 'verificado' || i.status === 'aplicado')
      .reduce((s, i) => s + (i.amount || 0), 0);
    const amountCommissions = commissions.reduce((s, c) => s + (c.amount || 0), 0);

    setSummary({
      totalReceived,
      totalVerified,
      totalRejected,
      amountReceived,
      amountVerified,
      amountCommissions,
      pendingCount,
    });

    const existing = closingRes.data as DailyClosing | null;
    setExistingClosing(existing);
    setNotes(existing?.notes || '');
    setClosings((historyRes.data as DailyClosing[]) || []);
    setLoading(false);
  }

  async function handleClose() {
    if (!summary) return;
    if (existingClosing) return;

    // Don't allow closing future dates
    const today = format(new Date(), 'yyyy-MM-dd');
    if (selectedDate > today) {
      alert('No se puede cerrar un dia futuro.');
      return;
    }

    setSaving(true);

    if (isDemoMode()) {
      const newClosing: DailyClosing = {
        id: `close-${Date.now()}`,
        closing_date: selectedDate,
        total_received: summary.totalReceived,
        total_verified: summary.totalVerified,
        total_rejected: summary.totalRejected,
        amount_received: summary.amountReceived,
        amount_verified: summary.amountVerified,
        amount_commissions: summary.amountCommissions,
        pending_count: summary.pendingCount,
        notes: notes || null,
        closed_by: 'demo-user-1',
        created_at: new Date().toISOString(),
      };
      setExistingClosing(newClosing);
      setClosings((prev) => [newClosing, ...prev]);
      setSaving(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('daily_closings').insert({
      closing_date: selectedDate,
      total_received: summary.totalReceived,
      total_verified: summary.totalVerified,
      total_rejected: summary.totalRejected,
      amount_received: summary.amountReceived,
      amount_verified: summary.amountVerified,
      amount_commissions: summary.amountCommissions,
      pending_count: summary.pendingCount,
      notes: notes || null,
      closed_by: user?.id,
    });

    if (error) {
      alert(`Error al cerrar: ${error.message}`);
    } else {
      await supabase.from('audit_events').insert({
        user_id: user?.id,
        action: 'daily_closing_created',
        entity_type: 'daily_closings',
        after_data: { closing_date: selectedDate },
      });
    }

    setSaving(false);
    loadData();
  }

  function navigateDate(dir: -1 | 1) {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + dir);
    setSelectedDate(format(d, 'yyyy-MM-dd'));
  }

  const isFuture = selectedDate > format(new Date(), 'yyyy-MM-dd');
  const isToday = selectedDate === format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CalendarCheck className="w-6 h-6 text-blue-400" />
          Cierre Diario
        </h1>
        <p className="text-muted-foreground mt-1">Resumen y cierre de operaciones por dia</p>
      </div>

      {/* Date Selector */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => navigateDate(-1)}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-auto"
        />
        <Button variant="outline" size="icon" onClick={() => navigateDate(1)}>
          <ChevronRight className="w-5 h-5" />
        </Button>
        {isToday && (
          <Badge variant="secondary" className="bg-blue-500/10 text-blue-400">Hoy</Badge>
        )}
        {existingClosing && (
          <Badge variant="secondary" className="bg-green-500/10 text-green-400 flex items-center gap-1">
            <Lock className="w-3 h-3" />
            Cerrado
          </Badge>
        )}
        {!existingClosing && !isFuture && (
          <Badge variant="secondary" className="bg-orange-500/10 text-orange-400 flex items-center gap-1">
            <Unlock className="w-3 h-3" />
            Abierto
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : summary ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="py-4">
              <CardContent className="p-4 pt-0">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span className="text-muted-foreground text-xs">Recibidos</span>
                </div>
                <p className="text-xl font-bold text-foreground">{summary.totalReceived}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(summary.amountReceived)}</p>
              </CardContent>
            </Card>
            <Card className="py-4">
              <CardContent className="p-4 pt-0">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-muted-foreground text-xs">Verificados</span>
                </div>
                <p className="text-xl font-bold text-foreground">{summary.totalVerified}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(summary.amountVerified)}</p>
              </CardContent>
            </Card>
            <Card className="py-4">
              <CardContent className="p-4 pt-0">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span className="text-muted-foreground text-xs">Rechazados</span>
                </div>
                <p className="text-xl font-bold text-foreground">{summary.totalRejected}</p>
              </CardContent>
            </Card>
            <Card className="py-4">
              <CardContent className="p-4 pt-0">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-yellow-400" />
                  <span className="text-muted-foreground text-xs">Comisiones</span>
                </div>
                <p className="text-xl font-bold text-foreground">{formatCurrency(summary.amountCommissions)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Pending alert */}
          {summary.pendingCount > 0 && (
            <Alert className="border-orange-500/20 bg-orange-500/5">
              <Clock className="w-5 h-5 text-orange-400" />
              <AlertDescription className="text-orange-300">
                <span className="font-bold">{summary.pendingCount}</span> comprobantes pendientes de verificacion.
              </AlertDescription>
            </Alert>
          )}

          {/* Close day action */}
          {!existingClosing && !isFuture && (
            <Card>
              <CardHeader>
                <CardTitle>Cerrar este dia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Notas (opcional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Observaciones del dia..."
                    rows={3}
                  />
                </div>
                <Button
                  onClick={handleClose}
                  disabled={saving}
                  className="bg-green-600 hover:bg-green-500 text-white"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Cerrar dia {formatDate(selectedDate)}
                </Button>
              </CardContent>
            </Card>
          )}

          {existingClosing?.notes && (
            <Card>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-1">Notas del cierre:</p>
                <p className="text-sm text-foreground">{existingClosing.notes}</p>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-center py-8">No hay datos para esta fecha.</p>
      )}

      {/* History */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-muted-foreground" />
            Historial de Cierres
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {closings.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No hay cierres registrados</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Fecha</TableHead>
                  <TableHead className="text-center">Recibidos</TableHead>
                  <TableHead className="text-center">Verificados</TableHead>
                  <TableHead className="text-center">Rechazados</TableHead>
                  <TableHead className="text-right">Monto Verif.</TableHead>
                  <TableHead className="text-right">Comisiones</TableHead>
                  <TableHead className="text-center">Pendientes</TableHead>
                  <TableHead className="text-left">Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closings.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedDate(c.closing_date)}
                  >
                    <TableCell className="font-medium text-foreground">{formatDate(c.closing_date)}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{c.total_received}</TableCell>
                    <TableCell className="text-center text-green-400">{c.total_verified}</TableCell>
                    <TableCell className="text-center text-red-400">{c.total_rejected}</TableCell>
                    <TableCell className="text-right text-foreground">{formatCurrency(c.amount_verified)}</TableCell>
                    <TableCell className="text-right text-yellow-400">{formatCurrency(c.amount_commissions)}</TableCell>
                    <TableCell className="text-center">
                      {c.pending_count > 0 ? (
                        <Badge variant="secondary" className="bg-orange-500/10 text-orange-400">
                          {c.pending_count}
                        </Badge>
                      ) : (
                        <span className="text-green-400 text-xs">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs truncate max-w-[200px]">{c.notes || '\u2014'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
