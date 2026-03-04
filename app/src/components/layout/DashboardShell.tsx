'use client';

import { useEffect } from 'react';
import Sidebar from './Sidebar';
import ToastContainer from './ToastContainer';
import CommandPalette from './CommandPalette';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeNotifications } from '@/lib/realtime';
import type { Profile } from '@/types/database';

export default function DashboardShell({
  children,
  initialProfile,
}: {
  children: React.ReactNode;
  initialProfile: Profile | null;
}) {
  const { setProfile, sidebarOpen } = useAppStore();

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile, setProfile]);

  // Listen for auth state changes
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
        setProfile(null);
      }
    });
    return () => subscription.unsubscribe();
  }, [setProfile]);

  // Subscribe to realtime notifications
  useRealtimeNotifications();

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />
      <main
        className={`flex-1 transition-all duration-300 ${
          sidebarOpen ? 'ml-0' : 'ml-0'
        }`}
      >
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
      <ToastContainer />
      <CommandPalette />
    </div>
  );
}
