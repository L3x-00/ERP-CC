'use client';

import {
  RESULTADOS_PROXIMA_ACCION,
  type ResultadoProximaAccion,
} from '@/modulos/rfq/utilidades/proxima-accion';

/** Tarjeta de opción compartida por el modo y el resultado del seguimiento. */
export const CLASE_OPCION_SEGUIMIENTO =
  'flex cursor-pointer items-start gap-2 rounded-lg border border-borde bg-superficie p-3 text-sm has-[:checked]:border-acento has-[:checked]:bg-acento-suave has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-acento';

/**
 * Cómo terminó la acción de seguimiento que se sustituye (obs. cliente
 * 2026-10-21). Presentacional y compartido por el cambio de estado y la
 * edición directa del Resumen; el servidor decide cuándo es obligatorio.
 */
export function CamposResultadoSeguimiento({
  idBase,
  valor,
  onCambio,
  leyenda = '¿Cómo terminó esta acción?',
}: {
  idBase: string;
  valor: ResultadoProximaAccion | '';
  onCambio: (resultado: ResultadoProximaAccion) => void;
  leyenda?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2" data-testid="resultado-seguimiento">
      <legend className="mb-1 text-sm font-semibold">{leyenda}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {RESULTADOS_PROXIMA_ACCION.map((opcion) => (
          <label key={opcion.valor} className={CLASE_OPCION_SEGUIMIENTO}>
            <input
              type="radio"
              name={`${idBase}-resultado`}
              className="mt-1"
              checked={valor === opcion.valor}
              onChange={() => onCambio(opcion.valor)}
            />
            <span>
              <span className="font-medium">{opcion.etiqueta}</span>
              <span className="block text-texto-secundario">{opcion.ayuda}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
