'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { obtenerClienteSupabaseNavegador } from '@/nucleo/supabase/cliente-navegador';

const TABLAS_INVENTARIO = ['materiales', 'movimientos_inventario'] as const;
const NOMBRE_CANAL = 'sincronizacion-inventario';
const MS_AGRUPACION_RAFAGA = 350;
const CLAVE_INVENTARIO = ['inventario'] as const;

/**
 * Realtime solo señala que el inventario cambió. Nunca usa el payload como
 * dato de UI: la siguiente lectura pasa por RLS y mappers. Se monta una vez en
 * el panel; agrupa ráfagas para no revalidar por cada movimiento de kardex.
 */
export function SincronizadorInventarioRealtime() {
  const clienteConsultas = useQueryClient();
  const [conectado, setConectado] = useState(false);
  const canalRef = useRef<RealtimeChannel | null>(null);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCanalRef = useRef(`${NOMBRE_CANAL}-${crypto.randomUUID()}`);

  useEffect(() => {
    const supabase = obtenerClienteSupabaseNavegador();
    let desmontado = false;

    function invalidarInventario(): void {
      if (temporizadorRef.current !== null) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = setTimeout(() => {
        temporizadorRef.current = null;
        if (!desmontado) {
          void clienteConsultas.invalidateQueries({ queryKey: CLAVE_INVENTARIO });
        }
      }, MS_AGRUPACION_RAFAGA);
    }

    function conectar(): void {
      if (desmontado || canalRef.current !== null) return;
      const canal = supabase.channel(idCanalRef.current);
      for (const tabla of TABLAS_INVENTARIO) {
        canal.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: tabla },
          invalidarInventario,
        );
      }
      canalRef.current = canal;
      canal.subscribe((estado) => {
        if (!desmontado) setConectado(estado === 'SUBSCRIBED');
      });
    }

    function desconectar(): void {
      if (temporizadorRef.current !== null) {
        clearTimeout(temporizadorRef.current);
        temporizadorRef.current = null;
      }
      const canal = canalRef.current;
      if (canal) {
        canalRef.current = null;
        void supabase.removeChannel(canal);
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) conectar();
    });
    const { data: suscripcionAuth } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      if (sesion) conectar(); else desconectar();
    });
    return () => {
      desmontado = true;
      suscripcionAuth.subscription.unsubscribe();
      desconectar();
    };
  }, [clienteConsultas]);

  return (
    <span
      className="sr-only"
      data-testid="sincronizador-inventario"
      data-conectado={conectado ? 'true' : 'false'}
      aria-live="polite"
    >
      {conectado ? 'Sincronización de Inventario conectada' : 'Sincronización de Inventario conectando'}
    </span>
  );
}
