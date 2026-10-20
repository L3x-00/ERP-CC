'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { obtenerClienteSupabaseNavegador } from '@/nucleo/supabase/cliente-navegador';
import { obtenerNotasOperativasClienteAccion } from '@/modulos/clientes/acciones/obtener-notas-operativas-cliente';
import {
  obtenerCotizacionesCliente,
  obtenerOrdenesCliente,
  obtenerPropuestasCliente,
} from '@/modulos/clientes/servicios/obtener-historial-cliente';

/** Raíz de las claves de consulta del historial (permite invalidar el bloque). */
export const CLAVE_HISTORIAL_CLIENTE = ['clientes', 'historial'] as const;

/**
 * Clave de la página de cotizaciones de un cliente. Incluye si se consultan
 * Propuestas: el importe mostrado depende de ello.
 */
export function claveCotizacionesCliente(clienteId: string, pagina: number, conPropuestas: boolean) {
  return [...CLAVE_HISTORIAL_CLIENTE, 'cotizaciones', clienteId, pagina, conPropuestas] as const;
}

/** Clave de la página de propuestas de un cliente. */
export function clavePropuestasCliente(clienteId: string, pagina: number) {
  return [...CLAVE_HISTORIAL_CLIENTE, 'propuestas', clienteId, pagina] as const;
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

function useCotizacionesCliente(clienteId: string, pagina: number, conPropuestas: boolean) {
  return useQuery({
    queryKey: claveCotizacionesCliente(clienteId, pagina, conPropuestas),
    queryFn: () =>
      obtenerCotizacionesCliente(obtenerClienteSupabaseNavegador(), clienteId, pagina, {
        incluirPropuestas: conPropuestas,
      }),
    enabled: clienteId.length > 0,
  });
}

function usePropuestasCliente(clienteId: string, pagina: number) {
  return useQuery({
    queryKey: clavePropuestasCliente(clienteId, pagina),
    queryFn: () => obtenerPropuestasCliente(obtenerClienteSupabaseNavegador(), clienteId, pagina),
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

type BloqueHistorial = 'ordenes' | 'cotizaciones' | 'propuestas';

/**
 * Tablas del historial publicadas en Realtime (A08 y SII-B4.1) y los bloques
 * que se relee al cambiar cada una. Una Propuesta o su revisión también mueve
 * el importe de la cotización de origen.
 */
const TABLAS_HISTORIAL_REALTIME: readonly (readonly [string, readonly BloqueHistorial[]])[] = [
  ['ordenes_produccion', ['ordenes']],
  ['partidas_orden_produccion', ['ordenes']],
  ['pipeline', ['cotizaciones']],
  ['cotizacion_lineas', ['cotizaciones']],
  ['propuestas', ['propuestas', 'cotizaciones']],
  ['propuesta_revisiones', ['propuestas', 'cotizaciones']],
];

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
    const pendientes = new Set<BloqueHistorial>();

    const invalidar = (bloques: readonly BloqueHistorial[]): void => {
      for (const bloque of bloques) pendientes.add(bloque);
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(() => {
        temporizador = null;
        if (desmontado) return;
        for (const bloque of pendientes) {
          void clienteConsultas.invalidateQueries({ queryKey: [...CLAVE_HISTORIAL_CLIENTE, bloque] });
        }
        pendientes.clear();
      }, ESPERA_AGRUPACION_MS);
    };
    const todos: readonly BloqueHistorial[] = ['ordenes', 'cotizaciones', 'propuestas'];

    const canal: RealtimeChannel = supabase.channel(`historial-cliente-${clienteId}`);
    for (const [tabla, bloques] of TABLAS_HISTORIAL_REALTIME) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, () => invalidar(bloques));
    }
    canal.subscribe((estado) => { if (estado === 'SUBSCRIBED') invalidar(todos); });
    const alVolver = (): void => { if (navigator.onLine && document.visibilityState === 'visible') invalidar(todos); };
    window.addEventListener('online', alVolver);
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      desmontado = true;
      if (temporizador) clearTimeout(temporizador);
      window.removeEventListener('online', alVolver);
      document.removeEventListener('visibilitychange', alVolver);
      void supabase.removeChannel(canal);
    };
  }, [clienteId, clienteConsultas]);
}

export {
  useCotizacionesCliente as usarCotizacionesCliente,
  useNotasOperativasCliente as usarNotasOperativasCliente,
  useOrdenesCliente as usarOrdenesCliente,
  usePropuestasCliente as usarPropuestasCliente,
  useSincronizacionHistorialCliente as usarSincronizacionHistorialCliente,
};
