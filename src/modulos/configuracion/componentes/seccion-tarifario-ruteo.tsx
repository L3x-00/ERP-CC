'use client';

import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { PanelDesplegable } from '@/compartido/componentes/diseno/panel-desplegable';
import { Button } from '@/compartido/componentes/ui/button';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';

import { CLAVE_CATALOGOS_BASE, consultarCatalogosBase } from './consulta-catalogos-base';
import { SeccionTarifasGrupos, resumenTarifaGrupo } from './seccion-tarifas-grupos';
import { SeccionTarifasRecursos } from './seccion-tarifas-recursos';

/**
 * Parte de «Tarifas / TC» que relaciona el tarifario con el ruteo (obs. cliente
 * 2026-10-13): cada Grupo de Equipo toma su tarifa por hora de una estación de
 * arriba y las máquinas pueden tener una propia. Es la única pantalla donde se
 * configuran; antes vivían en «Catálogos base», separadas de las tarifas que sí
 * se conocían.
 *
 * Va plegada por defecto para que la pestaña no obligue a recorrer todo el
 * tarifario; el encabezado avisa cuántos grupos siguen sin tarifa. Un grupo o
 * una máquina NUEVOS se dan de alta en «Catálogos base» (`onIrACatalogosBase`).
 */
export function SeccionTarifarioRuteo({
  onIrACatalogosBase,
}: {
  onIrACatalogosBase?: () => void;
}) {
  const clienteQuery = useQueryClient();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const consulta = useQuery({
    queryKey: CLAVE_CATALOGOS_BASE,
    queryFn: consultarCatalogosBase,
    staleTime: 0,
  });

  const datos = consulta.data;
  const refrescar = async (texto: string): Promise<void> => {
    await clienteQuery.invalidateQueries({ queryKey: CLAVE_CATALOGOS_BASE });
    setMensaje(texto);
    setError(null);
  };

  let resumen: ReactNode;
  if (datos) {
    const activos = datos.gruposEquipo.filter((grupo) => grupo.activo);
    const sinTarifa = activos.filter(
      (grupo) => resumenTarifaGrupo(grupo, datos.tarifasEstacion) === null,
    ).length;
    resumen = (
      <>
        {activos.length === 1 ? '1 grupo de equipo' : `${activos.length} grupos de equipo`}
        {sinTarifa > 0 ? (
          <span className="font-medium text-advertencia-texto" data-testid="tarifario-resumen-sin-tarifa">
            {' · '}
            {sinTarifa === 1 ? '1 sin tarifa' : `${sinTarifa} sin tarifa`}
          </span>
        ) : null}
      </>
    );
  }

  return (
    <PanelDesplegable
      titulo="Tarifario del ruteo"
      descripcion="Las propuestas costean su ruteo con estas tarifas, que salen de la tabla de estaciones de arriba."
      resumen={resumen}
      nivelTitulo="h2"
      data-testid="tarifario-ruteo"
    >
      {consulta.isPending ? (
        <SkeletonTabla filas={5} columnas={3} />
      ) : consulta.isError || !datos ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-advertencia-texto">
          No se pudo cargar el tarifario por grupo de equipo (requiere permiso de catálogos).
          <Button variante="contorno" tamano="sm" onClick={() => void consulta.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : (
        <div className="grid min-w-0 gap-5">
          {!datos.puedeEditar ? (
            <p className="text-sm text-advertencia-texto" data-testid="tarifario-solo-lectura">
              Tienes permiso de lectura; solicita <span className="font-mono">catalogo_editar</span> para modificar.
            </p>
          ) : null}
          {onIrACatalogosBase ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-superficie-2 px-3 py-2 text-sm text-texto-secundario">
              <span>
                ¿Falta un grupo de equipo o una máquina? Se crean en «Catálogos base»; después le asignas aquí su tarifa.
              </span>
              <Button type="button" variante="contorno" tamano="sm" onClick={onIrACatalogosBase}>
                Ir a Catálogos base
              </Button>
            </div>
          ) : null}
          <SeccionTarifasGrupos
            grupos={datos.gruposEquipo}
            tarifasEstacion={datos.tarifasEstacion}
            puedeEditar={datos.puedeEditar}
            onGuardado={refrescar}
            onError={(texto) => {
              setError(texto);
              setMensaje(null);
            }}
          />
          <SeccionTarifasRecursos
            grupos={datos.gruposEquipo}
            tarifasEstacion={datos.tarifasEstacion}
            puedeEditar={datos.puedeEditar}
            onMensaje={(texto) => {
              setMensaje(texto);
              setError(null);
            }}
            onError={(texto) => {
              setError(texto);
              setMensaje(null);
            }}
          />
          {mensaje ? (
            <p role="status" className="text-sm text-exito-texto" data-testid="tarifario-confirmacion">
              {mensaje}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-peligro-texto" data-testid="tarifario-error">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </PanelDesplegable>
  );
}
