import { create } from 'zustand';
import type { Profile } from '@/types/database';

export interface Toast {
  id: string;
  type: 'nuevo_comprobante' | 'verificado' | 'rechazado' | 'conciliado';
  text: string;
  timestamp: string;
  href?: string;
}

interface AppStore {
  profile: Profile | null;
  setProfile: (profile: Profile | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  // Badge count for Comprobantes sidebar item
  inboxUnprocessedCount: number;
  setInboxUnprocessedCount: (count: number) => void;
  // Notifications / Toasts
  notifications: Toast[];
  addNotification: (toast: Toast) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  sidebarOpen: true,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  inboxUnprocessedCount: 0,
  setInboxUnprocessedCount: (inboxUnprocessedCount) => set({ inboxUnprocessedCount }),
  // Notifications
  notifications: [],
  addNotification: (toast) =>
    set((s) => ({
      notifications: [...s.notifications.slice(-19), toast], // keep last 20
    })),
  removeNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),
  clearNotifications: () => set({ notifications: [] }),
}));
