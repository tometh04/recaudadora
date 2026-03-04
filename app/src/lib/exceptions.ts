import type { ExceptionType } from '@/types/database';

export const EXCEPTION_LABELS: Record<ExceptionType, string> = {
  ticket_sin_movimiento: 'Ticket sin Movimiento',
  movimiento_sin_ticket: 'Movimiento sin Ticket',
  duplicado_probable: 'Duplicado Probable',
  ocr_baja_confianza: 'OCR Baja Confianza',
  monto_discrepante: 'Monto Discrepante',
};

export const EXCEPTION_COLORS: Record<ExceptionType, string> = {
  ticket_sin_movimiento: 'bg-orange-500/10 text-orange-400',
  movimiento_sin_ticket: 'bg-blue-500/10 text-blue-400',
  duplicado_probable: 'bg-red-500/10 text-red-400',
  ocr_baja_confianza: 'bg-yellow-500/10 text-yellow-400',
  monto_discrepante: 'bg-purple-500/10 text-purple-400',
};

export const EXCEPTION_DESCRIPTIONS: Record<ExceptionType, string> = {
  ticket_sin_movimiento: 'Comprobante verificado hace mas de 48h sin conciliacion bancaria',
  movimiento_sin_ticket: 'Movimiento bancario sin comprobante asociado',
  duplicado_probable: 'Dos comprobantes con mismo monto y cliente en menos de 24h',
  ocr_baja_confianza: 'OCR con confianza baja en monto, fecha o referencia',
  monto_discrepante: 'Conciliacion con score de coincidencia menor a 0.7',
};
