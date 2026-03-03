'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import {
  LayoutDashboard,
  Inbox,
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

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'WhatsApp', href: '/whatsapp', icon: MessageSquare },
  { name: 'Inbox', href: '/inbox', icon: Inbox },
  { name: 'Clientes', href: '/clients', icon: Users },
  { name: 'Cuentas', href: '/accounts', icon: Landmark },
  { name: 'Conciliación', href: '/reconciliation', icon: GitCompareArrows },
  { name: 'Cuenta Corriente', href: '/ledger', icon: BookOpen },
  { name: 'Auditoría', href: '/audit', icon: Shield },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { profile, sidebarOpen, toggleSidebar } = useAppStore();
  const router = useRouter();
  const supabase = createClient();

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
            Gestión
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
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition',
                isActive
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {sidebarOpen && <span>{item.name}</span>}
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
          {sidebarOpen && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}
