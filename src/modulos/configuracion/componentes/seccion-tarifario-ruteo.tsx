'use client';

import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { PanelDesplegable } from '@/compartido/componentes/diseno/panel-desplegable';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';
import { parsearMonto } from '@/compartido/utilidades/monto';
import { asignarProcesosAGrupoAccion, guardarGrupoEquipoAccion } from '@/modulos/catalogos/acciones/indice';
import type { MonedaTarifa } from '@/modulos/catalogos/tipos/indice';
import {
  ESTACIONES_TARIFA,
  ETIQUETA_ESTACION_TARIFA,
  esEstacionTarifa,
} from '@/modulos/catalogos/utilidades/tarifa-estacion';

import { CLAVE_CATALOGOS_BASE, consultarCatalogosBase } from './consulta-catalogos-base';
import { SeccionTarifasGrupos, resumenTarifaGrupo } from './seccion-tarifas-grupos';
import { SeccionTarifasRecursos } from './seccion-tarifas-recursos';

const CODIGO_GRUPO = /^[A-Z0-9][A-Z0-9_-]{1,48}$/;

/**
 * Parte de «Tarifas / TC» que relaciona el tarifario con el ruteo (obs. cliente
 * 2026-10-13): cada Grupo de Equipo toma su tarifa por hora de una estación de
 * arriba y las máquinas pueden tener una propia. Es la única pantalla donde se
 * configuran; antes vivían en «Catálogos base», separadas de las tarifas que sí
 * se conocían.
 *
 * Va plegada por defecto para que la pestaña no obligue a recorrer todo el
 * tarifario; el encabezado avisa cuántos grupos siguen sin tarifa. Los grupos y
 * las máquinas se dan de alta en este mismo tarifario (UI-03); los procesos y
 * canales viven en «Catálogos operativos».
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
    procesos: string[];
  } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [erroresGrupo, setErroresGrupo] = useState<
    Partial<Record<'codigo' | 'nombre' | 'tarifa', string>>
  >({});
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
   * Aclaración cliente 2026-11-06: alta guiada. Crear el grupo, su tarifa
   * estándar y sus procesos compatibles en un solo formulario evita saltar
   * entre catálogos. La estación solo copia su valor como referencia.
   */
  async function crearGrupo(): Promise<void> {
    if (!nuevo) return;
    const errores: typeof erroresGrupo = {};
    const codigo = nuevo.codigo.trim().toUpperCase();
    if (!CODIGO_GRUPO.test(codigo)) {
      errores.codigo = 'Usa mayúsculas, números, guion o guion bajo (mínimo 2 caracteres).';
    }
    if (nuevo.nombre.trim().length < 2) {
      errores.nombre = 'Escribe un nombre de al menos 2 caracteres.';
    }
    const texto = nuevo.tarifa.trim();
    let tarifa = texto === '' ? null : parsearMonto(texto);
    if (texto !== '' && tarifa === null) {
      errores.tarifa = 'Escribe un monto válido, por ejemplo 850.50.';
    } else if (tarifa !== null && tarifa < 0) {
      errores.tarifa = 'La tarifa no puede ser negativa.';
    } else if (
      tarifa !== null
      && Math.abs(tarifa * 10_000 - Math.round(tarifa * 10_000)) > 1e-6
    ) {
      errores.tarifa = 'Usa como máximo 4 decimales.';
    }
    if (tarifa === null && esEstacionTarifa(nuevo.estacion)) {
      tarifa = datos?.tarifasEstacion[nuevo.estacion] ?? null;
    }
    if (tarifa === null && !errores.tarifa) {
      errores.tarifa = 'Escribe la tarifa estándar por hora o elige una estación para copiarla.';
    }
    if (Object.keys(errores).length > 0) {
      setErroresGrupo(errores);
      return;
    }
    setErroresGrupo({});
    setGuardando(true);
    setError(null);
    const respuesta = await guardarGrupoEquipoAccion({
      codigo,
      nombre: nuevo.nombre.trim(),
      activo: true,
      orden: 0,
      tarifaHora: tarifa,
      tarifaMoneda: nuevo.moneda,
      estacionTarifa: esEstacionTarifa(nuevo.estacion) ? nuevo.estacion : null,
    });
    setGuardando(false);
    if (!respuesta.exito) {
      setError(respuesta.error ?? 'No se pudo crear el grupo de equipo');
      return;
    }
    let procesosVinculados = 0;
    if (nuevo.procesos.length > 0) {
      const asignacion = await asignarProcesosAGrupoAccion({
        grupoId: respuesta.datos?.id ?? '',
        procesoIds: nuevo.procesos,
      });
      if (!asignacion.exito) {
        setNuevo(null);
        await refrescar(`Grupo ${respuesta.datos?.nombre ?? nuevo.nombre} creado con su tarifa estándar.`);
        setError(`El grupo se creó, pero no se pudieron vincular los procesos: ${asignacion.error}`);
        return;
      }
      procesosVinculados = asignacion.datos?.procesos ?? 0;
    }
    setNuevo(null);
    await refrescar(
      `Grupo ${respuesta.datos?.nombre ?? nuevo.nombre} creado con su tarifa estándar${
        procesosVinculados > 0
          ? ` y ${procesosVinculados} proceso(s) vinculado(s)`
          : ''
      }.`,
    );
  }

  let resumen: ReactNode;
  if (datos) {
    const activos = datos.gruposEquipo.filter((grupo) => grupo.activo);
    const sinTarifa = activos.filter(
      (grupo) => resumenTarifaGrupo(grupo) === null,
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
                ¿Necesitas administrar procesos, grupos planeados o canales? Están en «Catálogos operativos».
              </span>
              <Button type="button" variante="contorno" tamano="sm" onClick={onIrACatalogosBase}>
                Ir a Catálogos operativos
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
                  onClick={() => {
                    setNuevo(
                      nuevo
                        ? null
                        : {
                            codigo: '',
                            nombre: '',
                            estacion: '',
                            tarifa: '',
                            moneda: 'MXN',
                            procesos: [],
                          },
                    );
                    setErroresGrupo({});
                  }}
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
                      onChange={(evento) => {
                        setNuevo({ ...nuevo, codigo: evento.target.value.toUpperCase() });
                        setErroresGrupo((actual) => ({ ...actual, codigo: undefined }));
                      }}
                      maxLength={49}
                      required
                      aria-invalid={Boolean(erroresGrupo.codigo)}
                      aria-describedby={erroresGrupo.codigo ? 'grupo-codigo-error' : undefined}
                      className={erroresGrupo.codigo ? 'border-peligro' : undefined}
                      data-testid="alta-guiada-grupo-codigo"
                    />
                    {erroresGrupo.codigo ? (
                      <span id="grupo-codigo-error" role="alert" className="text-[11px] font-normal text-peligro-texto">
                        {erroresGrupo.codigo}
                      </span>
                    ) : null}
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-texto-secundario">
                    Nombre
                    <Input
                      value={nuevo.nombre}
                      onChange={(evento) => {
                        setNuevo({ ...nuevo, nombre: evento.target.value });
                        setErroresGrupo((actual) => ({ ...actual, nombre: undefined }));
                      }}
                      maxLength={120}
                      required
                      aria-invalid={Boolean(erroresGrupo.nombre)}
                      aria-describedby={erroresGrupo.nombre ? 'grupo-nombre-error' : undefined}
                      className={erroresGrupo.nombre ? 'border-peligro' : undefined}
                      data-testid="alta-guiada-grupo-nombre"
                    />
                    {erroresGrupo.nombre ? (
                      <span id="grupo-nombre-error" role="alert" className="text-[11px] font-normal text-peligro-texto">
                        {erroresGrupo.nombre}
                      </span>
                    ) : null}
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-texto-secundario">
                    Tarifa estándar por hora
                    <Input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="850.50"
                      value={nuevo.tarifa}
                      onChange={(evento) => {
                        setNuevo({ ...nuevo, tarifa: evento.target.value });
                        setErroresGrupo((actual) => ({ ...actual, tarifa: undefined }));
                      }}
                      required
                      aria-invalid={Boolean(erroresGrupo.tarifa)}
                      aria-describedby={erroresGrupo.tarifa ? 'grupo-tarifa-error' : undefined}
                      className={erroresGrupo.tarifa ? 'border-peligro' : undefined}
                      data-testid="alta-guiada-grupo-tarifa"
                    />
                    {erroresGrupo.tarifa ? (
                      <span id="grupo-tarifa-error" role="alert" className="text-[11px] font-normal text-peligro-texto">
                        {erroresGrupo.tarifa}
                      </span>
                    ) : null}
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-texto-secundario">
                    Copiar de una estación (opcional)
                    <Select
                      value={nuevo.estacion}
                      onChange={(evento) => {
                        const estacion = evento.target.value;
                        setNuevo({
                          ...nuevo,
                          estacion,
                          ...(esEstacionTarifa(estacion)
                            ? {
                                tarifa: datos
                                  ? String(datos.tarifasEstacion[estacion])
                                  : nuevo.tarifa,
                                moneda: 'MXN',
                              }
                            : {}),
                        });
                        setErroresGrupo((actual) => ({ ...actual, tarifa: undefined }));
                      }}
                      data-testid="alta-guiada-grupo-estacion"
                    >
                      <option value="">Sin referencia</option>
                      {ESTACIONES_TARIFA.map((estacion) => (
                        <option key={estacion} value={estacion}>
                          {ETIQUETA_ESTACION_TARIFA[estacion]} ·{' '}
                          {datos.tarifasEstacion[estacion].toFixed(2)} MXN/h
                        </option>
                      ))}
                    </Select>
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
                    <p className="text-xs font-medium text-texto-secundario">
                      Procesos que usarán este grupo (opcional)
                    </p>
                    <p className="mb-1 text-[11px] text-texto-terciario">
                      Así el ruteo hereda el grupo sin depender de «Grupo planeado». Es la misma
                      relación que ves en Catálogos operativos → Procesos; no hace falta repetirla.
                    </p>
                    <div className="max-h-36 overflow-y-auto rounded-md border border-borde bg-superficie p-2">
                      {datos.procesos.filter((proceso) => proceso.activo).length === 0 ? (
                        <p className="text-xs text-texto-secundario">No hay procesos activos.</p>
                      ) : (
                        datos.procesos
                          .filter((proceso) => proceso.activo)
                          .map((proceso) => (
                            <label
                              key={proceso.id}
                              className="flex items-center gap-2 py-0.5 text-xs text-texto-primario"
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-acento"
                                checked={nuevo.procesos.includes(proceso.id)}
                                onChange={(evento) =>
                                  setNuevo({
                                    ...nuevo,
                                    procesos: evento.target.checked
                                      ? [...nuevo.procesos, proceso.id]
                                      : nuevo.procesos.filter((id) => id !== proceso.id),
                                  })
                                }
                              />
                              {proceso.nombre}
                            </label>
                          ))
                      )}
                    </div>
                  </div>
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
            tarifaRespaldo={datos.tarifaRespaldo}
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
