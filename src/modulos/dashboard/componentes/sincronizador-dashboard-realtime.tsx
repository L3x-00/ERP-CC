'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { obtenerClienteSupabaseNavegador } from '@/nucleo/supabase/cliente-navegador';
import { CLAVE_DASHBOARD } from '@/modulos/dashboard/componentes/claves-consulta';

const TABLAS_DASHBOARD = [
  'pipeline',
  'cotizacion_lineas',
  'ordenes_produccion',
  'cuentas_por_cobrar',
  'pagos_ar',
  'gastos',
  'sesiones_trabajo',
  'registros_consumo_material',
  'metas_vendedor',
] as const;

/** Realtime solo invalida la consulta autorizada; nunca usa el payload como dato. */
export function SincronizadorDashboardRealtime() {
  const clienteQuery = useQueryClient();
  const [conectado, setConectado] = useState(false);
  const canalRef = useRef<RealtimeChannel | null>(null);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCanalRef = useRef(`sincronizacion-dashboard-${crypto.randomUUID()}`);

  useEffect(() => {
    const supabase = obtenerClienteSupabaseNavegador();
    let desmontado = false;
    let identidad: string | null = null;
    let revisionSesion = 0;
    const invalidar = (): void => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = setTimeout(() => {
        temporizadorRef.current = null;
        if (!desmontado) void clienteQuery.invalidateQueries({ queryKey: CLAVE_DASHBOARD });
      }, 350);
    };
    const conectar = (): void => {
      if (desmontado || canalRef.current) return;
      const canal = supabase.channel(idCanalRef.current);
      for (const tabla of TABLAS_DASHBOARD) canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, invalidar);
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

  return <span className="sr-only" data-testid="sincronizador-dashboard" data-conectado={conectado ? 'true' : 'false'} aria-live="polite">{conectado ? 'Sincronización del dashboard conectada' : 'Sincronización del dashboard conectando'}</span>;
}
