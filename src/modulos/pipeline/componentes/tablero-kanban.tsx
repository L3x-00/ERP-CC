'use client';

import { useMemo, useState } from 'react';

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
import type { EtapaPipeline } from '@/modulos/pipeline/tipos/indice';
import { Button } from '@/compartido/componentes/ui/button';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { Skeleton, SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';

const COLUMNAS: { etapa: EtapaPipeline; titulo: string }[] = [
  { etapa: 'prospecto', titulo: 'Prospecto' },
  { etapa: 'contactado', titulo: 'Contactado' },
  { etapa: 'cotizado', titulo: 'Cotizado' },
  { etapa: 'negociacion', titulo: 'Negociación' },
  { etapa: 'ganada', titulo: 'Ganada' },
  { etapa: 'perdida', titulo: 'Perdida' },
];

type VistaPipeline = 'tabla' | 'kanban';

/**
 * Tablero del pipeline: vista Kanban (una columna por etapa, en orden de
 * avance) o vista Tabla, conmutables. Obtiene las oportunidades con
 * `usarPipeline` y calcula sus alertas con `usarAlertasPipeline`,
 * agrupándolas por etapa. El cambio de etapa se hace desde el selector dentro
 * de cada tarjeta. El encabezado alterna el `FormularioProspecto` para crear
 * nuevas oportunidades.
 */
export function TableroKanban() {
  const { data, isLoading, isError } = usarPipeline();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [vista, setVista] = useState<VistaPipeline>('kanban');

  const oportunidades = useMemo(() => data ?? [], [data]);
  const [filtros, setFiltros] = useState<FiltrosTablero>(FILTROS_TABLERO_INICIAL);

  const filtradas = useMemo(
    () => filtrarOportunidades(oportunidades, filtros),
    [oportunidades, filtros],
  );
  const resumen = useMemo(() => resumirPipeline(filtradas), [filtradas]);
  const etiquetas = useMemo(() => etiquetasDistintas(oportunidades), [oportunidades]);
  const areas = useMemo(() => areasDistintas(oportunidades), [oportunidades]);
  const clientes = useMemo(() => clientesDistintos(oportunidades), [oportunidades]);
  const alertasPorId = usarAlertasPipeline(filtradas);

  const cambiarFiltros = (parcial: Partial<FiltrosTablero>): void =>
    setFiltros((previo) => ({ ...previo, ...parcial }));
  const limpiarFiltros = (): void => setFiltros(FILTROS_TABLERO_INICIAL);

  const hayDatos = !isLoading && !isError && oportunidades.length > 0;
  const vacio = !isLoading && !isError && oportunidades.length === 0;
  const sinCoincidencias = hayDatos && filtradas.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          role="group"
          aria-label="Vista del pipeline"
          className="flex gap-1 rounded-lg border border-borde bg-superficie p-1"
        >
          <Button
            variante={vista === 'kanban' ? 'primario' : 'fantasma'}
            tamano="sm"
            aria-pressed={vista === 'kanban'}
            onClick={() => setVista('kanban')}
          >
            Kanban
          </Button>
          <Button
            variante={vista === 'tabla' ? 'primario' : 'fantasma'}
            tamano="sm"
            aria-pressed={vista === 'tabla'}
            onClick={() => setVista('tabla')}
          >
            Tabla
          </Button>
        </div>
        <Button
          type="button"
          onClick={() => setMostrarFormulario((previo) => !previo)}
        >
          {mostrarFormulario ? 'Cerrar formulario' : 'Nueva oportunidad'}
        </Button>
      </div>

      {mostrarFormulario && (
        <div className="rounded-lg border border-borde bg-superficie p-4 shadow-sm">
          <FormularioProspecto />
        </div>
      )}

      {hayDatos && (
        <ControlesPipeline
          filtros={filtros}
          onCambio={cambiarFiltros}
          onLimpiar={limpiarFiltros}
          resumen={resumen}
          etiquetas={etiquetas}
          areas={areas}
          clientes={clientes}
          totalFiltrado={filtradas.length}
          totalTotal={oportunidades.length}
        />
      )}

      {isLoading && vista === 'kanban' && (
        <div className="flex gap-4 overflow-hidden pb-2" role="status" aria-label="Cargando oportunidades">
          {COLUMNAS.slice(0, 4).map((columna) => (
            <div key={columna.etapa} className="flex w-72 shrink-0 flex-col gap-3 rounded-lg bg-superficie-2 p-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-28 rounded-lg" />
              <Skeleton className="h-28 rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {isLoading && vista === 'tabla' && <SkeletonTabla filas={5} columnas={7} />}

      {!isLoading && isError && (
        <p role="alert" className="text-sm text-peligro-texto">
          No se pudieron cargar las oportunidades del pipeline.
        </p>
      )}

      {vacio && (
        <EstadoVacio
          titulo="Sin oportunidades"
          descripcion="Aún no hay oportunidades en el pipeline. Crea la primera con “Nueva oportunidad”."
        />
      )}

      {sinCoincidencias && (
        <EstadoVacio
          titulo="Sin coincidencias"
          descripcion="Ninguna oportunidad coincide con la búsqueda o los filtros aplicados."
          accion={
            <Button variante="contorno" tamano="lg" onClick={limpiarFiltros}>
              Limpiar filtros
            </Button>
          }
        />
      )}

      {hayDatos && !sinCoincidencias && vista === 'tabla' && (
        <TablaOportunidades oportunidades={filtradas} />
      )}

      {hayDatos && !sinCoincidencias && vista === 'kanban' && (
        <div className="flex max-h-[calc(100vh-10rem)] gap-4 overflow-x-auto pb-2">
          {COLUMNAS.map((columna) => {
            const items = filtradas.filter(
              (oportunidad) => oportunidad.etapa === columna.etapa,
            );
            return (
              <section
                key={columna.etapa}
                className="flex w-72 shrink-0 flex-col gap-3 rounded-lg bg-superficie-2 p-3"
              >
                <header className="sticky top-0 z-10 -mx-3 flex items-center justify-between rounded-t-lg bg-superficie-2 px-3 py-2">
                  <h2 className="text-sm font-semibold">{columna.titulo}</h2>
                  <span className="text-xs tabular-nums text-texto-secundario">{items.length}</span>
                </header>

                <div className="flex flex-col gap-3">
                  {items.length === 0 ? (
                    <p className="text-xs text-texto-tenue">Sin oportunidades</p>
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
