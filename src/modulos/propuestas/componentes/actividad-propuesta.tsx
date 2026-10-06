'use client';

import { formatearFecha } from '@/compartido/utilidades/formatear';
import type { EventoRevisionPropuesta, RevisionPropuesta } from '@/modulos/propuestas/tipos/indice';
import { ETIQUETA_ESTADO_PROPIESTA } from '@/modulos/propuestas/utilidades/indice';

/** SII-B4.2/4.11: bitácora de transiciones de la revisión (evento por acción). */
export function ActividadPropuesta({
  revision,
  eventos,
}: {
  revision: RevisionPropuesta;
  eventos: EventoRevisionPropuesta[];
}) {
  const historial = eventos
    .filter((evento) => evento.revisionId === revision.id)
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

  if (historial.length === 0) {
    return <p className="text-sm text-texto-secundario">Sin eventos registrados.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-borde" data-testid="actividad-propuesta">
      {historial.map((evento) => (
        <li key={evento.id} className="flex flex-col gap-0.5 py-2 text-sm">
          <span className="font-medium">{evento.accion}</span>
          <span className="text-xs text-texto-secundario">
            {evento.estadoAnterior
              ? `${ETIQUETA_ESTADO_PROPIESTA[evento.estadoAnterior]} → `
              : ''}
            {evento.estadoNuevo ? ETIQUETA_ESTADO_PROPIESTA[evento.estadoNuevo] : ''}
            {evento.canal ? ` · ${evento.canal}` : ''}
            {evento.destino ? ` · ${evento.destino}` : ''}
            {' · '}
            {formatearFecha(evento.creadoEn)}
          </span>
          {evento.motivo && <span className="text-xs text-texto-tenue">{evento.motivo}</span>}
        </li>
      ))}
    </ul>
  );
}
