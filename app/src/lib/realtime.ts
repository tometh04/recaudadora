'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { isDemoMode } from '@/lib/use-demo';

const DEMO_MESSAGES = [
  { type: 'nuevo_comprobante' as const, text: 'Nuevo comprobante recibido de Mutual Rosario' },
  { type: 'verificado' as const, text: 'Comprobante #TK-001 verificado por $29,000' },
  { type: 'verificado' as const, text: 'Comprobante #TK-005 verificado por $63,400' },
  { type: 'nuevo_comprobante' as const, text: 'Nuevo comprobante recibido de Cooperativa Sur' },
  { type: 'conciliado' as const, text: 'Conciliacion confirmada: TK-001 ↔ TX Banco Macro' },
  { type: 'rechazado' as const, text: 'Comprobante #TK-009 rechazado: imagen ilegible' },
];

export function useRealtimeNotifications() {
  const { addNotification } = useAppStore();
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const demoTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isDemoMode()) {
      // Demo: simulate random notifications every 20s
      let idx = 0;
      demoTimerRef.current = setInterval(() => {
        const msg = DEMO_MESSAGES[idx % DEMO_MESSAGES.length];
        addNotification({
          id: `demo-${Date.now()}`,
          type: msg.type,
          text: msg.text,
          timestamp: new Date().toISOString(),
          href: '/inbox',
        });
        idx++;
      }, 20000);

      return () => {
        if (demoTimerRef.current) clearInterval(demoTimerRef.current);
      };
    }

    // Production: Supabase Realtime
    let mounted = true;
    (async () => {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      const channel = supabase
        .channel('inbox-changes')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'inbox_items' },
          (payload) => {
            if (!mounted) return;
            const item = payload.new as { id: string; wa_phone_number?: string; amount?: number };
            addNotification({
              id: `rt-${item.id}`,
              type: 'nuevo_comprobante',
              text: `Nuevo comprobante recibido${item.wa_phone_number ? ` de ${item.wa_phone_number}` : ''}`,
              timestamp: new Date().toISOString(),
              href: '/inbox',
            });
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'inbox_items' },
          (payload) => {
            if (!mounted) return;
            const item = payload.new as { id: string; status: string; amount?: number; reference_number?: string };
            const oldItem = payload.old as { status?: string };
            if (item.status === oldItem?.status) return;

            if (item.status === 'verificado') {
              addNotification({
                id: `rt-ver-${item.id}`,
                type: 'verificado',
                text: `Comprobante${item.reference_number ? ` #${item.reference_number}` : ''} verificado${item.amount ? ` por $${item.amount.toLocaleString()}` : ''}`,
                timestamp: new Date().toISOString(),
                href: '/inbox',
              });
            } else if (item.status === 'rechazado') {
              addNotification({
                id: `rt-rej-${item.id}`,
                type: 'rechazado',
                text: `Comprobante${item.reference_number ? ` #${item.reference_number}` : ''} rechazado`,
                timestamp: new Date().toISOString(),
                href: '/inbox',
              });
            }
          }
        )
        .subscribe();

      subscriptionRef.current = channel;
    })();

    return () => {
      mounted = false;
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, [addNotification]);
}
