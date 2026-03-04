'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { isDemoMode } from '@/lib/use-demo';
import { DEMO_CLIENTS, DEMO_ACCOUNTS, DEMO_INBOX } from '@/lib/demo-data';
import {
  Search,
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
  ArrowRight,
} from 'lucide-react';

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
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
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
      setActiveIndex(0);
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      handleSelect(results[activeIndex]);
    }
  }

  // Group results by type
  const grouped = results.reduce((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  let flatIndex = 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <div className="relative w-full max-w-xl mx-4 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar clientes, cuentas, comprobantes..."
            className="flex-1 bg-transparent text-white text-sm placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-400 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : results.length === 0 && query.trim() ? (
            <p className="text-slate-500 text-sm text-center py-8">Sin resultados para &quot;{query}&quot;</p>
          ) : (
            Object.entries(grouped).map(([type, items]) => {
              return (
                <div key={type}>
                  <p className="px-5 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    {TYPE_LABELS[type] || type}
                  </p>
                  {items.map((item) => {
                    const idx = flatIndex++;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition ${
                          idx === activeIndex ? 'bg-blue-600/20 text-white' : 'text-slate-300 hover:bg-slate-800/50'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0 text-slate-400" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{item.title}</p>
                          {item.subtitle && (
                            <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>
                          )}
                        </div>
                        {idx === activeIndex && <ArrowRight className="w-4 h-4 text-blue-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-slate-800 flex items-center gap-4 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-slate-800 border border-slate-700 rounded font-mono">↑↓</kbd>
            navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-slate-800 border border-slate-700 rounded font-mono">↵</kbd>
            seleccionar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-slate-800 border border-slate-700 rounded font-mono">esc</kbd>
            cerrar
          </span>
        </div>
      </div>
    </div>
  );
}
