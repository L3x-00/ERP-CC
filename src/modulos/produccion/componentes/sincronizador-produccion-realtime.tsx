'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { obtenerClienteSupabaseNavegador } from '@/nucleo/supabase/cliente-navegador';
import { CLAVE_TABLERO_PRODUCCION } from '@/modulos/produccion/componentes/claves-consulta';

const TABLAS_TABLERO_PRODUCCION = [
  'ordenes_produccion',
  'partidas_orden_produccion',
  'programacion_areas',
  'sesiones_trabajo',
  'notas_entrega',
  'partidas_nota_entrega',
  'registros_avance_partida',
] as const;
const NOMBRE_CANAL = 'sincronizacion-produccion';
const MS_AGRUPACION_RAFAGA = 350;

/**
 * Realtime solo se�ala que se debe releer el tablero. Nunca usa el payload como
 * dato de UI; la siguiente lectura vuelve a pasar por RLS, mappers y proyecci�n.
 */
export function SincronizadorProduccionRealtime() {
  const clienteConsultas = useQueryClient();
  const [conectado, setConectado] = useState(false);
  const canalRef = useRef<RealtimeChannel | null>(null);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCanalRef = useRef(`${NOMBRE_CANAL}-${crypto.randomUUID()}`);

  useEffect(() => {
    const supabase = obtenerClienteSupabaseNavegador();
    let desmontado = false;

    function invalidarTablero(): void {
      if (temporizadorRef.current !== null) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = setTimeout(() => {
        temporizadorRef.current = null;
        if (!desmontado) {
          void clienteConsultas.invalidateQueries({ queryKey: CLAVE_TABLERO_PRODUCCION });
        }
      }, MS_AGRUPACION_RAFAGA);
    }

    function conectar(): void {
      if (desmontado || canalRef.current !== null) return;
      const canal = supabase.channel(idCanalRef.current);
      for (const tabla of TABLAS_TABLERO_PRODUCCION) {
        canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, invalidarTablero);
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
      data-testid="sincronizador-produccion"
      data-conectado={conectado ? 'true' : 'false'}
      aria-live="polite"
    >
      {conectado ? 'Sincronización de Producción conectada' : 'Sincronización de Producción conectando'}
    </span>
  );
}
