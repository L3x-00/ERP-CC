'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { obtenerClienteSupabaseNavegador } from '@/nucleo/supabase/cliente-navegador';

function esConsultaOportunidades(clave: QueryKey): boolean {
  return clave[0] === 'pipeline' && clave.length === 2 &&
    (clave[1] === null || (typeof clave[1] === 'object' && !Array.isArray(clave[1])));
}

/** Realtime invalida consultas; las oportunidades y líneas se releen bajo RLS. */
export function SincronizadorPipelineRealtime() {
  const consultas = useQueryClient();
  const canalRef = useRef<RealtimeChannel | null>(null);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canalId = useRef(`pipeline-${crypto.randomUUID()}`);
  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    const supabase = obtenerClienteSupabaseNavegador();
    let desmontado = false;
    let identidad: string | null = null;
    let revisionSesion = 0;

    function invalidar(): void {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = setTimeout(() => {
        temporizadorRef.current = null;
        if (desmontado) return;
        void consultas.invalidateQueries({ predicate: ({ queryKey }) => esConsultaOportunidades(queryKey) });
        void consultas.invalidateQueries({ queryKey: ['oportunidad'] });
        void consultas.invalidateQueries({ queryKey: ['clientes', 'historial', 'cotizaciones'] });
      }, 300);
    }

    function desconectar(): void {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
      const canal = canalRef.current;
      canalRef.current = null;
      if (canal) void supabase.removeChannel(canal);
      if (!desmontado) setConectado(false);
    }

    function conectar(usuarioId: string): void {
      if (desmontado) return;
      if (identidad !== usuarioId) {
        desconectar();
        if (identidad !== null) {
          void consultas.resetQueries({ predicate: ({ queryKey }) =>
            queryKey[0] === 'pipeline' || queryKey[0] === 'oportunidad' ||
            (queryKey[0] === 'clientes' && queryKey[1] === 'historial' && queryKey[2] === 'cotizaciones'),
          });
        }
        identidad = usuarioId;
      }
      if (canalRef.current) return;
      const canal = supabase.channel(canalId.current);
      for (const tabla of ['pipeline', 'cotizacion_lineas'] as const) {
        canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, invalidar);
      }
      canalRef.current = canal;
      canal.subscribe((estado) => {
        if (desmontado || canalRef.current !== canal) return;
        setConectado(estado === 'SUBSCRIBED');
        if (estado === 'SUBSCRIBED') invalidar();
      });
    }

    const alVolver = (): void => {
      if (identidad && document.visibilityState === 'visible' && navigator.onLine) invalidar();
    };
    window.addEventListener('online', alVolver);
    document.addEventListener('visibilitychange', alVolver);
    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      revisionSesion++;
      if (sesion) conectar(sesion.user.id);
      else {
        const habiaIdentidad = identidad !== null;
        identidad = null;
        desconectar();
        if (habiaIdentidad) void consultas.resetQueries({ predicate: ({ queryKey }) =>
          queryKey[0] === 'pipeline' || queryKey[0] === 'oportunidad' ||
          (queryKey[0] === 'clientes' && queryKey[1] === 'historial' && queryKey[2] === 'cotizaciones'),
        });
      }
    });
    const revisionInicial = revisionSesion;
    void supabase.auth.getSession().then(({ data }) => {
      if (revisionSesion === revisionInicial && data.session) conectar(data.session.user.id);
    });
    return () => {
      desmontado = true;
      suscripcion.subscription.unsubscribe();
      window.removeEventListener('online', alVolver);
      document.removeEventListener('visibilitychange', alVolver);
      desconectar();
    };
  }, [consultas]);

  return <span className="sr-only" data-testid="sincronizador-pipeline" data-conectado={conectado ? 'true' : 'false'} aria-live="polite">{conectado ? 'Pipeline sincronizado' : 'Conectando pipeline'}</span>;
}
