'use client';

import { formatearFechaCalendario } from '@/modulos/ordenes/utilidades/formato-ficha';
import type { Rfq } from '@/modulos/rfq/tipos/indice';
import {
  RESULTADOS_PROXIMA_ACCION,
  proximaAccionTrasResultado,
  proximaAccionVencida,
  tieneProximaAccionVigente,
  type ResultadoProximaAccion,
  type SeguimientoTransicion,
} from '@/modulos/rfq/utilidades/proxima-accion';

import type { CatalogosRfq } from '../acciones/obtener-catalogos';
import { CamposProximaAccion } from './campos-proxima-accion';

const CLASE_OPCION =
  'flex cursor-pointer items-start gap-2 rounded-lg border border-borde bg-superficie p-3 text-sm has-[:checked]:border-acento has-[:checked]:bg-acento-suave has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-acento';

/**
 * Seguimiento de un cambio de estado: muestra la acción vigente y deja elegir
 * entre dejarla como está o cerrarla (con su resultado) y definir la siguiente.
 * Presentacional: el panel guarda la decisión y el servidor la revalida.
 */
export function SeguimientoTransicionRfq({
  idBase,
  rfq,
  catalogos,
  hoy,
  valor,
  onCambio,
}: {
  idBase: string;
  rfq: Rfq;
  catalogos: CatalogosRfq;
  hoy: string;
  valor: SeguimientoTransicion;
  onCambio: (valor: SeguimientoTransicion) => void;
}) {
  const hayVigente = tieneProximaAccionVigente(rfq);

  if (!hayVigente) {
    return (
      <div className="flex flex-col gap-2" data-testid="seguimiento-transicion">
        <p className="text-sm text-texto-secundario">
          Este RFQ aún no tiene seguimiento. Define qué sigue.
        </p>
        <CamposProximaAccion
          idBase={`${idBase}-proxima`}
          valor={valor.proxima}
          onCambio={(proxima) => onCambio({ ...valor, proxima })}
          catalogos={catalogos}
          hoy={hoy}
        />
      </div>
    );
  }

  const vencida = proximaAccionVencida(rfq, hoy);
  const nombreAccion =
    catalogos.proximasAcciones.find((opcion) => opcion.codigo === rfq.proximaAccionCodigo)?.nombre
    ?? rfq.proximaAccionCodigo;
  const detalle = rfq.proximaAccionTexto ? ` (${rfq.proximaAccionTexto})` : '';
  const responsable = catalogos.usuarios.find(
    (usuario) => usuario.id === rfq.responsableProximaAccionId,
  )?.nombre;
  const fecha = rfq.fechaProximaAccion ? formatearFechaCalendario(rfq.fechaProximaAccion) : null;

  function elegirModo(modo: SeguimientoTransicion['modo']): void {
    if (modo === 'mantener') {
      onCambio({ modo, resultado: '', proxima: valor.proxima });
      return;
    }
    onCambio({ modo, resultado: valor.resultado, proxima: valor.proxima });
  }

  function elegirResultado(resultado: ResultadoProximaAccion): void {
    onCambio({ modo: 'cerrar', resultado, proxima: proximaAccionTrasResultado(rfq, resultado) });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="seguimiento-transicion">
      <div className="flex flex-col gap-1 rounded-lg bg-superficie-2 p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">
          Seguimiento actual
        </span>
        <span className="text-sm font-medium">
          {nombreAccion}
          {detalle}
        </span>
        <span className="text-sm text-texto-secundario">
          {fecha ? `Para el ${fecha}` : 'Sin fecha'}
          {responsable ? ` · ${responsable}` : ''}
          {vencida && (
            <strong className="ml-2 font-semibold text-peligro-texto">Ya venció</strong>
          )}
        </span>
      </div>

      {vencida ? (
        <p className="text-sm text-texto-secundario">
          Cuéntanos cómo terminó esta acción y define la siguiente.
        </p>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">¿Qué hacemos con este seguimiento?</legend>
          <label className={CLASE_OPCION}>
            <input
              type="radio"
              name={`${idBase}-modo`}
              className="mt-1"
              checked={valor.modo === 'mantener'}
              onChange={() => elegirModo('mantener')}
            />
            <span>
              <span className="font-medium">Dejarlo como está</span>
              <span className="block text-texto-secundario">
                Sigue pendiente; cambiar el estado no lo modifica.
              </span>
            </span>
          </label>
          <label className={CLASE_OPCION}>
            <input
              type="radio"
              name={`${idBase}-modo`}
              className="mt-1"
              checked={valor.modo === 'cerrar'}
              onChange={() => elegirModo('cerrar')}
            />
            <span>
              <span className="font-medium">Cerrarlo y definir otro</span>
              <span className="block text-texto-secundario">
                Indica cómo terminó y qué sigue ahora.
              </span>
            </span>
          </label>
        </fieldset>
      )}

      {valor.modo === 'cerrar' && (
        <>
          <fieldset className="flex flex-col gap-2" data-testid="resultado-seguimiento">
            <legend className="mb-1 text-sm font-semibold">¿Cómo terminó esta acción?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {RESULTADOS_PROXIMA_ACCION.map((opcion) => (
                <label key={opcion.valor} className={CLASE_OPCION}>
                  <input
                    type="radio"
                    name={`${idBase}-resultado`}
                    className="mt-1"
                    checked={valor.resultado === opcion.valor}
                    onChange={() => elegirResultado(opcion.valor)}
                  />
                  <span>
                    <span className="font-medium">{opcion.etiqueta}</span>
                    <span className="block text-texto-secundario">{opcion.ayuda}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {valor.resultado !== '' && (
            <CamposProximaAccion
              idBase={`${idBase}-proxima`}
              valor={valor.proxima}
              onCambio={(proxima) => onCambio({ ...valor, proxima })}
              catalogos={catalogos}
              hoy={hoy}
            />
          )}
        </>
      )}
    </div>
  );
}
