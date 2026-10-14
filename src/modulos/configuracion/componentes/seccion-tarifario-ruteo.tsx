'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';

import { CLAVE_CATALOGOS_BASE, consultarCatalogosBase } from './consulta-catalogos-base';
import { SeccionTarifasGrupos } from './seccion-tarifas-grupos';
import { SeccionTarifasRecursos } from './seccion-tarifas-recursos';

/**
 * Parte de «Tarifas / TC» que relaciona el tarifario con el ruteo (obs. cliente
 * 2026-10-13): cada Grupo de Equipo toma su tarifa por hora de una estación de
 * arriba y las máquinas pueden tener una propia. Es la única pantalla donde se
 * configuran; antes vivían en «Catálogos base», separadas de las tarifas que sí
 * se conocían.
 */
export function SeccionTarifarioRuteo() {
  const clienteQuery = useQueryClient();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const consulta = useQuery({
    queryKey: CLAVE_CATALOGOS_BASE,
    queryFn: consultarCatalogosBase,
    staleTime: 0,
  });

  const titulo = (
    <div>
      <h2 className="text-lg font-semibold text-texto-primario">Tarifario del ruteo</h2>
      <p className="text-sm text-texto-secundario">
        Las propuestas costean su ruteo con estas tarifas, que salen de la tabla de estaciones de arriba.
      </p>
    </div>
  );

  if (consulta.isPending) {
    return (
      <section className="grid gap-3" data-testid="tarifario-ruteo">
        {titulo}
        <SkeletonTabla filas={5} columnas={3} />
      </section>
    );
  }

  if (consulta.isError || !consulta.data) {
    return (
      <section className="grid gap-3" data-testid="tarifario-ruteo">
        {titulo}
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-advertencia-texto">
          No se pudo cargar el tarifario por grupo de equipo (requiere permiso de catálogos).
          <Button variante="contorno" tamano="sm" onClick={() => void consulta.refetch()}>
            Reintentar
          </Button>
        </div>
      </section>
    );
  }

  const datos = consulta.data;
  const refrescar = async (texto: string): Promise<void> => {
    await clienteQuery.invalidateQueries({ queryKey: CLAVE_CATALOGOS_BASE });
    setMensaje(texto);
    setError(null);
  };

  return (
    <section className="grid min-w-0 gap-5" data-testid="tarifario-ruteo">
      {titulo}
      {!datos.puedeEditar ? (
        <p className="text-sm text-advertencia-texto" data-testid="tarifario-solo-lectura">
          Tienes permiso de lectura; solicita <span className="font-mono">catalogo_editar</span> para modificar.
        </p>
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
    </section>
  );
}
