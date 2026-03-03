import { create } from 'zustand';
import type { Profile } from '@/types/database';

interface AppStore {
  profile: Profile | null;
  setProfile: (profile: Profile | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  sidebarOpen: true,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
