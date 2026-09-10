'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { obtenerClienteSupabaseNavegador } from '@/nucleo/supabase/cliente-navegador';
import { CLAVE_GASTOS, CLAVE_RENTABILIDAD_GASTOS } from '@/modulos/gastos/componentes/claves-consulta';

const TABLAS_GASTOS = [
  'gastos',
  'cuentas_por_cobrar',
  'registros_consumo_material',
  'sesiones_trabajo',
] as const;

/** Realtime invalida consultas autorizadas; nunca usa el payload como fuente de datos. */
export function SincronizadorGastosRealtime() {
  const clienteQuery = useQueryClient();
  const [conectado, setConectado] = useState(false);
  const [eventos, setEventos] = useState(0);
  const canalRef = useRef<RealtimeChannel | null>(null);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCanalRef = useRef('sincronizacion-gastos-' + crypto.randomUUID());

  useEffect(() => {
    const supabase = obtenerClienteSupabaseNavegador();
    let desmontado = false;
    const invalidar = (): void => {
      setEventos((actual) => actual + 1);
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = setTimeout(() => {
        temporizadorRef.current = null;
        if (!desmontado) {
          void clienteQuery.invalidateQueries({ queryKey: CLAVE_GASTOS });
          void clienteQuery.invalidateQueries({ queryKey: CLAVE_RENTABILIDAD_GASTOS });
        }
      }, 350);
    };
    const conectar = (): void => {
      if (desmontado || canalRef.current) return;
      const canal = supabase.channel(idCanalRef.current);
      for (const tabla of TABLAS_GASTOS) {
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
  }, [clienteQuery]);

  return (
    <span className="sr-only" data-testid="sincronizador-gastos" data-conectado={conectado ? 'true' : 'false'} data-eventos={eventos} aria-live="polite">
      {conectado ? 'Sincronización de Gastos conectada' : 'Sincronización de Gastos conectando'}
    </span>
  );
}
