'use client';

import { useState } from 'react';
import { EditorCotizacion } from '@/modulos/pipeline/componentes/editor-cotizacion';
import { SelectorEtapa } from '@/modulos/pipeline/componentes/selector-etapa';
import { HiloComentarios } from '@/modulos/comentarios/componentes/indice';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import type { AlertaPipeline } from '@/modulos/pipeline/servicios/calcular-alertas';
import type { Oportunidad, PrioridadPipeline } from '@/modulos/pipeline/tipos/indice';

type PropsTarjetaOportunidad = {
  oportunidad: Oportunidad;
  alertas: AlertaPipeline[];
};

/** Días completos transcurridos desde una fecha ISO hasta `ahora` (mínimo 0). */
export function diasDesde(fecha: string, ahora: Date = new Date()): number {
  const transcurrido = ahora.getTime() - new Date(fecha).getTime();
  if (!Number.isFinite(transcurrido) || transcurrido <= 0) return 0;
  return Math.floor(transcurrido / 86_400_000);
}

/** Texto legible y clases semánticas por tipo de alerta. */
const ESTILO_ALERTA: Record<AlertaPipeline, { texto: string; clase: string }> = {
  sin_respuesta: {
    texto: 'Sin respuesta',
    clase: 'bg-advertencia-suave text-advertencia-texto',
  },
  estancada: {
    texto: 'Estancada',
    clase: 'bg-peligro-suave text-peligro-texto',
  },
  datos_incompletos: {
    texto: 'Datos incompletos',
    clase: 'bg-peligro-suave text-peligro-texto',
  },
};

/** Texto legible y clases semánticas por prioridad. */
export const ESTILO_PRIORIDAD: Record<PrioridadPipeline, { texto: string; clase: string }> = {
  baja: { texto: 'Baja', clase: 'bg-superficie-2 text-texto-secundario' },
  normal: { texto: 'Normal', clase: 'bg-superficie-2 text-texto-secundario' },
  alta: { texto: 'Alta', clase: 'bg-advertencia-suave text-advertencia-texto' },
  urgente: { texto: 'Urgente', clase: 'bg-peligro-suave text-peligro-texto' },
};

/**
 * Tarjeta compacta de una oportunidad del pipeline. Muestra el folio (CNC si ya
 * existe, si no el OP), empresa, contacto, etapa, prioridad, los días en la
 * etapa actual y las alertas visuales calculadas. Incluye el selector de etapa
 * para mover la oportunidad sin salir del tablero.
 */
export function TarjetaOportunidad({ oportunidad, alertas }: PropsTarjetaOportunidad) {
  const [mostrarComentarios, setMostrarComentarios] = useState(false);
  const folio = oportunidad.folioCnc ?? oportunidad.folioOp;
  const prioridad = ESTILO_PRIORIDAD[oportunidad.prioridad];

  return (
    <article className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs text-texto-secundario">{folio}</span>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {oportunidad.esOrdenInterna && (
            <span
              className="rounded-full bg-superficie-2 px-2.5 py-0.5 text-xs font-semibold text-texto-secundario"
              title="Trabajo interno: no genera cobranza ni cuenta como venta"
            >
              TI
            </span>
          )}
          <BadgeEstado estado={oportunidad.etapa} />
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${prioridad.clase}`}>
            {prioridad.texto}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-texto-primario">{oportunidad.empresa}</h3>
        <p className="text-xs text-texto-secundario">{oportunidad.nombreContacto}</p>
        <p className="text-xs text-texto-secundario">
          {diasDesde(oportunidad.actualizadoEn)} días en esta etapa
        </p>
      </div>

      {alertas.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {alertas.map((alerta) => (
            <li
              key={alerta}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTILO_ALERTA[alerta].clase}`}
            >
              {ESTILO_ALERTA[alerta].texto}
            </li>
          ))}
        </ul>
      )}

      {oportunidad.etiquetas.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Etiquetas">
          {oportunidad.etiquetas.map((etiqueta) => (
            <li
              key={etiqueta}
              className="rounded-full bg-superficie-2 px-2.5 py-0.5 text-xs text-texto-secundario"
            >
              {etiqueta}
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-borde pt-2">
        <SelectorEtapa oportunidad={oportunidad} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <EditorCotizacion oportunidad={oportunidad} />
      </div>
      <button
        type="button"
        onClick={() => setMostrarComentarios((actual) => !actual)}
        aria-expanded={mostrarComentarios}
        className="self-start text-xs font-semibold text-acento hover:underline"
      >
        {mostrarComentarios ? 'Ocultar comentarios' : 'Ver comentarios'}
      </button>
      {mostrarComentarios && (
        <HiloComentarios entidadTipo="cotizacion" entidadId={oportunidad.id} titulo={`Comentarios de ${folio}`} />
      )}
    </article>
  );
}
