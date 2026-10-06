'use client';

import Link from 'next/link';
import { BotonRetirarOportunidad } from '@/modulos/pipeline/componentes/boton-retirar-oportunidad';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import type { AlertaPipeline } from '@/modulos/pipeline/servicios/calcular-alertas';
import { proximaAccionVencida } from '@/modulos/pipeline/servicios/filtrar-oportunidades';
import type { Oportunidad, PrioridadPipeline } from '@/modulos/pipeline/tipos/indice';
import { ETIQUETAS_ESTADO_RFQ } from '@/modulos/rfq/utilidades/estados';
import { etiquetaProximaAccion } from '@/modulos/pipeline/utilidades/proxima-accion';

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

/** Etiqueta legible del estado de una orden de producción vinculada (RFQ-14). */
export const ETIQUETA_ESTADO_ORDEN: Record<string, string> = {
  borrador: 'Borrador',
  programada: 'Programada',
  en_proceso: 'En proceso',
  pausada: 'Pausada',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

/** Texto legible y clases semánticas por prioridad. */
export const ESTILO_PRIORIDAD: Record<PrioridadPipeline, { texto: string; clase: string }> = {
  baja: { texto: 'Baja', clase: 'bg-superficie-2 text-texto-secundario' },
  normal: { texto: 'Normal', clase: 'bg-superficie-2 text-texto-secundario' },
  alta: { texto: 'Alta', clase: 'bg-advertencia-suave text-advertencia-texto' },
  urgente: { texto: 'Urgente', clase: 'bg-peligro-suave text-peligro-texto' },
};

/**
 * Tarjeta compacta de un RFQ en la cola: folio, empresa, contacto, estado,
 * prioridad, próxima acción/fecha y alertas. Las acciones de negocio viven en
 * la ficha (`/rfq?rfq=<id>`), no en la tarjeta (ADR-SII-07).
 */
export function TarjetaOportunidad({ oportunidad, alertas }: PropsTarjetaOportunidad) {
  const folio = oportunidad.folioRfq ?? oportunidad.folioCnc ?? oportunidad.folioOp;
  const prioridad = ESTILO_PRIORIDAD[oportunidad.prioridad];
  const vencida = proximaAccionVencida(oportunidad, new Date().toISOString().slice(0, 10));

  return (
    <article
      className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie p-3 shadow-sm transition-shadow hover:shadow-md"
      data-testid="tarjeta-rfq"
    >
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
          <BadgeEstado
            estado={oportunidad.estadoRfq}
            etiqueta={ETIQUETAS_ESTADO_RFQ[oportunidad.estadoRfq]}
          />
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${prioridad.clase}`}>
            {prioridad.texto}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <Link
          href={`/rfq?rfq=${oportunidad.id}`}
          className="text-sm font-semibold text-texto-primario underline-offset-2 hover:text-acento hover:underline focus-visible:underline"
        >
          {oportunidad.empresa}
        </Link>
        <p className="text-xs text-texto-secundario">{oportunidad.nombreContacto}</p>
        {oportunidad.descripcionGeneral && (
          <p className="line-clamp-2 text-xs text-texto-secundario">{oportunidad.descripcionGeneral}</p>
        )}
        <p className="text-xs text-texto-secundario">
          {oportunidad.fechaProximaAccion ? (
            <span className={vencida ? 'font-semibold text-peligro-texto' : undefined}>
              Próxima acción: {etiquetaProximaAccion(oportunidad.proximaAccionCodigo)}{' '}
              {oportunidad.fechaProximaAccion}
              {vencida ? ' (vencida)' : ''}
            </span>
          ) : (
            'Sin próxima acción'
          )}
        </p>
        {oportunidad.importeSubtotal !== undefined && oportunidad.importeSubtotal > 0 && (
          <p className="text-xs text-texto-secundario">
            Importe: <span className="tabular-nums">{formatearMoneda(oportunidad.importeSubtotal, oportunidad.moneda)}</span>
          </p>
        )}
        {oportunidad.ordenVinculada && (
          <p className="text-xs text-texto-secundario">
            Orden: <span className="font-mono">{oportunidad.ordenVinculada.folio}</span>
            {' · '}
            {ETIQUETA_ESTADO_ORDEN[oportunidad.ordenVinculada.estado] ?? oportunidad.ordenVinculada.estado}
          </p>
        )}
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

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde pt-2">
        <Link
          href={`/rfq?rfq=${oportunidad.id}`}
          className="text-xs font-semibold text-acento hover:underline"
        >
          Abrir RFQ
        </Link>
        <BotonRetirarOportunidad oportunidadId={oportunidad.id} folio={folio} />
      </div>
    </article>
  );
}
