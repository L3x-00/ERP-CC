'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cambiarEstadoOrdenAccion } from '@/modulos/ordenes/acciones/cambiar-estado-orden';
import { ReactivarOrdenDialog } from '@/modulos/ordenes/componentes/reactivar-orden-dialog';
import type { EstadoOrden } from '@/modulos/ordenes/tipos/ordenes';
import type { ProgramacionArea } from '@/modulos/planeacion/tipos/indice';

export interface PropsAccionesTarjetaOrden {
  programacion: ProgramacionArea;
  /** PRD-15: Reactivar se reserva a administradores. */
  puedeAdministrar: boolean;
  onRefrescar: () => void;
}

const CLASE_ACCION =
  'rounded-base border border-borde-fuerte px-2 py-1 text-[11px] font-medium transition-colors hover:bg-superficie-2 disabled:cursor-not-allowed disabled:opacity-40';

/**
 * PLA-06: acciones permitidas desde la tarjeta semanal según el estado de la
 * orden. Iniciar/Pausar/Reanudar reutilizan la transición con CAS; Bandeja y
 * Sesión/Entregar/Imprimir abren las pantallas existentes sin duplicar flujos.
 */
export function AccionesTarjetaOrden({
  programacion,
  puedeAdministrar,
  onRefrescar,
}: PropsAccionesTarjetaOrden) {
  const enrutador = useRouter();
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reactivando, setReactivando] = useState(false);
  const estado = programacion.ordenEstado;

  if (!estado) return null;

  async function cambiarEstado(nuevo: EstadoOrden): Promise<void> {
    if (!estado || !programacion.ordenActualizadoEn) return;
    setError(null);
    setProcesando(true);
    try {
      const respuesta = await cambiarEstadoOrdenAccion({
        ordenId: programacion.ordenId,
        estadoActual: estado,
        estado: nuevo,
      });
      if (!respuesta.exito) setError(respuesta.error);
      else onRefrescar();
    } catch {
      setError('No se pudo actualizar la orden');
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
      {estado === 'programada' ? (
        <button
          type="button"
          className={CLASE_ACCION}
          data-testid={`accion-iniciar-${programacion.ordenId}`}
          disabled={procesando}
          onClick={() => void cambiarEstado('en_proceso')}
        >
          Iniciar
        </button>
      ) : null}
      {estado === 'en_proceso' || estado === 'pausada' ? (
        <button
          type="button"
          className={CLASE_ACCION}
          data-testid={`accion-sesion-${programacion.ordenId}`}
          onClick={() => enrutador.push(`/produccion?ordenId=${programacion.ordenId}`)}
        >
          Sesión
        </button>
      ) : null}
      {estado === 'en_proceso' ? (
        <button
          type="button"
          className={CLASE_ACCION}
          data-testid={`accion-pausar-${programacion.ordenId}`}
          disabled={procesando}
          onClick={() => void cambiarEstado('pausada')}
        >
          Pausar
        </button>
      ) : null}
      {estado === 'pausada' ? (
        <button
          type="button"
          className={CLASE_ACCION}
          data-testid={`accion-reanudar-${programacion.ordenId}`}
          disabled={procesando}
          onClick={() => void cambiarEstado('en_proceso')}
        >
          Reanudar
        </button>
      ) : null}
      {estado === 'en_proceso' || estado === 'completada' ? (
        <button
          type="button"
          className={CLASE_ACCION}
          data-testid={`accion-entregar-${programacion.ordenId}`}
          onClick={() => enrutador.push(`/produccion?ordenId=${programacion.ordenId}`)}
        >
          Entregar
        </button>
      ) : null}
      {estado === 'completada' ? (
        <button
          type="button"
          className={CLASE_ACCION}
          data-testid={`accion-imprimir-${programacion.ordenId}`}
          onClick={() => enrutador.push(`/produccion?ordenId=${programacion.ordenId}`)}
        >
          Imprimir
        </button>
      ) : null}
      {estado === 'completada' && puedeAdministrar ? (
        <button
          type="button"
          className={CLASE_ACCION}
          data-testid={`accion-reactivar-${programacion.ordenId}`}
          onClick={() => setReactivando(true)}
        >
          Reactivar
        </button>
      ) : null}
      {procesando ? <span className="text-[11px] text-texto-tenue">Actualizando…</span> : null}
      {error ? <span role="alert" className="text-[11px] text-peligro-texto">{error}</span> : null}

      {reactivando && programacion.ordenActualizadoEn ? (
        <ReactivarOrdenDialog
          ordenId={programacion.ordenId}
          folio={programacion.ordenFolio ?? 'OP'}
          actualizadoEn={programacion.ordenActualizadoEn}
          onCerrar={() => setReactivando(false)}
        />
      ) : null}
    </div>
  );
}
