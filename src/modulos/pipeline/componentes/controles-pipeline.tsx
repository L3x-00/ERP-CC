'use client';

import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { PRIORIDADES_PIPELINE, type PrioridadPipeline } from '@/modulos/pipeline/tipos/indice';
import {
  hayFiltrosActivos,
  type FiltrosTablero,
} from '@/modulos/pipeline/servicios/filtrar-oportunidades';
import type { ResumenPipeline } from '@/modulos/pipeline/servicios/resumen-pipeline';

const ETIQUETA_PRIORIDAD: Record<PrioridadPipeline, string> = {
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

export interface ControlesPipelineProps {
  filtros: FiltrosTablero;
  onCambio: (parcial: Partial<FiltrosTablero>) => void;
  onLimpiar: () => void;
  resumen: ResumenPipeline;
  etiquetas: readonly string[];
  totalFiltrado: number;
  totalTotal: number;
}

/**
 * Búsqueda + filtros (RFQ-13) y resumen del pipeline (RFQ-14, por conteo).
 * Presentacional: no consulta datos; el tablero aplica los filtros en memoria.
 */
export function ControlesPipeline({
  filtros,
  onCambio,
  onLimpiar,
  resumen,
  etiquetas,
  totalFiltrado,
  totalTotal,
}: ControlesPipelineProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="flex flex-col gap-1 sm:col-span-2 xl:col-span-2">
          <Label htmlFor="pipeline-busqueda">Buscar</Label>
          <Input
            id="pipeline-busqueda"
            type="search"
            value={filtros.texto}
            onChange={(evento) => onCambio({ texto: evento.target.value })}
            placeholder="Folio, empresa o contacto"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pipeline-prioridad">Prioridad</Label>
          <Select
            id="pipeline-prioridad"
            value={filtros.prioridad}
            onChange={(evento) => onCambio({ prioridad: evento.target.value as PrioridadPipeline | '' })}
          >
            <option value="">Todas</option>
            {PRIORIDADES_PIPELINE.map((prioridad) => (
              <option key={prioridad} value={prioridad}>
                {ETIQUETA_PRIORIDAD[prioridad]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pipeline-etiqueta">Etiqueta</Label>
          <Select
            id="pipeline-etiqueta"
            value={filtros.etiqueta}
            onChange={(evento) => onCambio({ etiqueta: evento.target.value })}
            disabled={etiquetas.length === 0}
          >
            <option value="">Todas</option>
            {etiquetas.map((etiqueta) => (
              <option key={etiqueta} value={etiqueta}>
                {etiqueta}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pipeline-desde">Desde</Label>
          <Input
            id="pipeline-desde"
            type="date"
            value={filtros.desde}
            max={filtros.hasta || undefined}
            onChange={(evento) => onCambio({ desde: evento.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pipeline-hasta">Hasta</Label>
          <Input
            id="pipeline-hasta"
            type="date"
            value={filtros.hasta}
            min={filtros.desde || undefined}
            onChange={(evento) => onCambio({ hasta: evento.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-texto-secundario">
          <span><strong className="text-texto-primario tabular-nums">{totalFiltrado}</strong> de {totalTotal} oportunidad(es)</span>
          <span>Ganadas: <strong className="text-texto-primario tabular-nums">{resumen.ganadas}</strong></span>
          <span>Perdidas: <strong className="text-texto-primario tabular-nums">{resumen.perdidas}</strong></span>
          <span>Conversión: <strong className="text-texto-primario tabular-nums">{resumen.conversion}%</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="pipeline-solo-ti" className="flex items-center gap-1.5 text-sm text-texto-secundario">
            <input
              id="pipeline-solo-ti"
              type="checkbox"
              checked={filtros.soloInternas}
              onChange={(evento) => onCambio({ soloInternas: evento.target.checked })}
            />
            Solo internas (TI)
          </label>
          <Button
            type="button"
            variante="contorno"
            tamano="sm"
            onClick={onLimpiar}
            disabled={!hayFiltrosActivos(filtros)}
          >
            Limpiar filtros
          </Button>
        </div>
      </div>
    </div>
  );
}
