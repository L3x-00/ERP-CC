'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { obtenerClienteSupabaseNavegador } from '@/nucleo/supabase/cliente-navegador';
import { obtenerNotasOperativasClienteAccion } from '@/modulos/clientes/acciones/obtener-notas-operativas-cliente';
import {
  obtenerCotizacionesCliente,
  obtenerOrdenesCliente,
} from '@/modulos/clientes/servicios/obtener-historial-cliente';

/** Raíz de las claves de consulta del historial (permite invalidar el bloque). */
export const CLAVE_HISTORIAL_CLIENTE = ['clientes', 'historial'] as const;

/** Clave de la página de cotizaciones de un cliente. */
export function claveCotizacionesCliente(clienteId: string, pagina: number) {
  return [...CLAVE_HISTORIAL_CLIENTE, 'cotizaciones', clienteId, pagina] as const;
}

/** Clave de la página de órdenes de un cliente. */
export function claveOrdenesCliente(clienteId: string, pagina: number) {
  return [...CLAVE_HISTORIAL_CLIENTE, 'ordenes', clienteId, pagina] as const;
}

/** Clave de las notas operativas (OBS-11) del cliente. */
export function claveNotasOperativasCliente(clienteId: string) {
  return [...CLAVE_HISTORIAL_CLIENTE, 'notas', clienteId] as const;
}

// Nombres internos con prefijo `use` para `react-hooks/rules-of-hooks` (detecta
// hooks por `/^use[A-Z0-9]/`). Se exportan con el nombre en español vía alias.

function useCotizacionesCliente(clienteId: string, pagina: number) {
  return useQuery({
    queryKey: claveCotizacionesCliente(clienteId, pagina),
    queryFn: () => obtenerCotizacionesCliente(obtenerClienteSupabaseNavegador(), clienteId, pagina),
    enabled: clienteId.length > 0,
  });
}

function useOrdenesCliente(clienteId: string, pagina: number) {
  return useQuery({
    queryKey: claveOrdenesCliente(clienteId, pagina),
    queryFn: () => obtenerOrdenesCliente(obtenerClienteSupabaseNavegador(), clienteId, pagina),
    enabled: clienteId.length > 0,
  });
}

/**
 * OBS-11: notas de taller de las órdenes del cliente. Se leen por Server Action
 * (la RLS de producción no autoriza a `ver_clientes`); la acción valida el
 * permiso y devuelve solo las notas del cliente solicitado.
 */
function useNotasOperativasCliente(clienteId: string) {
  return useQuery({
    queryKey: claveNotasOperativasCliente(clienteId),
    queryFn: async () => {
      const respuesta = await obtenerNotasOperativasClienteAccion({ clienteId });
      if (!respuesta.exito) throw new Error(respuesta.error);
      return respuesta.datos ?? [];
    },
    enabled: clienteId.length > 0,
  });
}

/**
 * Tablas del historial que están publicadas en Realtime. `pipeline` y
 * `cotizacion_lineas` no lo están, así que las cotizaciones se refrescan al
 * reabrir la ficha o al reintentar; suscribirse a algo no publicado solo
 * abriría un canal que nunca emite.
 */
const TABLAS_HISTORIAL_REALTIME = ['ordenes_produccion', 'partidas_orden_produccion'] as const;

/** Espera para agrupar ráfagas de eventos antes de invalidar (ms). */
const ESPERA_AGRUPACION_MS = 350;

/**
 * Suscribe un único canal por ficha abierta y solo invalida las consultas del
 * historial de órdenes. Los payloads no se leen ni se guardan: la relectura
 * vuelve a pasar por RLS. El canal se cierra al desmontar o al cambiar de
 * cliente, de modo que no se acumulan suscripciones.
 */
function useSincronizacionHistorialCliente(clienteId: string): void {
  const clienteConsultas = useQueryClient();

  useEffect(() => {
    if (clienteId.length === 0) {
      return;
    }

    const supabase = obtenerClienteSupabaseNavegador();
    let desmontado = false;
    let temporizador: ReturnType<typeof setTimeout> | null = null;

    const invalidar = (): void => {
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(() => {
        temporizador = null;
        if (desmontado) return;
        void clienteConsultas.invalidateQueries({
          queryKey: [...CLAVE_HISTORIAL_CLIENTE, 'ordenes'],
        });
      }, ESPERA_AGRUPACION_MS);
    };

    const canal: RealtimeChannel = supabase.channel(`historial-cliente-${clienteId}`);
    for (const tabla of TABLAS_HISTORIAL_REALTIME) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, invalidar);
    }
    canal.subscribe();

    return () => {
      desmontado = true;
      if (temporizador) clearTimeout(temporizador);
      void supabase.removeChannel(canal);
    };
  }, [clienteId, clienteConsultas]);
}

export {
  useCotizacionesCliente as usarCotizacionesCliente,
  useNotasOperativasCliente as usarNotasOperativasCliente,
  useOrdenesCliente as usarOrdenesCliente,
  useSincronizacionHistorialCliente as usarSincronizacionHistorialCliente,
};
