'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { REGISTROS_POR_PAGINA } from '@/compartido/constantes/indice';
import { formatearFecha, formatearHora } from '@/compartido/utilidades/indice';

import { obtenerLogsAccion } from '../acciones/obtener-logs';
import type { FiltrosLog } from '../tipos/indice';

/** Clases compartidas de los inputs de filtro. */
const CLASE_INPUT_FILTRO =
  'rounded-base border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primario focus:ring-2 focus:ring-primario/30';

/** Clases compartidas de los botones de paginación. */
const CLASE_BOTON_PAGINACION =
  'rounded-base border border-foreground/20 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40';

/**
 * Tabla de logs de auditoría con filtros por módulo y acción, y paginación
 * anterior/siguiente. Consulta `obtenerLogsAccion` (Server Action) a través
 * de TanStack Query bajo la clave `['logs', filtros]`; conserva los datos de
 * la página anterior mientras carga la siguiente para evitar parpadeos.
 * Muestra estados de carga, error y lista vacía en español.
 */
export function TablaLogs() {
  const [modulo, setModulo] = useState('');
  const [accion, setAccion] = useState('');
  const [pagina, setPagina] = useState(1);

  const filtros: FiltrosLog = {
    pagina,
    porPagina: REGISTROS_POR_PAGINA,
    ...(modulo.trim() !== '' ? { modulo: modulo.trim() } : {}),
    ...(accion.trim() !== '' ? { accion: accion.trim() } : {}),
  };

  const {
    data: respuesta,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['logs', filtros],
    queryFn: () => obtenerLogsAccion(filtros),
    placeholderData: keepPreviousData,
  });

  /**
   * Actualiza el filtro de módulo y regresa a la primera página.
   *
   * @param valor - Texto ingresado en el input de módulo.
   */
  function manejarCambioModulo(valor: string): void {
    setModulo(valor);
    setPagina(1);
  }

  /**
   * Actualiza el filtro de acción y regresa a la primera página.
   *
   * @param valor - Texto ingresado en el input de acción.
   */
  function manejarCambioAccion(valor: string): void {
    setAccion(valor);
    setPagina(1);
  }

  const datos = respuesta !== undefined && respuesta.exito ? respuesta.datos : undefined;
  const errorAccion = respuesta !== undefined && !respuesta.exito ? respuesta.error : null;
  const registros = datos?.registros ?? [];
  const total = datos?.total ?? 0;
  const totalPaginas = total > 0 ? Math.ceil(total / REGISTROS_POR_PAGINA) : 1;
  const hayError = isError || errorAccion !== null;
  const mostrarVacio = !isLoading && !hayError && registros.length === 0;
  const mostrarTabla = !isLoading && !hayError && registros.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-modulo" className="text-sm font-medium">
            Módulo
          </label>
          <input
            id="filtro-modulo"
            type="text"
            value={modulo}
            onChange={(evento) => manejarCambioModulo(evento.target.value)}
            placeholder="ej. clientes"
            className={CLASE_INPUT_FILTRO}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-accion" className="text-sm font-medium">
            Acción
          </label>
          <input
            id="filtro-accion"
            type="text"
            value={accion}
            onChange={(evento) => manejarCambioAccion(evento.target.value)}
            placeholder="ej. crear"
            className={CLASE_INPUT_FILTRO}
          />
        </div>
      </div>

      {isLoading && <p className="text-sm text-foreground/60">Cargando registros…</p>}

      {!isLoading && hayError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errorAccion ?? 'No se pudieron cargar los logs de auditoría.'}
        </p>
      )}

      {mostrarVacio && (
        <p className="text-sm text-foreground/60">No hay registros de auditoría.</p>
      )}

      {mostrarTabla && (
        <div className="overflow-x-auto rounded-base border border-foreground/10">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-foreground/5">
              <tr>
                <th className="px-3 py-2 font-semibold">Fecha</th>
                <th className="px-3 py-2 font-semibold">Usuario</th>
                <th className="px-3 py-2 font-semibold">Rol</th>
                <th className="px-3 py-2 font-semibold">Acción</th>
                <th className="px-3 py-2 font-semibold">Módulo</th>
                <th className="px-3 py-2 font-semibold">Recurso</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((log) => (
                <tr key={log.id} className="border-t border-foreground/10">
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatearFecha(log.creadoEn)} {formatearHora(log.creadoEn)}
                  </td>
                  <td className="px-3 py-2">{log.nombreUsuario}</td>
                  <td className="px-3 py-2">{log.rol}</td>
                  <td className="px-3 py-2">{log.accion}</td>
                  <td className="px-3 py-2">{log.modulo}</td>
                  <td className="px-3 py-2">{log.recursoId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground/60">
          Página {pagina} de {totalPaginas}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pagina <= 1 || isLoading}
            onClick={() => setPagina((previo) => Math.max(1, previo - 1))}
            className={CLASE_BOTON_PAGINACION}
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={pagina >= totalPaginas || isLoading}
            onClick={() => setPagina((previo) => previo + 1)}
            className={CLASE_BOTON_PAGINACION}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
