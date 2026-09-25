'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { obtenerClienteSupabaseNavegador } from '@/nucleo/supabase/cliente-navegador';
import { CLAVE_CONFIGURACION } from './claves-consulta';

const TABLAS_CONFIGURACION = ['configuracion_sistema', 'cuentas_bancarias', 'areas_trabajo_config', 'operadores_areas'] as const;

/** Realtime invalida y relee la configuración autorizada; nunca usa payloads. */
export function SincronizadorConfiguracionRealtime() {
  const clienteQuery = useQueryClient();
  const canalRef = useRef<RealtimeChannel | null>(null);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCanalRef = useRef(`sincronizacion-configuracion-${crypto.randomUUID()}`);
  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    const supabase = obtenerClienteSupabaseNavegador();
    let desmontado = false;
    let identidad: string | null = null;
    let revisionSesion = 0;
    const invalidar = (): void => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = setTimeout(() => {
        temporizadorRef.current = null;
        if (!desmontado) void clienteQuery.invalidateQueries({ queryKey: CLAVE_CONFIGURACION });
      }, 300);
    };
    const conectar = (): void => {
      if (desmontado || canalRef.current) return;
      const canal = supabase.channel(idCanalRef.current);
      for (const tabla of TABLAS_CONFIGURACION) canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, invalidar);
      canalRef.current = canal;
      canal.subscribe((estado) => {
        if (desmontado) return;
        setConectado(estado === 'SUBSCRIBED');
        if (estado === 'SUBSCRIBED') invalidar();
      });
    };
    const desconectar = (): void => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
      const canal = canalRef.current;
      canalRef.current = null;
      if (canal) void supabase.removeChannel(canal);
      if (!desmontado) setConectado(false);
    };
    const actualizarSesion = (usuarioId: string | null): void => {
      if (!usuarioId) { identidad = null; desconectar(); return; }
      if (identidad && identidad !== usuarioId) desconectar();
      identidad = usuarioId;
      conectar();
    };
    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      revisionSesion++;
      actualizarSesion(sesion?.user.id ?? null);
    });
    const revisionInicial = revisionSesion;
    void supabase.auth.getSession().then(({ data }) => {
      if (revisionSesion === revisionInicial) actualizarSesion(data.session?.user.id ?? null);
    });
    window.addEventListener('online', invalidar);
    return () => { desmontado = true; suscripcion.subscription.unsubscribe(); window.removeEventListener('online', invalidar); desconectar(); };
  }, [clienteQuery]);

  return <span className="sr-only" data-testid="sincronizador-configuracion" data-conectado={conectado ? 'true' : 'false'} aria-live="polite">{conectado ? 'Sincronización de configuración conectada' : 'Sincronización de configuración conectando'}</span>;
}
