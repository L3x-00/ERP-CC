'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/compartido/componentes/ui/button';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { Skeleton, SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';
import { ControlesPipeline } from '@/modulos/pipeline/componentes/controles-pipeline';
import { FormularioProspecto } from '@/modulos/pipeline/componentes/formulario-prospecto';
import { TablaOportunidades } from '@/modulos/pipeline/componentes/tabla-oportunidades';
import { TarjetaOportunidad } from '@/modulos/pipeline/componentes/tarjeta-oportunidad';
import { usarAlertasPipeline } from '@/modulos/pipeline/hooks/usar-alertas-pipeline';
import { usarPipeline } from '@/modulos/pipeline/hooks/usar-pipeline';
import {
  FILTROS_TABLERO_INICIAL,
  areasDistintas,
  clientesDistintos,
  etiquetasDistintas,
  filtrarOportunidades,
  type FiltrosTablero,
} from '@/modulos/pipeline/servicios/filtrar-oportunidades';
import { resumirPipeline } from '@/modulos/pipeline/servicios/resumen-pipeline';
import { ESTADOS_PIPELINE, type EstadoRfq, type Oportunidad } from '@/modulos/pipeline/tipos/indice';
import { ETIQUETA_ESTADO_RFQ } from '@/modulos/pipeline/utilidades/indice';

type VistaPipeline = 'tablero' | 'lista';

function responsablesDistintos(
  oportunidades: readonly Oportunidad[],
): { id: string; nombre: string }[] {
  const porId = new Map<string, string>();
  for (const oportunidad of oportunidades) {
    const id = oportunidad.responsableId ?? oportunidad.vendedorId;
    if (!porId.has(id)) {
      porId.set(id, oportunidad.responsableNombre?.trim() || 'Responsable sin nombre');
    }
  }
  return [...porId.entries()]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Cola de trabajo RFQ (plan §3.8): vistas Tablero por estado y Lista, filtros
 * por estado/cliente/responsable/próxima acción vencida, y alta de RFQ. Las
 * acciones de negocio viven en la ficha (`/rfq?rfq=<id>`), no en la cola.
 */
export function ColaRfq() {
  const { data, isLoading, isError } = usarPipeline();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [vista, setVista] = useState<VistaPipeline>('tablero');
  const [filtros, setFiltros] = useState<FiltrosTablero>(FILTROS_TABLERO_INICIAL);

  const oportunidades = useMemo(() => data ?? [], [data]);
  const filtradas = useMemo(
    () => filtrarOportunidades(oportunidades, filtros),
    [oportunidades, filtros],
  );
  const resumen = useMemo(() => resumirPipeline(filtradas), [filtradas]);
  const etiquetas = useMemo(() => etiquetasDistintas(oportunidades), [oportunidades]);
  const areas = useMemo(() => areasDistintas(oportunidades), [oportunidades]);
  const clientes = useMemo(() => clientesDistintos(oportunidades), [oportunidades]);
  const responsables = useMemo(() => responsablesDistintos(oportunidades), [oportunidades]);
  const alertasPorId = usarAlertasPipeline(filtradas);

  const cambiarFiltros = (parcial: Partial<FiltrosTablero>): void =>
    setFiltros((previo) => ({ ...previo, ...parcial }));
  const limpiarFiltros = (): void => setFiltros(FILTROS_TABLERO_INICIAL);

  const hayDatos = !isLoading && !isError && oportunidades.length > 0;
  const vacio = !isLoading && !isError && oportunidades.length === 0;
  const sinCoincidencias = hayDatos && filtradas.length === 0;

  return (
    <div className="flex flex-col gap-4" data-testid="cola-rfq">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          role="group"
          aria-label="Vista de la cola RFQ"
          className="flex gap-1 rounded-lg border border-borde bg-superficie p-1"
        >
          <Button
            variante={vista === 'tablero' ? 'primario' : 'fantasma'}
            tamano="sm"
            aria-pressed={vista === 'tablero'}
            onClick={() => setVista('tablero')}
          >
            Tablero
          </Button>
          <Button
            variante={vista === 'lista' ? 'primario' : 'fantasma'}
            tamano="sm"
            aria-pressed={vista === 'lista'}
            onClick={() => setVista('lista')}
          >
            Lista
          </Button>
        </div>
        <Button type="button" onClick={() => setMostrarFormulario((previo) => !previo)}>
          {mostrarFormulario ? 'Cerrar formulario' : 'Nuevo RFQ'}
        </Button>
      </div>

      {mostrarFormulario && (
        <div className="rounded-lg border border-borde bg-superficie p-4 shadow-sm">
          <FormularioProspecto />
        </div>
      )}

      {hayDatos && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro por estado">
            {ESTADOS_PIPELINE.map((estado) => {
              const activo = filtros.estadoRfq === estado;
              return (
                <button
                  key={estado}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => cambiarFiltros({ estadoRfq: activo ? '' : estado })}
                  className={
                    activo
                      ? 'rounded-full border border-acento bg-acento-suave px-3 py-1 text-xs font-semibold text-acento'
                      : 'rounded-full border border-borde bg-superficie px-3 py-1 text-xs font-medium text-texto-secundario hover:bg-superficie-2'
                  }
                >
                  {ETIQUETA_ESTADO_RFQ[estado as EstadoRfq]} ({resumen.porEstado[estado]})
                </button>
              );
            })}
          </div>

          <ControlesPipeline
            filtros={filtros}
            onCambio={cambiarFiltros}
            onLimpiar={limpiarFiltros}
            resumen={resumen}
            etiquetas={etiquetas}
            areas={areas}
            clientes={clientes}
            responsables={responsables}
            totalFiltrado={filtradas.length}
            totalTotal={oportunidades.length}
          />
        </>
      )}

      {isLoading && vista === 'tablero' && (
        <div className="flex gap-4 overflow-hidden pb-2" role="status" aria-label="Cargando RFQ">
          {ESTADOS_PIPELINE.slice(0, 4).map((estado) => (
            <div key={estado} className="flex w-72 shrink-0 flex-col gap-3 rounded-lg bg-superficie-2 p-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-28 rounded-lg" />
              <Skeleton className="h-28 rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {isLoading && vista === 'lista' && <SkeletonTabla filas={5} columnas={8} />}

      {!isLoading && isError && (
        <p role="alert" className="text-sm text-peligro-texto">
          No se pudieron cargar los RFQ.
        </p>
      )}

      {vacio && (
        <EstadoVacio
          titulo="Sin RFQ"
          descripcion="Aún no hay solicitudes. Crea la primera con “Nuevo RFQ”."
        />
      )}

      {sinCoincidencias && (
        <EstadoVacio
          titulo="Sin coincidencias"
          descripcion="Ningún RFQ coincide con la búsqueda o los filtros aplicados."
          accion={
            <Button variante="contorno" tamano="lg" onClick={limpiarFiltros}>
              Limpiar filtros
            </Button>
          }
        />
      )}

      {hayDatos && !sinCoincidencias && vista === 'lista' && (
        <TablaOportunidades oportunidades={filtradas} />
      )}

      {hayDatos && !sinCoincidencias && vista === 'tablero' && (
        <div className="flex max-h-[calc(100vh-14rem)] gap-4 overflow-x-auto pb-2">
          {ESTADOS_PIPELINE.map((estado) => {
            const items = filtradas.filter((oportunidad) => oportunidad.estadoRfq === estado);
            return (
              <section
                key={estado}
                data-testid={`columna-${estado}`}
                className="flex w-72 shrink-0 flex-col gap-3 rounded-lg bg-superficie-2 p-3"
              >
                <header className="sticky top-0 z-10 -mx-3 flex items-center justify-between rounded-t-lg bg-superficie-2 px-3 py-2">
                  <h2 className="text-sm font-semibold">{ETIQUETA_ESTADO_RFQ[estado]}</h2>
                  <span className="text-xs tabular-nums text-texto-secundario">{items.length}</span>
                </header>

                <div className="flex flex-col gap-3">
                  {items.length === 0 ? (
                    <p className="text-xs text-texto-tenue">Sin RFQ</p>
                  ) : (
                    items.map((oportunidad) => (
                      <TarjetaOportunidad
                        key={oportunidad.id}
                        oportunidad={oportunidad}
                        alertas={alertasPorId[oportunidad.id] ?? []}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
