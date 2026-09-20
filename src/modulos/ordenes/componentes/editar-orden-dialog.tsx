'use client';

import { useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { actualizarOrdenBorradorAccion } from '@/modulos/ordenes/acciones/actualizar-orden-borrador';
import {
  PRIORIDADES_ORDEN_PRODUCCION,
  type PrioridadOrden,
} from '@/modulos/ordenes/tipos/ordenes';
import type { OrdenTabla } from '@/modulos/ordenes/componentes/tabla-ordenes';

type PartidaEdicion = {
  id?: string;
  codigoPieza: string;
  descripcion: string;
  cantidadSolicitada: string;
  unidadMedida: string;
  tiempoEstimadoMinutos: string;
  maquinaAsignada: string;
};

function partidaDesdeTabla(partida: OrdenTabla['partidas'][number]): PartidaEdicion {
  return {
    id: partida.id,
    codigoPieza: partida.codigoPieza,
    descripcion: partida.descripcion ?? '',
    cantidadSolicitada: String(partida.cantidadSolicitada),
    unidadMedida: partida.unidadMedida,
    tiempoEstimadoMinutos: String(partida.tiempoEstimadoMinutos),
    maquinaAsignada: partida.maquinaAsignada ?? '',
  };
}

/**
 * ORD-05: diálogo de edición de una OP en borrador. Se monta condicionalmente
 * con `key` por versión, así el estado inicial nace de la fila vigente y no de
 * un efecto. Envía el token `actualizadoEn`; si otra persona guardó antes,
 * Postgres rechaza y el mensaje pide recargar.
 */
export function EditarOrdenDialog({
  orden,
  onCerrar,
  onGuardado,
}: {
  orden: OrdenTabla;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [prioridad, setPrioridad] = useState<PrioridadOrden>(orden.prioridad);
  const [fecha, setFecha] = useState(() => orden.fechaCompromiso.slice(0, 10));
  const [partidas, setPartidas] = useState<PartidaEdicion[]>(() =>
    orden.partidas.map(partidaDesdeTabla),
  );
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function cambiarPartida(indice: number, campo: keyof PartidaEdicion, valor: string): void {
    setPartidas((actual) =>
      actual.map((partida, posicion) => (posicion === indice ? { ...partida, [campo]: valor } : partida)),
    );
  }

  function agregarPartida(): void {
    setPartidas((actual) => [
      ...actual,
      {
        codigoPieza: '',
        descripcion: '',
        cantidadSolicitada: '1',
        unidadMedida: 'pza',
        tiempoEstimadoMinutos: '0',
        maquinaAsignada: '',
      },
    ]);
  }

  function quitarPartida(indice: number): void {
    setPartidas((actual) => actual.filter((_, posicion) => posicion !== indice));
  }

  async function guardar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const respuesta = await actualizarOrdenBorradorAccion({
        ordenId: orden.id,
        actualizadoEn: orden.actualizadoEn,
        prioridad,
        fechaCompromiso: new Date(`${fecha}T12:00:00.000Z`).toISOString(),
        partidas: partidas.map((partida) => ({
          ...(partida.id ? { id: partida.id } : {}),
          codigoPieza: partida.codigoPieza.trim(),
          descripcion: partida.descripcion.trim() || undefined,
          cantidadSolicitada: Number(partida.cantidadSolicitada),
          unidadMedida: partida.unidadMedida.trim(),
          tiempoEstimadoMinutos: Number(partida.tiempoEstimadoMinutos) || 0,
          maquinaAsignada: partida.maquinaAsignada.trim() || undefined,
        })),
      });
      if (!respuesta.exito) {
        setMensaje(respuesta.error);
        return;
      }
      onGuardado();
      onCerrar();
    } catch {
      setMensaje('No se pudo editar la orden. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(siguiente) => (!siguiente && !guardando ? onCerrar() : undefined)}
    >
      <DialogContent
        aria-describedby="descripcion-editar-orden"
        className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle>Editar orden {orden.folio}</DialogTitle>
          <DialogDescription id="descripcion-editar-orden">
            Solo disponible en borrador. Si alguien más guardó cambios antes, el sistema pide
            recargar.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(evento) => void guardar(evento)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="editar-orden-prioridad">Prioridad</Label>
              <Select
                id="editar-orden-prioridad"
                value={prioridad}
                onChange={(evento) => setPrioridad(evento.target.value as PrioridadOrden)}
              >
                {PRIORIDADES_ORDEN_PRODUCCION.map((valor) => (
                  <option key={valor} value={valor}>
                    {valor}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="editar-orden-fecha">Fecha de compromiso</Label>
              <Input
                id="editar-orden-fecha"
                type="date"
                value={fecha}
                onChange={(evento) => setFecha(evento.target.value)}
                required
              />
            </div>
          </div>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-semibold text-texto-primario">Partidas</legend>
            {partidas.map((partida, indice) => (
              <div
                key={partida.id ?? `nueva-${indice}`}
                data-testid={`partida-edicion-${indice}`}
                className="grid gap-2 rounded-base border border-borde p-3 sm:grid-cols-2"
              >
                <div className="grid gap-1">
                  <Label htmlFor={`partida-codigo-${indice}`}>Código de pieza</Label>
                  <Input
                    id={`partida-codigo-${indice}`}
                    value={partida.codigoPieza}
                    onChange={(evento) => cambiarPartida(indice, 'codigoPieza', evento.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`partida-descripcion-${indice}`}>Descripción</Label>
                  <Input
                    id={`partida-descripcion-${indice}`}
                    value={partida.descripcion}
                    onChange={(evento) => cambiarPartida(indice, 'descripcion', evento.target.value)}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`partida-cantidad-${indice}`}>Cantidad</Label>
                  <Input
                    id={`partida-cantidad-${indice}`}
                    data-testid={`partida-cantidad-${indice}`}
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={partida.cantidadSolicitada}
                    onChange={(evento) =>
                      cambiarPartida(indice, 'cantidadSolicitada', evento.target.value)
                    }
                    required
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`partida-unidad-${indice}`}>Unidad de medida</Label>
                  <Input
                    id={`partida-unidad-${indice}`}
                    value={partida.unidadMedida}
                    onChange={(evento) => cambiarPartida(indice, 'unidadMedida', evento.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`partida-tiempo-${indice}`}>Tiempo estimado (min)</Label>
                  <Input
                    id={`partida-tiempo-${indice}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={partida.tiempoEstimadoMinutos}
                    onChange={(evento) =>
                      cambiarPartida(indice, 'tiempoEstimadoMinutos', evento.target.value)
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`partida-maquina-${indice}`}>Máquina</Label>
                  <Input
                    id={`partida-maquina-${indice}`}
                    value={partida.maquinaAsignada}
                    onChange={(evento) =>
                      cambiarPartida(indice, 'maquinaAsignada', evento.target.value)
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    variante="contorno"
                    tamano="sm"
                    data-testid={`partida-quitar-${indice}`}
                    onClick={() => quitarPartida(indice)}
                    disabled={partidas.length === 1}
                  >
                    Quitar partida
                  </Button>
                </div>
              </div>
            ))}
            <div>
              <Button
                type="button"
                variante="secundario"
                data-testid="orden-agregar-partida"
                onClick={agregarPartida}
              >
                Agregar partida
              </Button>
            </div>
          </fieldset>

          {mensaje ? (
            <p role="alert" className="text-sm text-peligro-texto">
              {mensaje}
            </p>
          ) : null}
          <DialogFooter>
            <Button variante="contorno" type="button" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando} data-testid="orden-guardar-edicion">
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
