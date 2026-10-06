'use client';

import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import {
  ESTADOS_PIPELINE,
  PRIORIDADES_PIPELINE,
  type EstadoRfq,
  type PrioridadPipeline,
} from '@/modulos/pipeline/tipos/indice';
import { ETIQUETA_ESTADO_RFQ } from '@/modulos/pipeline/utilidades/indice';
import {
  hayFiltrosActivos,
  type FiltrosTablero,
} from '@/modulos/pipeline/servicios/filtrar-oportunidades';
import type {
  ImportePorMoneda,
  ResumenPipeline,
} from '@/modulos/pipeline/servicios/resumen-pipeline';

const ETIQUETA_PRIORIDAD: Record<PrioridadPipeline, string> = {
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

/**
 * Muestra un importe agregado sin sumar entre monedas: solo las monedas con
 * importe distinto de cero, separadas por "·". Devuelve "—" si todo es cero.
 */
export function formatearImportePorMoneda(importe: ImportePorMoneda): string {
  const partes: string[] = [];
  if (importe.MXN !== 0) partes.push(formatearMoneda(importe.MXN, 'MXN'));
  if (importe.USD !== 0) partes.push(formatearMoneda(importe.USD, 'USD'));
  return partes.length > 0 ? partes.join(' · ') : '—';
}

export interface ControlesPipelineProps {
  filtros: FiltrosTablero;
  onCambio: (parcial: Partial<FiltrosTablero>) => void;
  onLimpiar: () => void;
  resumen: ResumenPipeline;
  etiquetas: readonly string[];
  areas: readonly string[];
  clientes: readonly { id: string; nombre: string }[];
  responsables: readonly { id: string; nombre: string }[];
  totalFiltrado: number;
  totalTotal: number;
}

/**
 * Búsqueda + filtros de la cola RFQ (estado, cliente, responsable, próxima
 * acción vencida) y resumen por estado. Presentacional: no consulta datos; la
 * cola aplica los filtros en memoria.
 */
export function ControlesPipeline({
  filtros,
  onCambio,
  onLimpiar,
  resumen,
  etiquetas,
  areas,
  clientes,
  responsables,
  totalFiltrado,
  totalTotal,
}: ControlesPipelineProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <div className="flex flex-col gap-1 sm:col-span-2 xl:col-span-2">
          <Label htmlFor="pipeline-busqueda">Buscar</Label>
          <Input
            id="pipeline-busqueda"
            type="search"
            value={filtros.texto}
            onChange={(evento) => onCambio({ texto: evento.target.value })}
            placeholder="Folio, cliente, empresa o contacto"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pipeline-estado">Estado</Label>
          <Select
            id="pipeline-estado"
            value={filtros.estadoRfq}
            onChange={(evento) => onCambio({ estadoRfq: evento.target.value as EstadoRfq | '' })}
          >
            <option value="">Todos</option>
            {ESTADOS_PIPELINE.map((estado) => (
              <option key={estado} value={estado}>
                {ETIQUETA_ESTADO_RFQ[estado]}
              </option>
            ))}
          </Select>
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
          <Label htmlFor="pipeline-area">Área / departamento</Label>
          <Select
            id="pipeline-area"
            value={filtros.area}
            onChange={(evento) => onCambio({ area: evento.target.value })}
            disabled={areas.length === 0}
          >
            <option value="">Todas</option>
            {areas.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pipeline-cliente">Cliente</Label>
          <Select
            id="pipeline-cliente"
            value={filtros.clienteId}
            onChange={(evento) => onCambio({ clienteId: evento.target.value })}
            disabled={clientes.length === 0}
          >
            <option value="">Todos</option>
            {clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pipeline-responsable">Responsable</Label>
          <Select
            id="pipeline-responsable"
            value={filtros.responsableId}
            onChange={(evento) => onCambio({ responsableId: evento.target.value })}
            disabled={responsables.length === 0}
          >
            <option value="">Todos</option>
            {responsables.map((responsable) => (
              <option key={responsable.id} value={responsable.id}>
                {responsable.nombre}
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
          <span><strong className="text-texto-primario tabular-nums">{totalFiltrado}</strong> de {totalTotal} RFQ</span>
          <span>Convertidos: <strong className="text-texto-primario tabular-nums">{resumen.ganadas}</strong></span>
          <span>Cerrados/Cancelados: <strong className="text-texto-primario tabular-nums">{resumen.perdidas}</strong></span>
          <span>Envío: <strong className="text-texto-primario tabular-nums">{formatearImportePorMoneda(resumen.importeEnviado)}</strong></span>
          <span>Pendiente: <strong className="text-texto-primario tabular-nums">{formatearImportePorMoneda(resumen.importePendiente)}</strong></span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="pipeline-proxima-vencida" className="flex items-center gap-1.5 text-sm text-texto-secundario">
            <input
              id="pipeline-proxima-vencida"
              type="checkbox"
              checked={filtros.proximaVencida}
              onChange={(evento) => onCambio({ proximaVencida: evento.target.checked })}
            />
            Próxima acción vencida
          </label>
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
