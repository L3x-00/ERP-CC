'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { obtenerClienteSupabaseNavegador } from '@/nucleo/supabase/cliente-navegador';

/** Tablas de piso publicadas en `supabase_realtime` que afectan la vista de órdenes. */
const TABLAS_ORDENES = [
  'ordenes_produccion',
  'partidas_orden_produccion',
  'registros_tiempo_operador',
  'registros_consumo_material',
  'registros_avance_partida',
] as const;

const NOMBRE_CANAL = 'sincronizacion-ordenes';

/**
 * Una operación de piso dispara varios eventos casi simultáneos (partida +
 * consumo + avance). Se agrupan en una sola ventana para no lanzar un
 * `router.refresh()` por evento.
 */
const MS_AGRUPACION_RAFAGA = 350;

/**
 * Mantiene la vista de Órdenes sincronizada con la base de datos.
 *
 * Escucha `postgres_changes` de las tablas de producción y revalida la ruta
 * actual del servidor. Los payloads no se leen ni se pintan: el dato siempre
 * vuelve a buscarse en el servidor, ya filtrado por RLS. Solo actúa con sesión
 * autenticada; sin sesión no abre canal.
 */
export function SincronizadorOrdenesRealtime() {
  const router = useRouter();
  const canalRef = useRef<RealtimeChannel | null>(null);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCanalRef = useRef(
    `${NOMBRE_CANAL}-${crypto.randomUUID()}`,
  );

  useEffect(() => {
    const supabase = obtenerClienteSupabaseNavegador();
    let desmontado = false;

    function programarRefresco(): void {
      if (temporizadorRef.current !== null) {
        clearTimeout(temporizadorRef.current);
      }
      temporizadorRef.current = setTimeout(() => {
        temporizadorRef.current = null;
        if (!desmontado) {
          router.refresh();
        }
      }, MS_AGRUPACION_RAFAGA);
    }

    function conectar(): void {
      if (desmontado || canalRef.current !== null) {
        return;
      }

      const canal = supabase.channel(idCanalRef.current);
      for (const tabla of TABLAS_ORDENES) {
        canal.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: tabla },
          () => programarRefresco(),
        );
      }

      canalRef.current = canal;
      canal.subscribe();
    }

    function desconectar(): void {
      if (temporizadorRef.current !== null) {
        clearTimeout(temporizadorRef.current);
        temporizadorRef.current = null;
      }
      const canal = canalRef.current;
      if (canal !== null) {
        canalRef.current = null;
        void supabase.removeChannel(canal);
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session !== null) {
        conectar();
      }
    });

    // Cubre login/logout y refresco de token sin pedir interacción del usuario.
    const { data: suscripcionAuth } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      if (sesion === null) {
        desconectar();
        return;
      }
      conectar();
    });

    return () => {
      desmontado = true;
      suscripcionAuth.subscription.unsubscribe();
      desconectar();
    };
  }, [router]);

  return null;
}
