'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  LayoutDashboard,
  FileCheck,
  Users,
  Landmark,
  BookOpen,
  GitCompareArrows,
  Shield,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  MessageSquare,
  CalendarCheck,
  Settings,
  AlertOctagon,
  Search,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { isDemoMode } from '@/lib/use-demo';
import { canAccessRoute } from '@/lib/permissions';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, badge: false },
  { name: 'WhatsApp', href: '/whatsapp', icon: MessageSquare, badge: false },
  { name: 'Comprobantes', href: '/inbox', icon: FileCheck, badge: true },
  { name: 'Clientes', href: '/clients', icon: Users, badge: false },
  { name: 'Cuentas', href: '/accounts', icon: Landmark, badge: false },
  { name: 'Conciliacion', href: '/reconciliation', icon: GitCompareArrows, badge: false },
  { name: 'Cuenta Corriente', href: '/ledger', icon: BookOpen, badge: false },
  { name: 'Cierre Diario', href: '/closing', icon: CalendarCheck, badge: false },
  { name: 'Excepciones', href: '/exceptions', icon: AlertOctagon, badge: false },
  { name: 'Auditoria', href: '/audit', icon: Shield, badge: false },
  { name: 'Configuracion', href: '/settings', icon: Settings, badge: false },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { profile, sidebarOpen, toggleSidebar, inboxUnprocessedCount, setInboxUnprocessedCount } = useAppStore();
  const router = useRouter();
  const supabase = createClient();
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isDemoMode()) return;

    const fetchCount = async () => {
      try {
        const { count, error } = await supabase
          .from('inbox_items')
          .select('id', { count: 'exact', head: true })
          .in('status', ['recibido', 'ocr_procesando', 'ocr_listo']);

        if (!error && count !== null) {
          setInboxUnprocessedCount(count);
        }
      } catch {
        // Silently fail
      }
    };

    fetchCount();
    pollRef.current = setInterval(fetchCount, 30000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [supabase, setInboxUnprocessedCount]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const filteredNav = navigation.filter((item) => canAccessRoute(profile?.role, item.href));

  return (
    <aside
      className={cn(
        'flex flex-col bg-card border-r border-border transition-all duration-300 h-screen sticky top-0',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-border">
        {sidebarOpen && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">G</span>
            </div>
            <span className="font-bold text-foreground text-lg tracking-tight">
              Gestion
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="text-muted-foreground hover:text-foreground"
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-5 h-5" />
          ) : (
            <PanelLeft className="w-5 h-5" />
          )}
        </Button>
      </div>

      {/* Quick Search Hint */}
      {sidebarOpen && (
        <div className="px-3 pt-3">
          <button
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/50 text-muted-foreground text-xs hover:bg-muted transition"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Buscar...</span>
            <kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-[10px] font-mono">
              Cmd+K
            </kbd>
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          const showBadge = item.badge && inboxUnprocessedCount > 0;

          const linkContent = (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors relative',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <div className="relative shrink-0">
                <item.icon className="w-5 h-5" />
                {showBadge && !sidebarOpen && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-destructive rounded-full text-[10px] font-bold text-white flex items-center justify-center animate-pulse">
                    {inboxUnprocessedCount > 9 ? '9+' : inboxUnprocessedCount}
                  </span>
                )}
              </div>
              {sidebarOpen && (
                <>
                  <span className="flex-1">{item.name}</span>
                  {showBadge && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5 min-w-[20px] justify-center animate-pulse">
                      {inboxUnprocessedCount > 99 ? '99+' : inboxUnprocessedCount}
                    </Badge>
                  )}
                </>
              )}
            </Link>
          );

          if (!sidebarOpen) {
            return (
              <Tooltip key={item.name}>
                <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  {item.name}
                  {showBadge && ` (${inboxUnprocessedCount})`}
                </TooltipContent>
              </Tooltip>
            );
          }

          return <div key={item.name}>{linkContent}</div>;
        })}
      </nav>

      <Separator />

      {/* Profile + Logout */}
      <div className="p-3">
        {sidebarOpen && profile && (
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-medium text-foreground truncate">
              {profile.full_name}
            </p>
            <p className="text-xs text-muted-foreground capitalize">{profile.role}</p>
          </div>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              onClick={handleLogout}
              className={cn(
                'w-full text-muted-foreground hover:text-destructive',
                sidebarOpen ? 'justify-start gap-3 px-3' : 'justify-center'
              )}
            >
              <LogOut className="w-5 h-5 shrink-0" />
              {sidebarOpen && <span>Cerrar sesion</span>}
            </Button>
          </TooltipTrigger>
          {!sidebarOpen && (
            <TooltipContent side="right">Cerrar sesion</TooltipContent>
          )}
        </Tooltip>
      </div>
    </aside>
  );
}
