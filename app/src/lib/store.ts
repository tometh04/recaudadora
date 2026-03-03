import { create } from 'zustand';
import type { Profile } from '@/types/database';

interface AppStore {
  profile: Profile | null;
  setProfile: (profile: Profile | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  // Badge count for Comprobantes sidebar item
  inboxUnprocessedCount: number;
  setInboxUnprocessedCount: (count: number) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  sidebarOpen: true,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  inboxUnprocessedCount: 0,
  setInboxUnprocessedCount: (inboxUnprocessedCount) => set({ inboxUnprocessedCount }),
}));
