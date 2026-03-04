import type { UserRole } from '@/types/database';
import { useAppStore } from '@/lib/store';

// Permission matrix: which roles can access what
const PERMISSIONS: Record<UserRole, string[]> = {
  superadmin: ['*'],
  admin: [
    'dashboard', 'inbox', 'inbox:write',
    'clients', 'clients:write',
    'accounts', 'accounts:write',
    'reconciliation', 'reconciliation:write',
    'ledger', 'ledger:write',
    'audit',
    'closing', 'closing:write',
    'settings', 'settings:write',
    'exceptions', 'exceptions:write',
    'whatsapp',
  ],
  contable: [
    'dashboard',
    'inbox', 'inbox:write',
    'clients', 'clients:write',
    'accounts',
    'reconciliation', 'reconciliation:write',
    'ledger', 'ledger:write',
    'closing', 'closing:write',
    'exceptions',
  ],
  vendedor: [
    'dashboard',
    'inbox',
    'clients',
  ],
  operativo: [
    'dashboard',
    'inbox', 'inbox:write',
    'clients',
    'whatsapp',
  ],
};

// Sidebar nav items each role can see
export const SIDEBAR_PERMISSIONS: Record<string, UserRole[]> = {
  '/': ['superadmin', 'admin', 'contable', 'vendedor', 'operativo'],
  '/whatsapp': ['superadmin', 'admin', 'operativo'],
  '/inbox': ['superadmin', 'admin', 'contable', 'vendedor', 'operativo'],
  '/clients': ['superadmin', 'admin', 'contable', 'vendedor', 'operativo'],
  '/accounts': ['superadmin', 'admin', 'contable'],
  '/reconciliation': ['superadmin', 'admin', 'contable'],
  '/ledger': ['superadmin', 'admin', 'contable'],
  '/closing': ['superadmin', 'admin', 'contable'],
  '/exceptions': ['superadmin', 'admin', 'contable'],
  '/audit': ['superadmin', 'admin'],
  '/settings': ['superadmin', 'admin'],
};

/**
 * Check if a role has permission for a resource
 * @param role - User role
 * @param resource - Resource name (e.g., 'inbox', 'clients:write')
 */
export function hasPermission(role: UserRole | undefined | null, resource: string): boolean {
  if (!role) return false;
  const perms = PERMISSIONS[role];
  if (!perms) return false;
  if (perms.includes('*')) return true;
  return perms.includes(resource);
}

/**
 * Hook to check permission based on current user's role
 */
export function usePermission(resource: string): boolean {
  const profile = useAppStore((s) => s.profile);
  return hasPermission(profile?.role, resource);
}

/**
 * Check if a role can see a sidebar item
 */
export function canAccessRoute(role: UserRole | undefined | null, href: string): boolean {
  // If no role yet (profile loading or not set), show all items
  if (!role) return true;
  if (role === 'superadmin') return true;
  const allowed = SIDEBAR_PERMISSIONS[href];
  if (!allowed) return true; // default allow
  return allowed.includes(role);
}
