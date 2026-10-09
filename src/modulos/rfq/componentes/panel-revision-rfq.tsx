'use client';

import { Button } from '@/compartido/componentes/ui/button';
import type { CatalogosRfq } from '@/modulos/rfq/acciones/obtener-catalogos';
import { ResumenRfq } from '@/modulos/rfq/componentes/resumen-rfq';
import type {
  Rfq,
  SeccionValidacionRfq,
  ValidacionRfqListo,
} from '@/modulos/rfq/tipos/indice';
import { SECCIONES_VALIDACION_RFQ } from '@/modulos/rfq/tipos/indice';
import { etiquetaSeccion } from '@/modulos/rfq/utilidades/estados';

/** Dónde se corrige cada sección de la validación del servidor. */
type DestinoCorreccion = 'resumen' | 'items' | 'archivos';

const DESTINO_POR_SECCION: Record<SeccionValidacionRfq, DestinoCorreccion> = {
  cliente: 'resumen',
  general: 'resumen',
  items: 'items',
  archivos: 'archivos',
  seguimiento: 'resumen',
};

const ETIQUETAS_DESTINO: Record<DestinoCorreccion, string> = {
  resumen: 'Corregir en Resumen',
  items: 'Ir a Ítems',
  archivos: 'Ir a Archivos',
};

const ORDEN_DESTINOS: readonly DestinoCorreccion[] = ['resumen', 'items', 'archivos'];

type Props = {
  rfq: Rfq;
  catalogos: CatalogosRfq | null;
  /** Resultado de `validar_rfq_listo`; null si aún no se consultó. */
  validacion: ValidacionRfqListo | null;
  validando: boolean;
  error: string | null;
  onRevalidar: () => void;
  onEditarResumen: () => void;
  onIrAItems: () => void;
  onIrAArchivos: () => void;
};

/**
 * Paso Revisar del flujo durable (C1.2b): muestra el RFQ tal como quedó
 * (reutilizando `ResumenRfq`, que ya resuelve nombres, fechas y canal) junto al
 * checklist de `validar_rfq_listo` agrupado por sección. Es presentacional: no
 * llama Server Actions ni cambia el estado del RFQ — solo pide revalidar y
 * dirige a dónde se corrige cada faltante. Confirmar el cambio de estado sigue
 * siendo trabajo de la acción superior “Marcar listo para propuesta”.
 */
export function PanelRevisionRfq({
  rfq,
  catalogos,
  validacion,
  validando,
  error,
  onRevalidar,
  onEditarResumen,
  onIrAItems,
  onIrAArchivos,
}: Props) {
  // Un resultado anterior no se mezcla con una revisión en vuelo ni con un
  // error: mostrarlo haría creer que los faltantes siguen siendo los vigentes.
  const mostrarChecklist = validacion !== null && !validando && error === null;

  const accionPorDestino: Record<DestinoCorreccion, () => void> = {
    resumen: onEditarResumen,
    items: onIrAItems,
    archivos: onIrAArchivos,
  };

  const destinosConFaltantes = validacion
    ? ORDEN_DESTINOS.filter((destino) =>
        SECCIONES_VALIDACION_RFQ.some(
          (seccion) =>
            DESTINO_POR_SECCION[seccion] === destino &&
            validacion.secciones[seccion].length > 0,
        ),
      )
    : [];

  return (
    <section
      aria-label="Revisión del RFQ"
      data-testid="panel-revision-rfq"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-sm font-semibold text-texto-primario">
              Revisar antes de marcar listo
            </h2>
            <p className="text-sm text-texto-secundario">
              Esta revisión es informativa: el servidor vuelve a validar al confirmar la acción.
            </p>
          </div>
          <Button
            variante="contorno"
            tamano="sm"
            disabled={validando}
            onClick={onRevalidar}
          >
            {error !== null ? 'Reintentar' : 'Revalidar'}
          </Button>
        </div>

        {validando && (
          <p
            role="status"
            aria-live="polite"
            className="rounded-md bg-superficie-2 px-3 py-2 text-sm text-texto-secundario"
          >
            Revisando el RFQ…
          </p>
        )}

        {error !== null && !validando && (
          <p
            role="alert"
            className="rounded-md border border-peligro/40 bg-peligro-suave px-3 py-2 text-sm text-peligro-texto"
          >
            {error}
          </p>
        )}

        {mostrarChecklist && validacion.listo && (
          <p
            role="status"
            aria-live="polite"
            className="rounded-md bg-exito-suave px-3 py-2 text-sm font-medium text-exito-texto"
          >
            El RFQ está completo. Usa “Marcar listo para propuesta” en las acciones de arriba para
            confirmarlo.
          </p>
        )}

        {mostrarChecklist && (
          <ul data-testid="revision-checklist" className="flex flex-col gap-2">
            {SECCIONES_VALIDACION_RFQ.map((seccion) => {
              const faltantes = validacion.secciones[seccion];
              const conFaltantes = faltantes.length > 0;

              return (
                <li
                  key={seccion}
                  data-testid={`revision-seccion-${seccion}`}
                  data-faltantes={conFaltantes ? 'si' : 'no'}
                  className={[
                    'flex flex-col gap-1 rounded-md border px-3 py-2',
                    conFaltantes
                      ? 'border-peligro/40 bg-peligro-suave'
                      : 'border-borde bg-superficie-2',
                  ].join(' ')}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span aria-hidden="true" className="text-xs">
                      {conFaltantes ? '!' : '✓'}
                    </span>
                    <span className="text-sm font-semibold text-texto-primario">
                      {etiquetaSeccion(seccion)}
                    </span>
                    <span
                      className={
                        conFaltantes
                          ? 'text-xs font-semibold text-peligro-texto'
                          : 'text-xs font-medium text-texto-secundario'
                      }
                    >
                      {conFaltantes
                        ? `${faltantes.length} pendiente${faltantes.length === 1 ? '' : 's'}`
                        : 'Sin faltantes'}
                    </span>
                  </div>
                  {conFaltantes && (
                    <ul className="list-inside list-disc text-sm text-texto-primario">
                      {faltantes.map((faltante) => (
                        <li key={faltante}>{faltante}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {mostrarChecklist && destinosConFaltantes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {destinosConFaltantes.map((destino) => (
              <Button
                key={destino}
                variante="contorno"
                tamano="sm"
                onClick={accionPorDestino[destino]}
              >
                {ETIQUETAS_DESTINO[destino]}
              </Button>
            ))}
          </div>
        )}
      </div>

      <ResumenRfq rfq={rfq} catalogos={catalogos} onEditar={onEditarResumen} />
    </section>
  );
}
