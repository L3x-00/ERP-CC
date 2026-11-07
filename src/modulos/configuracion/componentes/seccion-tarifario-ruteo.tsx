'use client';

import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { PanelDesplegable } from '@/compartido/componentes/diseno/panel-desplegable';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';
import { parsearMonto } from '@/compartido/utilidades/monto';
import { guardarGrupoEquipoAccion } from '@/modulos/catalogos/acciones/indice';
import type { MonedaTarifa } from '@/modulos/catalogos/tipos/indice';
import {
  ESTACIONES_TARIFA,
  ETIQUETA_ESTACION_TARIFA,
  esEstacionTarifa,
} from '@/modulos/catalogos/utilidades/tarifa-estacion';

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
  const [nuevo, setNuevo] = useState<{
    codigo: string;
    nombre: string;
    estacion: string;
    tarifa: string;
    moneda: MonedaTarifa;
  } | null>(null);
  const [guardando, setGuardando] = useState(false);
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

  /**
   * Aclaración cliente 2026-11-06: alta guiada. Crear el grupo y su tarifa
   * estándar en un solo formulario evita saltar entre Catálogos base y esta
   * pestaña. La tarifa propia es opcional; si se omite, se usa la estación.
   */
  async function crearGrupo(): Promise<void> {
    if (!nuevo) return;
    const texto = nuevo.tarifa.trim();
    const tarifa = texto === '' ? null : parsearMonto(texto);
    if (texto !== '' && tarifa === null) {
      setError('La tarifa propia debe ser un monto válido (por ejemplo 850.50) o quedar vacía.');
      return;
    }
    if (tarifa === null && !esEstacionTarifa(nuevo.estacion)) {
      setError('Elige la estación de Tarifas / TC que define la tarifa estándar del grupo o escribe una tarifa propia.');
      return;
    }
    setGuardando(true);
    setError(null);
    const respuesta = await guardarGrupoEquipoAccion({
      codigo: nuevo.codigo,
      nombre: nuevo.nombre,
      activo: true,
      orden: 0,
      ...(tarifa !== null ? { tarifaHora: tarifa, tarifaMoneda: nuevo.moneda } : {}),
      estacionTarifa: esEstacionTarifa(nuevo.estacion) ? nuevo.estacion : null,
    });
    setGuardando(false);
    if (!respuesta.exito) {
      setError(respuesta.error ?? 'No se pudo crear el grupo de equipo');
      return;
    }
    setNuevo(null);
    await refrescar(`Grupo ${respuesta.datos?.nombre ?? nuevo.nombre} creado con su tarifa estándar.`);
  }

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
            {sinTarifa === 1 ? '1 sin tarifa estándar' : `${sinTarifa} sin tarifa estándar`}
            {datos.tarifaRespaldo !== null ? ' (usará respaldo)' : ''}
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
                ¿Falta una máquina? Se crea en «Catálogos base»; su tarifa propia se asigna aquí.
              </span>
              <Button type="button" variante="contorno" tamano="sm" onClick={onIrACatalogosBase}>
                Ir a Catálogos base
              </Button>
            </div>
          ) : null}
          {datos.puedeEditar ? (
            <div
              className="rounded-md border border-borde bg-superficie-2/60 p-3"
              data-testid="alta-guiada-grupo"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-texto-primario">Alta guiada de un grupo de equipo</p>
                  <p className="text-xs text-texto-secundario">
                    Crea el grupo y su tarifa estándar en un solo paso; ya no hace falta saltar entre catálogos.
                  </p>
                </div>
                <Button
                  type="button"
                  variante="contorno"
                  tamano="sm"
                  onClick={() =>
                    setNuevo(
                      nuevo
                        ? null
                        : { codigo: '', nombre: '', estacion: '', tarifa: '', moneda: 'MXN' },
                    )
                  }
                  data-testid="alta-guiada-grupo-nuevo"
                >
                  {nuevo ? 'Cancelar' : 'Nuevo grupo de equipo'}
                </Button>
              </div>
              {nuevo ? (
                <form
                  className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
                  onSubmit={(evento) => {
                    evento.preventDefault();
                    void crearGrupo();
                  }}
                  aria-label="Nuevo grupo de equipo con tarifa"
                >
                  <label className="grid gap-1 text-xs font-medium text-texto-secundario">
                    Código
                    <Input
                      value={nuevo.codigo}
                      onChange={(evento) =>
                        setNuevo({ ...nuevo, codigo: evento.target.value.toUpperCase() })
                      }
                      maxLength={49}
                      required
                      data-testid="alta-guiada-grupo-codigo"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-texto-secundario">
                    Nombre
                    <Input
                      value={nuevo.nombre}
                      onChange={(evento) => setNuevo({ ...nuevo, nombre: evento.target.value })}
                      maxLength={120}
                      required
                      data-testid="alta-guiada-grupo-nombre"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-texto-secundario">
                    Estación de Tarifas / TC
                    <Select
                      value={nuevo.estacion}
                      onChange={(evento) => setNuevo({ ...nuevo, estacion: evento.target.value })}
                      data-testid="alta-guiada-grupo-estacion"
                    >
                      <option value="">Tarifa propia</option>
                      {ESTACIONES_TARIFA.map((estacion) => (
                        <option key={estacion} value={estacion}>
                          {ETIQUETA_ESTACION_TARIFA[estacion]} ·{' '}
                          {datos.tarifasEstacion[estacion].toFixed(2)} MXN/h
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-texto-secundario">
                    Tarifa propia (opcional)
                    <Input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="Vacía = usa la estación"
                      value={nuevo.tarifa}
                      onChange={(evento) => setNuevo({ ...nuevo, tarifa: evento.target.value })}
                      data-testid="alta-guiada-grupo-tarifa"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-texto-secundario">
                    Moneda
                    <Select
                      value={nuevo.moneda}
                      onChange={(evento) =>
                        setNuevo({
                          ...nuevo,
                          moneda: evento.target.value === 'USD' ? 'USD' : 'MXN',
                        })
                      }
                    >
                      <option value="MXN">MXN</option>
                      <option value="USD">USD</option>
                    </Select>
                  </label>
                  <div className="sm:col-span-2 lg:col-span-5">
                    <Button type="submit" tamano="sm" disabled={guardando}>
                      {guardando ? 'Creando…' : 'Crear grupo con tarifa'}
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}
          <SeccionTarifasGrupos
            grupos={datos.gruposEquipo}
            tarifasEstacion={datos.tarifasEstacion}
            tarifaRespaldo={datos.tarifaRespaldo}
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
