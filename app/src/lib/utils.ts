import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
  pendiente_verificacion: 'Pendiente Verificación',
  verificado: 'Verificado',
  rechazado: 'Rechazado',
  aplicado: 'Aplicado',
  duplicado: 'Duplicado',
};

export const STATUS_COLORS: Record<string, string> = {
  recibido: 'bg-blue-100 text-blue-800',
  ocr_procesando: 'bg-yellow-100 text-yellow-800',
  ocr_listo: 'bg-indigo-100 text-indigo-800',
  pendiente_verificacion: 'bg-orange-100 text-orange-800',
  verificado: 'bg-green-100 text-green-800',
  rechazado: 'bg-red-100 text-red-800',
  aplicado: 'bg-emerald-100 text-emerald-800',
  duplicado: 'bg-gray-100 text-gray-800',
};

export const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  contable: 'Contable',
  vendedor: 'Vendedor',
  operativo: 'Operativo',
};
