import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function timeAgo(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'hace un momento';
  if (diffMins < 60) return `hace ${diffMins}m`;
  if (diffHours < 24) return `hace ${diffHours}h`;
  if (diffDays < 7) return `hace ${diffDays}d`;
  return formatDate(date);
}

export const STATUS_LABELS: Record<string, string> = {
  recibido: 'Recibido',
  ocr_procesando: 'OCR Procesando',
  ocr_listo: 'OCR Listo',
  pendiente_verificacion: 'Pendiente Verificacion',
  verificado: 'Verificado',
  rechazado: 'Rechazado',
  aplicado: 'Aplicado',
  duplicado: 'Duplicado',
  descartado: 'Descartado',
};

export const STATUS_COLORS: Record<string, string> = {
  recibido: 'bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-400',
  ocr_procesando: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/10 dark:text-yellow-400',
  ocr_listo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-400',
  pendiente_verificacion: 'bg-orange-100 text-orange-800 dark:bg-orange-500/10 dark:text-orange-400',
  verificado: 'bg-green-100 text-green-800 dark:bg-green-500/10 dark:text-green-400',
  rechazado: 'bg-red-100 text-red-800 dark:bg-red-500/10 dark:text-red-400',
  aplicado: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400',
  duplicado: 'bg-gray-100 text-gray-800 dark:bg-gray-500/10 dark:text-gray-400',
  descartado: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-500/10 dark:text-zinc-400',
};

export const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  contable: 'Contable',
  vendedor: 'Vendedor',
  operativo: 'Operativo',
};
