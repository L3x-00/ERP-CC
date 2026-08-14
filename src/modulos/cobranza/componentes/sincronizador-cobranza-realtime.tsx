'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { obtenerClienteSupabaseNavegador } from '@/nucleo/supabase/cliente-navegador';
import { CLAVE_CARTERA_COBRANZA } from '@/modulos/cobranza/componentes/claves-consulta';

// Cada cambio de saldo a favor siempre inserta un movimiento; no se suscribe a
// `clientes`, que no forma parte de la publicación Realtime de este módulo.
const TABLAS_COBRANZA = ['cuentas_por_cobrar', 'pagos_ar', 'movimientos_saldo_favor'] as const;

/** Realtime solo invalida y relee datos autorizados; los payloads nunca llegan a la UI. */
export function SincronizadorCobranzaRealtime() {
  const clienteConsultas = useQueryClient();
  const [conectado, setConectado] = useState(false);
  const [eventosRecibidos, setEventosRecibidos] = useState(0);
  const canalRef = useRef<RealtimeChannel | null>(null);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCanalRef = useRef(`sincronizacion-cobranza-${crypto.randomUUID()}`);

  useEffect(() => {
    const supabase = obtenerClienteSupabaseNavegador();
    let desmontado = false;
    const invalidar = (): void => {
      setEventosRecibidos((actual) => actual + 1);
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = setTimeout(() => {
        temporizadorRef.current = null;
        if (!desmontado) void clienteConsultas.invalidateQueries({ queryKey: CLAVE_CARTERA_COBRANZA });
      }, 350);
    };
    const conectar = (): void => {
      if (desmontado || canalRef.current) return;
      const canal = supabase.channel(idCanalRef.current);
      for (const tabla of TABLAS_COBRANZA) {
        canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, invalidar);
      }
      canalRef.current = canal;
      canal.subscribe((estado) => {
        if (!desmontado) setConectado(estado === 'SUBSCRIBED');
      });
    };
    const desconectar = (): void => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
      if (canalRef.current) {
        const canal = canalRef.current;
        canalRef.current = null;
        void supabase.removeChannel(canal);
      }
    };

    void supabase.auth.getSession().then(({ data }) => { if (data.session) conectar(); });
    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      if (sesion) conectar(); else desconectar();
    });
    return () => {
      desmontado = true;
      suscripcion.subscription.unsubscribe();
      desconectar();
    };
  }, [clienteConsultas]);

  return <span className="sr-only" data-testid="sincronizador-cobranza" data-conectado={conectado ? 'true' : 'false'} data-eventos={eventosRecibidos} aria-live="polite">{conectado ? 'Sincronización de Cobranza conectada' : 'Sincronización de Cobranza conectando'}</span>;
}
