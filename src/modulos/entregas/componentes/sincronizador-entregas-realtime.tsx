'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { obtenerClienteSupabaseNavegador } from '@/nucleo/supabase/cliente-navegador';

/**
 * Tablas publicadas en `supabase_realtime` que afectan Entregas. `archivos` no
 * forma parte de la publicación: la evidencia se recarga cuando la propia nota
 * cambia o por la acción que la adjunta.
 */
const TABLAS_ENTREGAS = [
  'notas_entrega',
  'partidas_nota_entrega',
  'ordenes_produccion',
  'partidas_orden_produccion',
] as const;

/**
 * Una entrega desde el piso o Logística dispara varios eventos casi
 * simultáneos (nota + renglones + avance de la orden). Se agrupan para pedir
 * una sola recarga.
 */
const MS_AGRUPACION = 350;

/**
 * Mantiene la cola y el detalle de Entregas sincronizados sin recargar la
 * página. El payload de Realtime nunca llega a la UI: solo dispara una lectura
 * autorizada de los datos (misma acción del botón «Actualizar»).
 */
export function SincronizadorEntregasRealtime({
  alCambiar,
  etiqueta = 'Entregas',
}: {
  alCambiar: () => void | Promise<void>;
  etiqueta?: string;
}) {
  const [conectado, setConectado] = useState(false);
  const [eventosRecibidos, setEventosRecibidos] = useState(0);
  const canalRef = useRef<RealtimeChannel | null>(null);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCanalRef = useRef(`sincronizacion-entregas-${crypto.randomUUID()}`);
  const alCambiarRef = useRef(alCambiar);

  useEffect(() => {
    alCambiarRef.current = alCambiar;
  }, [alCambiar]);

  useEffect(() => {
    const supabase = obtenerClienteSupabaseNavegador();
    let desmontado = false;

    const recargar = (): void => {
      setEventosRecibidos((actual) => actual + 1);
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = setTimeout(() => {
        temporizadorRef.current = null;
        if (!desmontado) void alCambiarRef.current();
      }, MS_AGRUPACION);
    };

    const conectar = (): void => {
      if (desmontado || canalRef.current) return;
      const canal = supabase.channel(idCanalRef.current);
      for (const tabla of TABLAS_ENTREGAS) {
        canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, recargar);
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

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) conectar();
    });
    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      if (sesion) conectar();
      else desconectar();
    });

    return () => {
      desmontado = true;
      suscripcion.subscription.unsubscribe();
      desconectar();
    };
  }, []);

  return (
    <span
      className="sr-only"
      data-testid="sincronizador-entregas"
      data-conectado={conectado ? 'true' : 'false'}
      data-eventos={eventosRecibidos}
      aria-live="polite"
    >
      {conectado
        ? `Sincronización de ${etiqueta} conectada`
        : `Sincronización de ${etiqueta} conectando`}
    </span>
  );
}
