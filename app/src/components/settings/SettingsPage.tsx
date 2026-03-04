'use client';

import { useState, useEffect } from 'react';
import { isDemoMode } from '@/lib/use-demo';
import { DEMO_PROFILE } from '@/lib/demo-data';
import { ROLE_LABELS } from '@/lib/utils';
import CommissionRulesPanel from './CommissionRulesPanel';
import {
  Settings,
  Building2,
  Percent,
  Bell,
  Users,
  Save,
  Pencil,
} from 'lucide-react';
import type { Profile, UserRole } from '@/types/database';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

type Tab = 'general' | 'comisiones' | 'notificaciones' | 'usuarios';

const DEMO_USERS: Profile[] = [
  DEMO_PROFILE,
  { id: 'demo-user-2', full_name: 'Maria Contable', role: 'contable', is_active: true, created_at: '2025-02-01T10:00:00Z', updated_at: '2025-02-01T10:00:00Z' },
  { id: 'demo-user-3', full_name: 'Juan Vendedor', role: 'vendedor', is_active: true, created_at: '2025-02-15T10:00:00Z', updated_at: '2025-02-15T10:00:00Z' },
  { id: 'demo-user-4', full_name: 'Carlos Operativo', role: 'operativo', is_active: false, created_at: '2025-03-01T10:00:00Z', updated_at: '2025-03-01T10:00:00Z' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [companyName, setCompanyName] = useState('Gestion Integral');
  const [timezone, setTimezone] = useState('America/Argentina/Buenos_Aires');
  const [defaultCurrency, setDefaultCurrency] = useState('ARS');
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);
  const [notifyNew, setNotifyNew] = useState(true);
  const [notifyVerified, setNotifyVerified] = useState(true);
  const [notifyRejected, setNotifyRejected] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('operativo');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);

    if (isDemoMode()) {
      setCompanyName('Financiera Demo');
      setUsers(DEMO_USERS);
      setLoading(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const [configRes, usersRes] = await Promise.all([
      supabase.from('system_config').select('key, value'),
      supabase.from('profiles').select('*').order('full_name'),
    ]);

    const configs = (configRes.data || []) as { key: string; value: Record<string, unknown> }[];
    for (const c of configs) {
      if (c.key === 'company_name' && typeof c.value === 'object' && 'value' in c.value) {
        setCompanyName(c.value.value as string);
      }
      if (c.key === 'timezone' && typeof c.value === 'object' && 'value' in c.value) {
        setTimezone(c.value.value as string);
      }
      if (c.key === 'default_currency' && typeof c.value === 'object' && 'value' in c.value) {
        setDefaultCurrency(c.value.value as string);
      }
      if (c.key === 'realtime_enabled' && typeof c.value === 'object' && 'value' in c.value) {
        setRealtimeEnabled(c.value.value as boolean);
      }
    }

    setUsers((usersRes.data as Profile[]) || []);
    setLoading(false);
  }

  async function saveGeneral() {
    setSaving(true);

    if (isDemoMode()) {
      setSaving(false);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const configs = [
      { key: 'company_name', value: { value: companyName } },
      { key: 'timezone', value: { value: timezone } },
      { key: 'default_currency', value: { value: defaultCurrency } },
    ];

    for (const c of configs) {
      await supabase.from('system_config').upsert({
        key: c.key,
        value: c.value,
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
    }

    setSaving(false);
  }

  async function saveNotifications() {
    setSaving(true);

    if (!isDemoMode()) {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from('system_config').upsert({
        key: 'realtime_enabled',
        value: { value: realtimeEnabled },
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
    }

    setSaving(false);
  }

  async function updateUserRole(userId: string, role: UserRole) {
    if (isDemoMode()) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      setEditingUser(null);
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('profiles').update({ role }).eq('id', userId);
    setEditingUser(null);
    loadSettings();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-6 h-6 text-blue-400" />
          Configuracion
        </h1>
        <p className="text-muted-foreground mt-1">Parametros del sistema</p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general" onValueChange={(v) => setActiveTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="general">
            <Building2 className="w-4 h-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="comisiones">
            <Percent className="w-4 h-4" />
            Comisiones
          </TabsTrigger>
          <TabsTrigger value="notificaciones">
            <Bell className="w-4 h-4" />
            Notificaciones
          </TabsTrigger>
          <TabsTrigger value="usuarios">
            <Users className="w-4 h-4" />
            Usuarios
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardContent className="space-y-4 max-w-lg">
              <div className="space-y-2">
                <Label htmlFor="companyName">Nombre de la empresa</Label>
                <Input
                  id="companyName"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Moneda por defecto</Label>
                <Select value={defaultCurrency} onValueChange={setDefaultCurrency}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">ARS (Peso Argentino)</SelectItem>
                    <SelectItem value="USD">USD (Dolar Estadounidense)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/Argentina/Buenos_Aires">Buenos Aires (ART)</SelectItem>
                    <SelectItem value="America/Sao_Paulo">Sao Paulo (BRT)</SelectItem>
                    <SelectItem value="America/New_York">New York (EST)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={saveGeneral} disabled={saving}>
                <Save className="w-4 h-4" />
                Guardar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comisiones">
          <CommissionRulesPanel />
        </TabsContent>

        <TabsContent value="notificaciones">
          <Card>
            <CardContent className="space-y-4 max-w-lg">
              <div className="flex items-center justify-between py-3 border-b border-border">
                <div>
                  <p className="text-foreground text-sm font-medium">Notificaciones en tiempo real</p>
                  <p className="text-xs text-muted-foreground">Recibir toasts cuando ocurran eventos</p>
                </div>
                <Switch checked={realtimeEnabled} onCheckedChange={setRealtimeEnabled} />
              </div>
              <div className="flex items-center justify-between py-3 border-b border-border">
                <div>
                  <p className="text-foreground text-sm">Nuevos comprobantes</p>
                </div>
                <Switch checked={notifyNew} onCheckedChange={setNotifyNew} />
              </div>
              <div className="flex items-center justify-between py-3 border-b border-border">
                <div>
                  <p className="text-foreground text-sm">Verificaciones</p>
                </div>
                <Switch checked={notifyVerified} onCheckedChange={setNotifyVerified} />
              </div>
              <div className="flex items-center justify-between py-3 border-b border-border">
                <div>
                  <p className="text-foreground text-sm">Rechazos</p>
                </div>
                <Switch checked={notifyRejected} onCheckedChange={setNotifyRejected} />
              </div>
              <Button onClick={saveNotifications} disabled={saving}>
                <Save className="w-4 h-4" />
                Guardar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usuarios">
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Nombre</TableHead>
                    <TableHead className="text-left">Rol</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium text-foreground">{u.full_name}</TableCell>
                      <TableCell>
                        {editingUser?.id === u.id ? (
                          <div className="flex items-center gap-2">
                            <Select value={editRole} onValueChange={(v) => setEditRole(v as UserRole)}>
                              <SelectTrigger className="w-auto">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                                  <SelectItem key={k} value={k}>{v}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="xs"
                              onClick={() => updateUserRole(u.id, editRole)}
                              className="bg-green-600 hover:bg-green-500 text-white"
                            >
                              OK
                            </Button>
                            <Button
                              size="xs"
                              variant="secondary"
                              onClick={() => setEditingUser(null)}
                            >
                              X
                            </Button>
                          </div>
                        ) : (
                          <Badge variant="secondary" className="bg-blue-500/10 text-blue-400">
                            {ROLE_LABELS[u.role] || u.role}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="secondary"
                          className={u.is_active ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground'}
                        >
                          {u.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => {
                            setEditingUser(u);
                            setEditRole(u.role);
                          }}
                          className="text-muted-foreground hover:text-blue-400"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
