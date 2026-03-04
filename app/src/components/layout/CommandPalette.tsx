'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { isDemoMode } from '@/lib/use-demo';
import { DEMO_CLIENTS, DEMO_ACCOUNTS, DEMO_INBOX } from '@/lib/demo-data';
import {
  Users,
  Landmark,
  FileCheck,
  LayoutDashboard,
  MessageSquare,
  BookOpen,
  GitCompareArrows,
  Shield,
  CalendarCheck,
  Settings,
  AlertOctagon,
} from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';

interface SearchResult {
  id: string;
  type: 'client' | 'account' | 'comprobante' | 'nav';
  title: string;
  subtitle?: string;
  href: string;
  icon: React.ElementType;
}

const NAV_ITEMS: SearchResult[] = [
  { id: 'nav-dashboard', type: 'nav', title: 'Dashboard', href: '/', icon: LayoutDashboard },
  { id: 'nav-whatsapp', type: 'nav', title: 'WhatsApp', href: '/whatsapp', icon: MessageSquare },
  { id: 'nav-inbox', type: 'nav', title: 'Comprobantes', href: '/inbox', icon: FileCheck },
  { id: 'nav-clients', type: 'nav', title: 'Clientes', href: '/clients', icon: Users },
  { id: 'nav-accounts', type: 'nav', title: 'Cuentas', href: '/accounts', icon: Landmark },
  { id: 'nav-reconciliation', type: 'nav', title: 'Conciliacion', href: '/reconciliation', icon: GitCompareArrows },
  { id: 'nav-ledger', type: 'nav', title: 'Cuenta Corriente', href: '/ledger', icon: BookOpen },
  { id: 'nav-closing', type: 'nav', title: 'Cierre Diario', href: '/closing', icon: CalendarCheck },
  { id: 'nav-exceptions', type: 'nav', title: 'Excepciones', href: '/exceptions', icon: AlertOctagon },
  { id: 'nav-audit', type: 'nav', title: 'Auditoria', href: '/audit', icon: Shield },
  { id: 'nav-settings', type: 'nav', title: 'Configuracion', href: '/settings', icon: Settings },
];

const TYPE_LABELS: Record<string, string> = {
  client: 'Clientes',
  account: 'Cuentas',
  comprobante: 'Comprobantes',
  nav: 'Navegacion',
};

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults(NAV_ITEMS);
    }
  }, [open]);

  const performSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        // Show nav items when empty
        setResults(NAV_ITEMS);
        return;
      }

      setLoading(true);
      const term = q.toLowerCase();
      const allResults: SearchResult[] = [];

      // Nav items
      const navResults = NAV_ITEMS.filter(
        (n) => n.title.toLowerCase().includes(term)
      ).slice(0, 3);

      if (isDemoMode()) {
        // Clients
        const clientResults = DEMO_CLIENTS.filter(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            c.business_name?.toLowerCase().includes(term) ||
            c.tax_id?.includes(term)
        )
          .slice(0, 5)
          .map((c) => ({
            id: `client-${c.id}`,
            type: 'client' as const,
            title: c.name,
            subtitle: c.tax_id || c.business_name || undefined,
            href: '/clients',
            icon: Users,
          }));

        // Accounts
        const accountResults = DEMO_ACCOUNTS.filter(
          (a) =>
            a.name.toLowerCase().includes(term) ||
            a.bank_name?.toLowerCase().includes(term) ||
            a.cbu?.includes(term)
        )
          .slice(0, 5)
          .map((a) => ({
            id: `account-${a.id}`,
            type: 'account' as const,
            title: a.name,
            subtitle: a.bank_name || undefined,
            href: '/accounts',
            icon: Landmark,
          }));

        // Comprobantes
        const inboxResults = DEMO_INBOX.filter(
          (i) =>
            i.reference_number?.toLowerCase().includes(term) ||
            i.amount?.toString().includes(term) ||
            i.wa_phone_number?.includes(term)
        )
          .slice(0, 5)
          .map((i) => ({
            id: `inbox-${i.id}`,
            type: 'comprobante' as const,
            title: i.reference_number || i.id.slice(0, 8),
            subtitle: i.amount ? `$${i.amount.toLocaleString()}` : undefined,
            href: '/inbox',
            icon: FileCheck,
          }));

        allResults.push(...clientResults, ...accountResults, ...inboxResults, ...navResults);
      } else {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();

        const [clientsRes, accountsRes, inboxRes] = await Promise.all([
          supabase
            .from('b2b_clients')
            .select('id, name, business_name, tax_id')
            .or(`name.ilike.%${term}%,business_name.ilike.%${term}%,tax_id.ilike.%${term}%`)
            .limit(5),
          supabase
            .from('accounts')
            .select('id, name, bank_name, cbu')
            .or(`name.ilike.%${term}%,bank_name.ilike.%${term}%,cbu.ilike.%${term}%`)
            .limit(5),
          supabase
            .from('inbox_items')
            .select('id, reference_number, amount, wa_phone_number')
            .or(`reference_number.ilike.%${term}%,wa_phone_number.ilike.%${term}%`)
            .limit(5),
        ]);

        const clientResults = (clientsRes.data || []).map((c) => ({
          id: `client-${c.id}`,
          type: 'client' as const,
          title: c.name,
          subtitle: c.tax_id || c.business_name || undefined,
          href: '/clients',
          icon: Users,
        }));

        const accountResults = (accountsRes.data || []).map((a) => ({
          id: `account-${a.id}`,
          type: 'account' as const,
          title: a.name,
          subtitle: a.bank_name || undefined,
          href: '/accounts',
          icon: Landmark,
        }));

        const inboxResults = (inboxRes.data || []).map((i) => ({
          id: `inbox-${i.id}`,
          type: 'comprobante' as const,
          title: i.reference_number || i.id.slice(0, 8),
          subtitle: i.amount ? `$${i.amount.toLocaleString()}` : undefined,
          href: '/inbox',
          icon: FileCheck,
        }));

        allResults.push(...clientResults, ...accountResults, ...inboxResults, ...navResults);
      }

      setResults(allResults);
      setLoading(false);
    },
    []
  );

  function handleInputChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(value), 300);
  }

  function handleSelect(result: SearchResult) {
    router.push(result.href);
    setOpen(false);
  }

  // Group results by type
  const grouped = results.reduce((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  const groupEntries = Object.entries(grouped);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Buscar"
      description="Buscar clientes, cuentas, comprobantes y navegacion"
      showCloseButton={false}
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Buscar clientes, cuentas, comprobantes..."
        value={query}
        onValueChange={handleInputChange}
      />
      <CommandList className="max-h-[50vh]">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <CommandEmpty>Sin resultados para &quot;{query}&quot;</CommandEmpty>
            {groupEntries.map(([type, items], groupIndex) => (
              <div key={type}>
                {groupIndex > 0 && <CommandSeparator />}
                <CommandGroup heading={TYPE_LABELS[type] || type}>
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <CommandItem
                        key={item.id}
                        value={item.id}
                        onSelect={() => handleSelect(item)}
                      >
                        <Icon className="size-4 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{item.title}</p>
                          {item.subtitle && (
                            <p className="text-xs text-muted-foreground truncate">
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </div>
            ))}
          </>
        )}
      </CommandList>
      <div className="border-t border-border px-4 py-2.5 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.5 bg-muted border border-border rounded font-mono">↑↓</kbd>
          navegar
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.5 bg-muted border border-border rounded font-mono">↵</kbd>
          seleccionar
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.5 bg-muted border border-border rounded font-mono">esc</kbd>
          cerrar
        </span>
      </div>
    </CommandDialog>
  );
}
