'use client';

import { useState } from 'react';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import {
  evaluarAsignacionTurno,
  type HuecoDisponible,
} from '@/modulos/planeacion/servicios/indice';
import type {
  CargaCapacidadDiaria,
  DesglosePartidaPlaneacion,
  ProgramacionArea,
} from '@/modulos/planeacion/tipos/indice';
import {
  etiquetaArea,
  etiquetaAvancePartida,
  etiquetaMaterial,
  textoODefecto,
} from '@/modulos/planeacion/utilidades/desglose';
import { ETIQUETA_TURNO } from '@/modulos/planeacion/utilidades/etiquetas';

export interface PropsDialogoReprogramacionPlaneacion {
  programacion: ProgramacionArea;
  fechaDestino: string;
  desglose?: DesglosePartidaPlaneacion;
  carga?: CargaCapacidadDiaria;
  onCerrar: () => void;
  onConfirmar: (fecha: string) => Promise<RespuestaAccion<unknown>>;
  onBuscarHueco?: () => Promise<RespuestaAccion<HuecoDisponible | null>>;
}

/**
 * OBS-19: el arrastre nunca guarda directo. Muestra el resumen de la
 * reprogramación, la capacidad resultante y, si no cabe, propone el primer día
 * hábil con hueco. La confirmación sigue usando el compare-and-set de la RPC.
 */
export function DialogoReprogramacionPlaneacion({
  programacion,
  fechaDestino,
  desglose,
  carga,
  onCerrar,
  onConfirmar,
  onBuscarHueco,
}: PropsDialogoReprogramacionPlaneacion) {
  const [fechaPropuesta, setFechaPropuesta] = useState(fechaDestino);
  const [enviando, setEnviando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hueco, setHueco] = useState<HuecoDisponible | null>(null);

  const esMismoDia = fechaPropuesta === programacion.fechaProgramada;
  const evaluacion = evaluarAsignacionTurno(carga, programacion.horasEstimadas, {
    horasEnSlot: esMismoDia ? programacion.horasEstimadas : 0,
  });
  const problemaCapacidad = !esMismoDia && (!carga || !evaluacion.cabe);

  async function confirmar(): Promise<void> {
    if (enviando || esMismoDia) return;
    setError(null);
    setEnviando(true);
    try {
      const resultado = await onConfirmar(fechaPropuesta);
      if (!resultado.exito) setError(resultado.error);
    } catch {
      setError('No se pudo reprogramar la partida');
    } finally {
      setEnviando(false);
    }
  }

  async function buscarHueco(): Promise<void> {
    if (!onBuscarHueco || buscando || enviando) return;
    setError(null);
    setBuscando(true);
    try {
      const resultado = await onBuscarHueco();
      if (!resultado.exito) {
        setError(resultado.error);
        return;
      }
      if (!resultado.datos) {
        setError('No se encontró un día hábil con capacidad en los próximos días');
        return;
      }
      setHueco(resultado.datos);
      setFechaPropuesta(resultado.datos.fecha);
    } catch {
      setError('No se pudo buscar un hueco disponible');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(abierto) => (!abierto ? onCerrar() : undefined)}>
      <DialogContent data-testid="dialogo-reprogramacion-planeacion">
        <DialogHeader>
          <DialogTitle>Reprogramar por arrastre</DialogTitle>
          <DialogDescription>
            Revisa el resumen y confirma. Capacidad y candados se validan de nuevo en PostgreSQL.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <div className="rounded-base border border-borde bg-superficie-2 p-3">
            <p className="font-mono text-xs font-medium">
              {desglose ? `${desglose.folio} · ${desglose.codigoPieza}` : 'Partida'}
            </p>
            <p className="text-texto-secundario">{textoODefecto(desglose?.descripcion)}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <div>
                <dt className="text-texto-secundario">De</dt>
                <dd>{programacion.fechaProgramada}</dd>
              </div>
              <div>
                <dt className="text-texto-secundario">A</dt>
                <dd data-testid="fecha-destino-reprogramacion">{fechaPropuesta}</dd>
              </div>
              <div>
                <dt className="text-texto-secundario">Área</dt>
                <dd>{desglose ? etiquetaArea(desglose) : textoODefecto(null)}</dd>
              </div>
              <div>
                <dt className="text-texto-secundario">Material</dt>
                <dd>{desglose ? etiquetaMaterial(desglose) : textoODefecto(null)}</dd>
              </div>
              <div>
                <dt className="text-texto-secundario">Equipo / estación</dt>
                <dd>{textoODefecto(desglose?.maquinaAsignada)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-texto-secundario">Avance</dt>
                <dd>{desglose ? etiquetaAvancePartida(desglose) : textoODefecto(null)}</dd>
              </div>
            </dl>
          </div>

          <p>
            {ETIQUETA_TURNO[programacion.turno]} · {programacion.horasEstimadas} h · prioridad{' '}
            {programacion.ordenPrioridad}
          </p>

          <p
            className={problemaCapacidad ? 'text-peligro-texto' : 'text-texto-secundario'}
            data-testid="capacidad-reprogramacion"
          >
            {!carga
              ? 'Sin capacidad configurada para ese recurso, fecha y turno'
              : esMismoDia
                ? 'El día no cambia: capacidad intacta'
                : `Capacidad tras mover: ${evaluacion.horasProgramadas}/${evaluacion.horasCapacidad} h · quedan ${evaluacion.holguraHoras} h`}
          </p>

          {hueco ? (
            <p className="rounded-base border border-acento bg-superficie-2 p-2 text-xs">
              Primer día hábil con hueco: <strong>{hueco.fecha}</strong> · quedan{' '}
              {hueco.horasDisponibles} h de {hueco.horasCapacidad} h.
            </p>
          ) : null}

          <p role="alert" aria-live="assertive" className="min-h-4 text-xs text-red-600">
            {error ?? ''}
          </p>
        </div>

        <DialogFooter>
          {onBuscarHueco && (problemaCapacidad || error) ? (
            <Button
              type="button"
              variante="secundario"
              disabled={buscando || enviando}
              onClick={() => void buscarHueco()}
              data-testid="buscar-hueco-reprogramacion"
            >
              {buscando ? 'Buscando…' : 'Buscar hueco'}
            </Button>
          ) : null}
          <Button type="button" variante="fantasma" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={enviando || esMismoDia}
            onClick={() => void confirmar()}
            data-testid="confirmar-reprogramacion-planeacion"
          >
            {enviando ? 'Reprogramando…' : `Reprogramar a ${fechaPropuesta}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
