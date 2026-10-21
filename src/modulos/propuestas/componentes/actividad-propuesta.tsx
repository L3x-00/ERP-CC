'use client';

import { formatearFecha } from '@/compartido/utilidades/formatear';
import type { CatalogosPropuesta } from '@/modulos/propuestas/acciones/obtener-catalogos-propuesta';
import type { EventoRevisionPropuesta, RevisionPropuesta } from '@/modulos/propuestas/tipos/indice';
import { ETIQUETA_ESTADO_PROPIESTA } from '@/modulos/propuestas/utilidades/indice';
import { etiquetaEventoPropuesta } from '@/modulos/propuestas/utilidades/etiquetas-eventos';

/**
 * SII-B4.2/4.11: bitácora de la versión, escrita en frases sencillas (sin los
 * códigos internos de cada acción) y del cambio más reciente al más antiguo.
 */
export function ActividadPropuesta({
  revision,
  eventos,
  catalogos = null,
}: {
  revision: RevisionPropuesta;
  eventos: EventoRevisionPropuesta[];
  /** Para mostrar el nombre del canal en vez de su código. */
  catalogos?: CatalogosPropuesta | null;
}) {
  const historial = eventos
    .filter((evento) => evento.revisionId === revision.id)
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

  const nombreCanal = (valor: string): string =>
    catalogos?.canales.find((opcion) => opcion.codigo === valor)?.nombre ?? valor;

  return (
    <section className="flex flex-col gap-3" data-testid="actividad-propuesta-seccion">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-texto-primario">Actividad de la versión {revision.letra}</h3>
        <p className="text-xs text-texto-secundario">
          Aquí queda anotado cada cambio importante de esta versión: qué pasó, cuándo y a qué estado
          pasó. Lo más reciente aparece primero.
        </p>
      </div>

      {historial.length === 0 ? (
        <p className="text-sm text-texto-secundario">
          Todavía no hay actividad en esta versión. Los cambios importantes se irán anotando aquí.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-borde" data-testid="actividad-propuesta">
          {historial.map((evento) => (
            <li key={evento.id} className="flex flex-col gap-0.5 py-2 text-sm">
              <span className="font-medium">{etiquetaEventoPropuesta(evento.accion)}</span>
              <span className="text-xs text-texto-secundario">
                {evento.estadoAnterior && evento.estadoNuevo && evento.estadoAnterior !== evento.estadoNuevo
                  ? `${ETIQUETA_ESTADO_PROPIESTA[evento.estadoAnterior]} → ${ETIQUETA_ESTADO_PROPIESTA[evento.estadoNuevo]} · `
                  : ''}
                {evento.canal ? `Por ${nombreCanal(evento.canal)} · ` : ''}
                {evento.destino ? `A ${evento.destino} · ` : ''}
                {formatearFecha(evento.creadoEn)}
              </span>
              {evento.motivo && <span className="text-xs text-texto-tenue">{evento.motivo}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
