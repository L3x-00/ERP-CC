'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { obtenerClienteSupabaseNavegador } from '@/nucleo/supabase/cliente-navegador';
import { CLAVE_CALENDARIO_PLANEACION } from '@/modulos/planeacion/componentes/claves-consulta';

/** Tablas de Planeación que actualizan la proyección cacheada de calendario. */
const TABLAS_CALENDARIO = [
  'recursos_planeacion',
  'capacidades_recurso_turno',
  'excepciones_capacidad_recurso',
  'programacion_areas',
] as const;

/** OP y partidas actualizan las opciones RSC del formulario de asignación. */
const TABLAS_ESTRUCTURA_OPERACION = [
  'ordenes_produccion',
  'partidas_orden_produccion',
] as const;

const NOMBRE_CANAL = 'sincronizacion-planeacion';

/**
 * Programar una partida toca varias tablas casi a la vez (programación + capacidad
 * derivada). Se agrupan en una ventana para no invalidar la consulta por evento.
 */
const MS_AGRUPACION_RAFAGA = 350;

/**
 * Mantiene el calendario de Planeación sincronizado con la base de datos.
 *
 * Escucha `postgres_changes` e invalida `['planeacion', 'calendario']`; los
 * payloads no se leen, no se pintan y no alimentan ninguna caché: el dato vuelve
 * a buscarse en el servidor, ya filtrado por RLS (un payload de Realtime no pasa
 * por los mappers y podría exponer filas fuera del alcance del usuario). Sin
 * sesión no abre canal.
 */
export interface PropsSincronizadorPlaneacionRealtime {
  /** Refresca el árbol RSC de opciones sin hacer navegación ni recarga del navegador. */
  alCambiarEstructuraOperacion?: () => void;
}

export function SincronizadorPlaneacionRealtime({
  alCambiarEstructuraOperacion,
}: PropsSincronizadorPlaneacionRealtime) {
  const clienteConsultas = useQueryClient();
  const canalRef = useRef<RealtimeChannel | null>(null);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCanalRef = useRef(`${NOMBRE_CANAL}-${crypto.randomUUID()}`);

  useEffect(() => {
    const supabase = obtenerClienteSupabaseNavegador();
    let desmontado = false;

    let requiereRefrescoRsc = false;

    function programarSincronizacion(refrescarEstructura = false): void {
      requiereRefrescoRsc = requiereRefrescoRsc || refrescarEstructura;
      if (temporizadorRef.current !== null) {
        clearTimeout(temporizadorRef.current);
      }
      temporizadorRef.current = setTimeout(() => {
        temporizadorRef.current = null;
        if (!desmontado) {
          void clienteConsultas.invalidateQueries({
            queryKey: CLAVE_CALENDARIO_PLANEACION,
          });
          if (requiereRefrescoRsc) alCambiarEstructuraOperacion?.();
          requiereRefrescoRsc = false;
        }
      }, MS_AGRUPACION_RAFAGA);
    }

    function conectar(): void {
      if (desmontado || canalRef.current !== null) {
        return;
      }

      const canal = supabase.channel(idCanalRef.current);
      for (const tabla of TABLAS_CALENDARIO) {
        canal.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: tabla },
          () => programarSincronizacion(),
        );
      }
      for (const tabla of TABLAS_ESTRUCTURA_OPERACION) {
        canal.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: tabla },
          () => programarSincronizacion(true),
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
  }, [alCambiarEstructuraOperacion, clienteConsultas]);

  return null;
}
