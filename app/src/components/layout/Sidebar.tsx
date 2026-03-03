'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
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
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { isDemoMode } from '@/lib/use-demo';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, badge: false },
  { name: 'WhatsApp', href: '/whatsapp', icon: MessageSquare, badge: false },
  { name: 'Comprobantes', href: '/inbox', icon: FileCheck, badge: true },
  { name: 'Clientes', href: '/clients', icon: Users, badge: false },
  { name: 'Cuentas', href: '/accounts', icon: Landmark, badge: false },
  { name: 'Conciliacion', href: '/reconciliation', icon: GitCompareArrows, badge: false },
  { name: 'Cuenta Corriente', href: '/ledger', icon: BookOpen, badge: false },
  { name: 'Auditoria', href: '/audit', icon: Shield, badge: false },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { profile, sidebarOpen, toggleSidebar, inboxUnprocessedCount, setInboxUnprocessedCount } = useAppStore();
  const router = useRouter();
  const supabase = createClient();
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Poll unprocessed inbox count every 30s
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

  return (
    <aside
      className={cn(
        'flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-300 h-screen sticky top-0',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-slate-800">
        {sidebarOpen && (
          <span className="font-bold text-white text-lg tracking-tight">
            Gestion
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-5 h-5" />
          ) : (
            <PanelLeft className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          const showBadge = item.badge && inboxUnprocessedCount > 0;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition relative',
                isActive
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
            >
              <div className="relative shrink-0">
                <item.icon className="w-5 h-5" />
                {showBadge && !sidebarOpen && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center animate-pulse">
                    {inboxUnprocessedCount > 9 ? '9+' : inboxUnprocessedCount}
                  </span>
                )}
              </div>
              {sidebarOpen && (
                <>
                  <span className="flex-1">{item.name}</span>
                  {showBadge && (
                    <span className="ml-auto px-1.5 py-0.5 bg-red-500 rounded-full text-[10px] font-bold text-white min-w-[20px] text-center animate-pulse">
                      {inboxUnprocessedCount > 99 ? '99+' : inboxUnprocessedCount}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Profile + Logout */}
      <div className="p-3 border-t border-slate-800">
        {sidebarOpen && profile && (
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-medium text-white truncate">
              {profile.full_name}
            </p>
            <p className="text-xs text-slate-500 capitalize">{profile.role}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-slate-800 transition"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {sidebarOpen && <span>Cerrar sesion</span>}
        </button>
      </div>
    </aside>
  );
}
