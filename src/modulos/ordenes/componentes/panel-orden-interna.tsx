'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import { crearOrdenInternaAccion } from '@/modulos/ordenes/acciones/crear-orden-interna';
import type { CatalogosRfq } from '@/modulos/rfq/acciones/obtener-catalogos';

type PartidaInterna = {
  codigoPieza: string;
  descripcion: string;
  cantidad: string;
  unidad: string;
  tiempoMinutos: string;
  materialId: string;
  espesorId: string;
  procesoIds: string[];
  areaTrabajoCodigo: string;
};

const PARTIDA_VACIA: PartidaInterna = {
  codigoPieza: '',
  descripcion: '',
  cantidad: '1',
  unidad: 'unidad',
  tiempoMinutos: '0',
  materialId: '',
  espesorId: '',
  procesoIds: [],
  areaTrabajoCodigo: '',
};

function ahoraLocal(): string {
  const ahora = new Date();
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/**
 * Alta directa autorizada de una orden interna (TI): trabajo interno sin
 * cliente, sin venta y sin cuenta por cobrar; el motivo de autorización queda
 * auditado. Obs. cliente 2026-10-12 (5): las partidas usan los catálogos
 * configurados (material, espesor y procesos) y el área se autocompleta con el
 * primer proceso que la tenga configurada.
 */
export function PanelOrdenInterna({
  catalogos,
  areas,
}: {
  catalogos: CatalogosRfq | null;
  areas: { codigo: string; nombre: string }[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [abierto, setAbierto] = useState(false);
  const [fechaCompromiso, setFechaCompromiso] = useState(ahoraLocal());
  const [prioridad, setPrioridad] = useState('normal');
  const [motivo, setMotivo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [partidas, setPartidas] = useState<PartidaInterna[]>([{ ...PARTIDA_VACIA }]);

  function limpiar(): void {
    setError(null);
    setMensaje(null);
  }

  function cambiarPartida(indice: number, cambios: Partial<PartidaInterna>): void {
    setPartidas((actual) =>
      actual.map((partida, posicion) =>
        posicion === indice ? { ...partida, ...cambios } : partida,
      ),
    );
  }

  function alternarProceso(indice: number, procesoId: string, areaTrabajoCodigo: string | null, activo: boolean): void {
    setPartidas((actual) =>
      actual.map((partida, posicion) => {
        if (posicion !== indice) return partida;
        const procesoIds = activo
          ? [...partida.procesoIds, procesoId]
          : partida.procesoIds.filter((id) => id !== procesoId);
        // Obs. cliente 4b/5: el área del primer proceso configurado se propone sola.
        const area = partida.areaTrabajoCodigo || (activo ? areaTrabajoCodigo ?? '' : '');
        return { ...partida, procesoIds, areaTrabajoCodigo: area };
      }),
    );
  }

  async function crearInterna(): Promise<void> {
    const motivoLimpio = motivo.trim();
    const partidasValidas = partidas.filter((partida) => partida.descripcion.trim() !== '');
    if (
      motivoLimpio.length < 3
      || partidasValidas.length === 0
      || partidasValidas.some((partida) => !(Number(partida.cantidad) > 0))
    ) {
      setError('Indica el motivo (3+) y al menos una partida con descripción y cantidad mayor a cero.');
      return;
    }
    limpiar();
    setOcupado(true);
    try {
      const respuesta = await crearOrdenInternaAccion({
        fechaCompromiso: new Date(fechaCompromiso).toISOString(),
        prioridad,
        descripcion: descripcion.trim() === '' ? undefined : descripcion.trim(),
        motivoAutorizacion: motivoLimpio,
        items: partidasValidas.map((partida) => ({
          codigoItem: partida.codigoPieza.trim() === '' ? undefined : partida.codigoPieza.trim(),
          descripcion: partida.descripcion.trim(),
          cantidad: Number(partida.cantidad),
          unidad: partida.unidad.trim() === '' ? undefined : partida.unidad.trim(),
          materialId: partida.materialId === '' ? undefined : partida.materialId,
          espesorId: partida.espesorId === '' ? undefined : partida.espesorId,
          procesoIds: partida.procesoIds.length > 0 ? partida.procesoIds : undefined,
          tiempoEstimadoMinutos: Number(partida.tiempoMinutos) || 0,
        })),
      });
      if (!respuesta.exito || !respuesta.datos) {
        setError(respuesta.exito ? 'No se recibió la orden' : respuesta.error);
        return;
      }
      setMensaje(`Orden interna ${respuesta.datos.folioSii} creada y autorizada`);
      setAbierto(false);
      setMotivo('');
      setDescripcion('');
      setPartidas([{ ...PARTIDA_VACIA }]);
      router.refresh();
    } catch {
      setError('No se pudo crear la orden interna.');
    } finally {
      setOcupado(false);
    }
  }

  const espesoresPartida = (materialId: string) =>
    (catalogos?.espesores ?? []).filter((espesor) => espesor.materialId === materialId);

  return (
    <div className="flex flex-col gap-3" data-testid="alta-orden-interna">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variante="contorno"
          tamano="sm"
          disabled={ocupado}
          data-testid="abrir-alta-interna"
          onClick={() => {
            limpiar();
            setAbierto(true);
          }}
        >
          Nueva orden interna
        </Button>
        <span className="text-xs text-texto-secundario">
          Trabajo interno (no cobrable) con autorización de Management/Admin.
        </span>
      </div>

      {error && !abierto ? (
        <p role="alert" className="text-sm text-peligro-texto" data-testid="alta-error">
          {error}
        </p>
      ) : null}
      {mensaje ? (
        <p role="status" className="text-sm text-exito-texto" data-testid="alta-mensaje">
          {mensaje}
        </p>
      ) : null}

      <Dialog open={abierto} onOpenChange={(valor) => (!valor ? setAbierto(false) : undefined)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva orden interna</DialogTitle>
            <DialogDescription>
              Trabajo interno sin cliente ni cuenta por cobrar: describe qué se va a hacer y agrega
              las partidas. El motivo queda registrado con tu usuario.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-medium">
              ¿Qué se va a hacer? (opcional)
              <Input
                value={descripcion}
                maxLength={300}
                data-testid="interna-descripcion"
                placeholder="Ej. Mantenimiento de troquel, herramentales, piezas de prueba…"
                onChange={(evento) => setDescripcion(evento.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                Fecha compromiso
                <Input
                  type="datetime-local"
                  value={fechaCompromiso}
                  min={ahoraLocal()}
                  data-testid="interna-fecha"
                  onChange={(evento) => setFechaCompromiso(evento.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Prioridad
                <Select
                  value={prioridad}
                  data-testid="interna-prioridad"
                  onChange={(evento) => setPrioridad(evento.target.value)}
                >
                  <option value="baja">Baja</option>
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </Select>
              </label>
            </div>
            <label className="grid gap-1 text-sm font-medium">
              Motivo de la autorización (3 a 300 caracteres)
              <Textarea
                value={motivo}
                maxLength={300}
                data-testid="interna-motivo"
                onChange={(evento) => setMotivo(evento.target.value)}
              />
            </label>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Partidas</span>
                <Button
                  type="button"
                  variante="contorno"
                  tamano="sm"
                  data-testid="interna-agregar-item"
                  onClick={() => setPartidas((actual) => [...actual, { ...PARTIDA_VACIA }])}
                >
                  Agregar partida
                </Button>
              </div>
              {catalogos === null ? (
                <p className="text-xs text-advertencia-texto">
                  No se pudieron cargar los catálogos; puedes crear la orden sin material, espesor ni
                  proceso.
                </p>
              ) : null}
              {partidas.map((partida, indice) => (
                <fieldset
                  key={indice}
                  className="grid gap-2 rounded-md border border-borde p-2"
                  data-testid={`interna-item-${indice}`}
                >
                  <legend className="px-1 text-xs font-semibold">Partida {indice + 1}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      placeholder="Código de pieza (opcional)"
                      value={partida.codigoPieza}
                      data-testid={`interna-item-codigo-${indice}`}
                      onChange={(evento) => cambiarPartida(indice, { codigoPieza: evento.target.value })}
                    />
                    <Input
                      placeholder="Descripción"
                      value={partida.descripcion}
                      data-testid={`interna-item-descripcion-${indice}`}
                      onChange={(evento) => cambiarPartida(indice, { descripcion: evento.target.value })}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-4">
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Cantidad"
                      value={partida.cantidad}
                      data-testid={`interna-item-cantidad-${indice}`}
                      onChange={(evento) => cambiarPartida(indice, { cantidad: evento.target.value })}
                    />
                    <Input
                      placeholder="Unidad"
                      value={partida.unidad}
                      data-testid={`interna-item-unidad-${indice}`}
                      onChange={(evento) => cambiarPartida(indice, { unidad: evento.target.value })}
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Tiempo estimado (min)"
                      value={partida.tiempoMinutos}
                      data-testid={`interna-item-tiempo-${indice}`}
                      onChange={(evento) => cambiarPartida(indice, { tiempoMinutos: evento.target.value })}
                    />
                    <Select
                      value={partida.areaTrabajoCodigo}
                      data-testid={`interna-item-area-${indice}`}
                      aria-label={`Área de la partida ${indice + 1}`}
                      onChange={(evento) => cambiarPartida(indice, { areaTrabajoCodigo: evento.target.value })}
                    >
                      <option value="">Área por definir</option>
                      {areas.map((area) => (
                        <option key={area.codigo} value={area.codigo}>
                          {area.nombre}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs text-texto-secundario">
                      Material
                      <Select
                        value={partida.materialId}
                        data-testid={`interna-item-material-${indice}`}
                        aria-label={`Material de la partida ${indice + 1}`}
                        onChange={(evento) =>
                          cambiarPartida(indice, { materialId: evento.target.value, espesorId: '' })
                        }
                      >
                        <option value="">Sin material</option>
                        {(catalogos?.materiales ?? []).map((material) => (
                          <option key={material.id} value={material.id}>
                            {material.nombre}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="grid gap-1 text-xs text-texto-secundario">
                      Espesor
                      <Select
                        value={partida.espesorId}
                        data-testid={`interna-item-espesor-${indice}`}
                        aria-label={`Espesor de la partida ${indice + 1}`}
                        disabled={partida.materialId === ''}
                        onChange={(evento) => cambiarPartida(indice, { espesorId: evento.target.value })}
                      >
                        <option value="">
                          {partida.materialId === '' ? 'Elige material primero' : 'Sin espesor'}
                        </option>
                        {espesoresPartida(partida.materialId).map((espesor) => (
                          <option key={espesor.id} value={espesor.id}>
                            {espesor.etiqueta}
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-xs text-texto-secundario">Procesos</span>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {(catalogos?.procesos ?? []).map((proceso) => (
                        <label key={proceso.id} className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-acento"
                            data-testid={`interna-item-proceso-${indice}-${proceso.codigo}`}
                            checked={partida.procesoIds.includes(proceso.id)}
                            onChange={(evento) =>
                              alternarProceso(
                                indice,
                                proceso.id,
                                proceso.areaTrabajoCodigo ?? null,
                                evento.target.checked,
                              )
                            }
                          />
                          {proceso.nombre}
                        </label>
                      ))}
                    </div>
                  </div>
                  {partidas.length > 1 ? (
                    <Button
                      type="button"
                      variante="fantasma"
                      tamano="sm"
                      className="justify-self-end"
                      data-testid={`interna-quitar-item-${indice}`}
                      onClick={() =>
                        setPartidas((actual) => actual.filter((_, posicion) => posicion !== indice))
                      }
                    >
                      Quitar partida
                    </Button>
                  ) : null}
                </fieldset>
              ))}
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-peligro-texto">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variante="contorno" onClick={() => setAbierto(false)}>
              Volver
            </Button>
            <Button
              type="button"
              data-testid="confirmar-alta-interna"
              disabled={ocupado}
              onClick={() => void crearInterna()}
            >
              {ocupado ? 'Creando…' : 'Crear orden interna'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
