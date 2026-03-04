'use client';

import { useState, useEffect } from 'react';
import { isDemoMode } from '@/lib/use-demo';
import { DEMO_CLIENTS } from '@/lib/demo-data';
import { formatCurrency } from '@/lib/utils';
import {
  Plus,
  Pencil,
  Trash2,
  Percent,
  DollarSign,
  Save,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

interface CommissionRule {
  id: string;
  client_id: string | null;
  percentage: number;
  fixed_fee: number;
  min_amount: number;
  max_amount: number | null;
  is_active: boolean;
  created_at: string;
  client?: { name: string } | null;
}

interface ClientOption {
  id: string;
  name: string;
}

const DEMO_RULES: CommissionRule[] = [
  {
    id: 'rule-1',
    client_id: null,
    percentage: 1.5,
    fixed_fee: 0,
    min_amount: 0,
    max_amount: null,
    is_active: true,
    created_at: new Date().toISOString(),
    client: null,
  },
  {
    id: 'rule-2',
    client_id: 'client-1',
    percentage: 1.0,
    fixed_fee: 500,
    min_amount: 10000,
    max_amount: null,
    is_active: true,
    created_at: new Date().toISOString(),
    client: { name: 'Mutual Rosario' },
  },
];

export default function CommissionRulesPanel() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CommissionRule | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    client_id: '',
    percentage: '1.00',
    fixed_fee: '0',
    min_amount: '0',
    max_amount: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    if (isDemoMode()) {
      setRules(DEMO_RULES);
      setClients(DEMO_CLIENTS.map((c) => ({ id: c.id, name: c.name })));
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const [rulesRes, clientsRes] = await Promise.all([
      supabase.from('commission_rules').select('*, client:b2b_clients(name)').order('created_at', { ascending: false }),
      supabase.from('b2b_clients').select('id, name').eq('is_active', true).order('name'),
    ]);
    setRules((rulesRes.data as CommissionRule[]) || []);
    setClients((clientsRes.data as ClientOption[]) || []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ client_id: '', percentage: '1.00', fixed_fee: '0', min_amount: '0', max_amount: '' });
    setShowForm(true);
  }

  function openEdit(rule: CommissionRule) {
    setEditing(rule);
    setForm({
      client_id: rule.client_id || '',
      percentage: rule.percentage.toString(),
      fixed_fee: rule.fixed_fee.toString(),
      min_amount: rule.min_amount.toString(),
      max_amount: rule.max_amount?.toString() || '',
    });
    setShowForm(true);
  }

  async function handleSave() {
    const data = {
      client_id: form.client_id || null,
      percentage: parseFloat(form.percentage) || 1,
      fixed_fee: parseFloat(form.fixed_fee) || 0,
      min_amount: parseFloat(form.min_amount) || 0,
      max_amount: form.max_amount ? parseFloat(form.max_amount) : null,
      is_active: true,
    };

    if (isDemoMode()) {
      if (editing) {
        setRules((prev) =>
          prev.map((r) =>
            r.id === editing.id
              ? {
                  ...r,
                  ...data,
                  client: data.client_id
                    ? { name: clients.find((c) => c.id === data.client_id)?.name || '' }
                    : null,
                }
              : r
          )
        );
      } else {
        const newRule: CommissionRule = {
          id: `rule-${Date.now()}`,
          ...data,
          created_at: new Date().toISOString(),
          client: data.client_id
            ? { name: clients.find((c) => c.id === data.client_id)?.name || '' }
            : null,
        };
        setRules((prev) => [newRule, ...prev]);
      }
      setShowForm(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    if (editing) {
      await supabase.from('commission_rules').update(data).eq('id', editing.id);
    } else {
      await supabase.from('commission_rules').insert(data);
    }
    setShowForm(false);
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm('Eliminar esta regla de comision?')) return;
    if (isDemoMode()) {
      setRules((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('commission_rules').delete().eq('id', id);
    loadData();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-foreground font-semibold flex items-center gap-2">
            <Percent className="w-4 h-4 text-yellow-400" />
            Reglas de Comision
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Comision general (sin cliente) aplica como default. Reglas por cliente tienen prioridad.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Nueva Regla
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <Card className="py-0">
          <CardContent className="py-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cliente (vacio = general)</Label>
                <Select
                  value={form.client_id || '_none'}
                  onValueChange={(val) => setForm({ ...form, client_id: val === '_none' ? '' : val })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="-- General (todos) --" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">-- General (todos) --</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Porcentaje (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.percentage}
                  onChange={(e) => setForm({ ...form, percentage: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fee fijo ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.fixed_fee}
                  onChange={(e) => setForm({ ...form, fixed_fee: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Monto minimo</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.min_amount}
                  onChange={(e) => setForm({ ...form, min_amount: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button onClick={handleSave}>
                <Save className="w-4 h-4" />
                {editing ? 'Actualizar' : 'Crear'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                <X className="w-4 h-4" />
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules table */}
      {rules.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">
          No hay reglas de comision configuradas
        </p>
      ) : (
        <Card className="py-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Cliente</TableHead>
                <TableHead className="px-4 text-right">Porcentaje</TableHead>
                <TableHead className="px-4 text-right">Fee Fijo</TableHead>
                <TableHead className="px-4 text-right">Min. Monto</TableHead>
                <TableHead className="px-4 text-center">Estado</TableHead>
                <TableHead className="px-4 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="px-4 py-3 text-foreground">
                    {rule.client?.name || (
                      <span className="text-muted-foreground italic flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        General (todos)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-yellow-400 font-medium">{rule.percentage}%</TableCell>
                  <TableCell className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(rule.fixed_fee)}</TableCell>
                  <TableCell className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(rule.min_amount)}</TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    <Badge className={rule.is_active ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground'}>
                      {rule.is_active ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(rule)}
                        className="text-muted-foreground hover:text-blue-400"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(rule.id)}
                        className="text-muted-foreground hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
