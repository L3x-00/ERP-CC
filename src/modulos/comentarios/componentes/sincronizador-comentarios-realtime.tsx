'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { obtenerClienteSupabaseNavegador } from '@/nucleo/supabase/cliente-navegador';
import type { TipoEntidadComentario } from '@/modulos/comentarios/tipos/indice';

export const CLAVE_COMENTARIOS = ['comentarios'] as const;

/** Realtime sólo invalida el hilo; la relectura vuelve a pasar por RLS. */
export function SincronizadorComentariosRealtime({
  entidadTipo,
  entidadId,
}: {
  entidadTipo: TipoEntidadComentario;
  entidadId: string;
}) {
  const clienteQuery = useQueryClient();
  const [conectado, setConectado] = useState(false);
  const canalRef = useRef<RealtimeChannel | null>(null);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCanalRef = useRef(`sincronizacion-comentarios-${crypto.randomUUID()}`);

  useEffect(() => {
    const supabase = obtenerClienteSupabaseNavegador();
    let desmontado = false;
    const invalidar = (): void => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = setTimeout(() => {
        temporizadorRef.current = null;
        if (!desmontado) {
          void clienteQuery.invalidateQueries({
            queryKey: [...CLAVE_COMENTARIOS, entidadTipo, entidadId],
          });
        }
      }, 250);
    };
    const conectar = (): void => {
      if (desmontado || canalRef.current) return;
      const canal = supabase.channel(idCanalRef.current);
      canal.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comentarios_registro',
          filter: `entidad_id=eq.${entidadId}`,
        },
        invalidar,
      );
      canalRef.current = canal;
      canal.subscribe((estado) => {
        if (!desmontado) setConectado(estado === 'SUBSCRIBED');
      });
    };
    const desconectar = (): void => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
      const canal = canalRef.current;
      canalRef.current = null;
      if (canal) void supabase.removeChannel(canal);
      setConectado(false);
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
  }, [clienteQuery, entidadId, entidadTipo]);

  return (
    <span
      className="sr-only"
      data-testid="sincronizador-comentarios"
      data-conectado={conectado ? 'true' : 'false'}
      aria-live="polite"
    >
      {conectado ? 'Comentarios sincronizados' : 'Sincronización de comentarios conectando'}
    </span>
  );
}
