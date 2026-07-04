'use client';

import { useState } from 'react';

import { FormularioProspecto } from '@/modulos/pipeline/componentes/formulario-prospecto';
import { TarjetaOportunidad } from '@/modulos/pipeline/componentes/tarjeta-oportunidad';
import { usarAlertasPipeline } from '@/modulos/pipeline/hooks/usar-alertas-pipeline';
import { usarPipeline } from '@/modulos/pipeline/hooks/usar-pipeline';
import type { EtapaPipeline } from '@/modulos/pipeline/tipos/indice';

const COLUMNAS: { etapa: EtapaPipeline; titulo: string }[] = [
  { etapa: 'prospecto', titulo: 'Prospecto' },
  { etapa: 'contactado', titulo: 'Contactado' },
  { etapa: 'cotizado', titulo: 'Cotizado' },
  { etapa: 'negociacion', titulo: 'Negociación' },
  { etapa: 'ganada', titulo: 'Ganada' },
  { etapa: 'perdida', titulo: 'Perdida' },
];

const CLASE_BOTON_PRIMARIO =
  'rounded-base bg-primario px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Tablero Kanban del pipeline: una columna por etapa (en orden de avance).
 * Obtiene las oportunidades con `usarPipeline` y calcula sus alertas con
 * `usarAlertasPipeline`, agrupándolas por etapa. El cambio de etapa se hace
 * desde el selector dentro de cada tarjeta. El encabezado alterna el
 * `FormularioProspecto` para crear nuevas oportunidades.
 */
export function TableroKanban() {
  const { data, isLoading, isError } = usarPipeline();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  const oportunidades = data ?? [];
  const alertasPorId = usarAlertasPipeline(oportunidades);

  const hayDatos = !isLoading && !isError && oportunidades.length > 0;
  const vacio = !isLoading && !isError && oportunidades.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setMostrarFormulario((previo) => !previo)}
          className={CLASE_BOTON_PRIMARIO}
        >
          {mostrarFormulario ? 'Cerrar formulario' : 'Nueva oportunidad'}
        </button>
      </div>

      {mostrarFormulario && (
        <div className="rounded-base border border-foreground/10 bg-background p-4">
          <FormularioProspecto />
        </div>
      )}

      {isLoading && (
        <p className="text-sm text-foreground/60">Cargando oportunidades…</p>
      )}

      {!isLoading && isError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          No se pudieron cargar las oportunidades del pipeline.
        </p>
      )}

      {vacio && (
        <p className="text-sm text-foreground/60">
          Aún no hay oportunidades en el pipeline.
        </p>
      )}

      {hayDatos && (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {COLUMNAS.map((columna) => {
            const items = oportunidades.filter(
              (oportunidad) => oportunidad.etapa === columna.etapa,
            );
            return (
              <section
                key={columna.etapa}
                className="flex w-72 shrink-0 flex-col gap-3"
              >
                <header className="flex items-center justify-between rounded-base bg-foreground/5 px-3 py-2">
                  <h2 className="text-sm font-semibold">{columna.titulo}</h2>
                  <span className="text-xs text-foreground/60">{items.length}</span>
                </header>

                <div className="flex flex-col gap-3">
                  {items.length === 0 ? (
                    <p className="text-xs text-foreground/40">Sin oportunidades</p>
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
