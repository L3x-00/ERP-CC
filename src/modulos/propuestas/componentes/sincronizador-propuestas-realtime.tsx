'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { obtenerClienteSupabaseNavegador } from '@/nucleo/supabase/cliente-navegador';
import { RAIZ_PROPUESTA, RAIZ_PROPUESTAS } from './claves-consulta';

/**
 * Señal de refetch para propuestas y revisiones: los eventos disparan una
 * relectura bajo RLS (sin payloads de negocio).
 */
export function SincronizadorPropuestasRealtime() {
  const consultas = useQueryClient();
  const canalRef = useRef<RealtimeChannel | null>(null);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = obtenerClienteSupabaseNavegador();

    function invalidar(): void {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = setTimeout(() => {
        temporizadorRef.current = null;
        void consultas.invalidateQueries({ queryKey: [RAIZ_PROPUESTAS] });
        void consultas.invalidateQueries({ queryKey: [RAIZ_PROPUESTA] });
      }, 300);
    }

    const canal = supabase.channel(`propuestas-${crypto.randomUUID()}`);
    canal.on('postgres_changes', { event: '*', schema: 'public', table: 'propuestas' }, invalidar);
    canal.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'propuesta_revisiones' },
      invalidar,
    );
    canalRef.current = canal;
    canal.subscribe();

    return () => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      canalRef.current = null;
      void supabase.removeChannel(canal);
    };
  }, [consultas]);

  return null;
}
