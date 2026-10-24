'use client';

import { formatearFechaCalendario } from '@/modulos/ordenes/utilidades/formato-ficha';
import type { Rfq } from '@/modulos/rfq/tipos/indice';
import {
  proximaAccionTrasResultado,
  proximaAccionVencida,
  tieneProximaAccionVigente,
  type ResultadoProximaAccion,
  type SeguimientoTransicion,
} from '@/modulos/rfq/utilidades/proxima-accion';

import type { CatalogosRfq } from '../acciones/obtener-catalogos';
import { CamposProximaAccion } from './campos-proxima-accion';
import { CamposResultadoSeguimiento } from './campos-resultado-seguimiento';

/**
 * Seguimiento de un cambio de estado. Si la acción vigente sigue siendo válida
 * se conserva automáticamente y solo se muestra como referencia: cambiar el
 * estado no obliga a actualizarla. Cuando venció (o no existe) sí se pide cómo
 * terminó y cuál es la siguiente. Presentacional: el panel guarda la decisión y
 * el servidor la revalida.
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
        <>
          <p className="text-sm text-texto-secundario">
            Cuéntanos cómo terminó esta acción y define la siguiente.
          </p>
          <CamposResultadoSeguimiento
            idBase={idBase}
            valor={valor.resultado}
            onCambio={elegirResultado}
          />

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
      ) : (
        <p className="text-sm text-texto-secundario">
          Se conserva tal cual al cambiar el estado. Para sustituirla, edítala desde el Resumen.
        </p>
      )}
    </div>
  );
}
