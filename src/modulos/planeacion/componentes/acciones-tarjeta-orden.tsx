'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { liberarOrdenAccion } from '@/modulos/ordenes/acciones/liberar-orden';
import { ESTADO_LEGACY_A_SII } from '@/modulos/ordenes/tipos/orden-sii';
import type { ProgramacionArea } from '@/modulos/planeacion/tipos/indice';

export interface PropsAccionesTarjetaOrden {
  programacion: ProgramacionArea;
  onRefrescar: () => void;
}

const CLASE_ACCION =
  'rounded-base border border-borde-fuerte px-2 py-1 text-[11px] font-medium transition-colors hover:bg-superficie-2 disabled:cursor-not-allowed disabled:opacity-40';

/**
 * PLA-06 + SII-B5: acciones de negocio de la tarjeta semanal. El estado deriva
 * del avance (ADR-SII-07): iniciar/pausar/reanudar manuales se eliminaron; la
 * sesión de piso y el avance deciden el estado. Liberar se ofrece según `estado_sii`.
 * Reactivar se retiró (C8.1): la cola de Órdenes y esta tarjeta no revierten estados.
 */
export function AccionesTarjetaOrden({
  programacion,
  onRefrescar,
}: PropsAccionesTarjetaOrden) {
  const enrutador = useRouter();
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const estadoSii = programacion.ordenEstadoSii
    ?? (programacion.ordenEstado ? ESTADO_LEGACY_A_SII[programacion.ordenEstado] : undefined);

  if (!estadoSii) return null;

  async function liberar(): Promise<void> {
    if (!programacion.ordenActualizadoEn) return;
    setError(null);
    setProcesando(true);
    try {
      const respuesta = await liberarOrdenAccion({
        ordenId: programacion.ordenId,
        actualizadoEn: programacion.ordenActualizadoEn,
      });
      if (!respuesta.exito) setError(respuesta.error);
      else onRefrescar();
    } catch {
      setError('No se pudo liberar la orden');
    }
    setProcesando(false);
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1 border-t border-borde pt-2"
      data-testid={`acciones-tarjeta-${programacion.ordenId}`}
    >
      <button
        type="button"
        className={CLASE_ACCION}
        data-testid={`accion-bandeja-${programacion.ordenId}`}
        onClick={() => enrutador.push(`/ordenes?ordenId=${programacion.ordenId}`)}
      >
        Bandeja
      </button>
      {estadoSii === 'PLANIFICADA' ? (
        <button
          type="button"
          className={CLASE_ACCION}
          data-testid={`accion-liberar-${programacion.ordenId}`}
          disabled={procesando}
          onClick={() => void liberar()}
        >
          {procesando ? 'Liberando…' : 'Liberar'}
        </button>
      ) : null}
      {estadoSii === 'EN_PRODUCCION' || estadoSii === 'LISTA' ? (
        <button
          type="button"
          className={CLASE_ACCION}
          data-testid={`accion-sesion-${programacion.ordenId}`}
          onClick={() => enrutador.push(`/produccion?ordenId=${programacion.ordenId}`)}
        >
          Sesión
        </button>
      ) : null}
      {estadoSii === 'EN_PRODUCCION' || estadoSii === 'PRODUCCION_COMPLETADA' || estadoSii === 'CERRADA' ? (
        <button
          type="button"
          className={CLASE_ACCION}
          data-testid={`accion-entregar-${programacion.ordenId}`}
          onClick={() => enrutador.push(`/produccion?ordenId=${programacion.ordenId}`)}
        >
          Entregar
        </button>
      ) : null}
      {estadoSii === 'PRODUCCION_COMPLETADA' || estadoSii === 'CERRADA' ? (
        <button
          type="button"
          className={CLASE_ACCION}
          data-testid={`accion-imprimir-${programacion.ordenId}`}
          onClick={() => enrutador.push(`/ordenes/${programacion.ordenId}`)}
        >
          Imprimir
        </button>
      ) : null}
      {procesando ? <span className="text-[11px] text-texto-tenue">Actualizando…</span> : null}
      {error ? <span role="alert" className="text-[11px] text-peligro-texto">{error}</span> : null}
    </div>
  );
}
