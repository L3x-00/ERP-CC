'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';

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
import {
  prepararEntregaAccion,
  type PreparacionEntrega,
} from '@/modulos/entregas/acciones/preparar-entrega';
import {
  registrarEntregaAccion,
  type ResultadoRegistrarEntrega,
} from '@/modulos/entregas/acciones/registrar-entrega';

const CLAVE_PREPARACION = ['entregas', 'preparacion'] as const;

/**
 * SII-B7.3: captura de una entrega parcial/total desde la cola de Logística.
 * Agrupa por ITxx y captura cantidades por partida; la evidencia y la firma se
 * adjuntan después, en el detalle de la nota.
 */
export function PanelPrepararEntrega({
  ordenId,
  abierto,
  onCerrar,
  onRegistrada,
}: {
  ordenId: string | null;
  abierto: boolean;
  onCerrar: () => void;
  onRegistrada?: () => void;
}) {
  const consultas = useQueryClient();
  const preparacion = useQuery<PreparacionEntrega>({
    queryKey: [...CLAVE_PREPARACION, ordenId],
    enabled: abierto && ordenId !== null,
    queryFn: async () => {
      const respuesta = await prepararEntregaAccion({ ordenId });
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'Sin datos de la orden' : respuesta.error);
      }
      return respuesta.datos;
    },
  });

  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [recibidoPor, setRecibidoPor] = useState('');
  const [contactoId, setContactoId] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<ResultadoRegistrarEntrega | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const solicitudId = useRef<string | null>(null);

  const datos = preparacion.data ?? null;
  const error = errorAccion ?? (preparacion.isError ? (preparacion.error as Error).message : null);

  const partidasDisponibles = useMemo(
    () =>
      (datos?.partidas ?? []).filter(
        (partida) => Math.max(partida.cantidadProducida - partida.cantidadEntregada, 0) > 0,
      ),
    [datos],
  );

  const grupos = useMemo(() => {
    const mapa = new Map<string, { codigo: string; descripcion: string; partidas: typeof partidasDisponibles }>();
    for (const partida of partidasDisponibles) {
      const codigo = partida.codigoItem?.trim() || partida.codigoPieza;
      const grupo = mapa.get(codigo);
      if (grupo) {
        grupo.partidas.push(partida);
      } else {
        mapa.set(codigo, {
          codigo,
          descripcion: partida.descripcion ?? '',
          partidas: [partida],
        });
      }
    }
    return [...mapa.values()];
  }, [partidasDisponibles]);

  const totalCapturado = useMemo(
    () =>
      partidasDisponibles.reduce((suma, partida) => {
        const valor = Number(cantidades[partida.id] ?? 0);
        return suma + (Number.isFinite(valor) && valor > 0 ? valor : 0);
      }, 0),
    [cantidades, partidasDisponibles],
  );

  function entregarTodo(): void {
    const siguiente: Record<string, string> = {};
    for (const partida of partidasDisponibles) {
      siguiente[partida.id] = String(Math.max(partida.cantidadProducida - partida.cantidadEntregada, 0));
    }
    setCantidades(siguiente);
  }

  async function registrar(): Promise<void> {
    if (!datos) return;
    const renglones = partidasDisponibles.flatMap((partida) => {
      const cantidad = Number(cantidades[partida.id] ?? 0);
      return Number.isFinite(cantidad) && cantidad > 0
        ? [{ partidaId: partida.id, cantidadEntregada: cantidad }]
        : [];
    });
    if (renglones.length === 0) {
      setErrorAccion('Captura al menos una cantidad a entregar');
      return;
    }
    if (recibidoPor.trim().length < 3) {
      setErrorAccion('Indica quién recibe (mínimo 3 caracteres)');
      return;
    }
    setOcupado(true);
    setErrorAccion(null);
    if (!solicitudId.current) solicitudId.current = crypto.randomUUID();
    const respuesta = await registrarEntregaAccion({
      ordenId: datos.orden.id,
      renglones,
      recibidoPor: recibidoPor.trim(),
      contactoId: contactoId ? contactoId : null,
      solicitudId: solicitudId.current,
    });
    setOcupado(false);
    if (respuesta.exito && respuesta.datos) {
      setResultado(respuesta.datos);
      solicitudId.current = null;
      setCantidades({});
      await consultas.invalidateQueries({ queryKey: CLAVE_PREPARACION });
      onRegistrada?.();
    } else if (!respuesta.exito) {
      setErrorAccion(respuesta.error);
    }
  }

  const folioOrden = datos?.orden.folioSii ?? datos?.orden.folio ?? '';

  return (
    <Dialog open={abierto} onOpenChange={(siguiente) => (!siguiente ? onCerrar() : undefined)}>
      <DialogContent data-testid="panel-preparar-entrega">
        <DialogHeader>
          <DialogTitle>Preparar entrega {folioOrden}</DialogTitle>
          <DialogDescription>
            Captura cantidades por ítem (ITxx). No se entrega más de lo producido ni de lo pendiente.
          </DialogDescription>
        </DialogHeader>

        {preparacion.isPending ? <p className="text-sm text-texto-secundario">Cargando pendientes…</p> : null}
        {error ? <p role="alert" className="text-sm text-peligro-texto" data-testid="entrega-error">{error}</p> : null}

        {resultado ? (
          <div className="rounded-md border border-exito-texto/40 bg-exito-suave p-3 text-sm" data-testid="entrega-mensaje">
            <p className="font-semibold">
              Nota {resultado.folioSii ?? resultado.folio} registrada{resultado.yaExistia ? ' (ya existía)' : ''}.
            </p>
            <Link
              href={`/entregas/${resultado.notaId}`}
              className="mt-1 inline-block text-acento underline"
              data-testid="abrir-nota-entrega"
            >
              Abrir nota para evidencia y firma
            </Link>
          </div>
        ) : null}

        {datos && !resultado ? (
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
            <p className="text-sm text-texto-secundario">
              {datos.orden.clienteRazonSocial ?? 'Cliente sin nombre'} · {datos.orden.estadoSii}
            </p>

            {partidasDisponibles.length === 0 ? (
              <p className="text-sm text-texto-secundario">No hay cantidades producidas pendientes de entrega.</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Cantidades a entregar</p>
                  <Button type="button" variante="contorno" tamano="sm" data-testid="entrega-todo" onClick={entregarTodo}>
                    Entregar todo lo disponible
                  </Button>
                </div>
                {grupos.map((grupo) => (
                  <fieldset key={grupo.codigo} className="rounded-md border border-borde p-3">
                    <legend className="px-1 text-sm font-semibold">{grupo.codigo}</legend>
                    {grupo.descripcion ? (
                      <p className="mb-2 text-xs text-texto-secundario">{grupo.descripcion}</p>
                    ) : null}
                    <div className="grid gap-2">
                      {grupo.partidas.map((partida, indice) => {
                        const disponible = Math.max(partida.cantidadProducida - partida.cantidadEntregada, 0);
                        return (
                          <label key={partida.id} className="grid grid-cols-[1fr_7rem] items-center gap-2 text-sm">
                            <span>
                              {partida.codigoPieza}{' '}
                              <span className="text-texto-secundario">({disponible} disponibles)</span>
                            </span>
                            <Input
                              type="number"
                              min="0"
                              max={disponible}
                              step="0.001"
                              className="min-h-11"
                              aria-label={`Cantidad a entregar ${partida.codigoPieza}`}
                              data-testid={`entrega-cantidad-${indice}`}
                              value={cantidades[partida.id] ?? ''}
                              onChange={(evento) =>
                                setCantidades((actuales) => ({ ...actuales, [partida.id]: evento.target.value }))
                              }
                            />
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                Recibido por
                <Input
                  className="min-h-11"
                  minLength={3}
                  required
                  data-testid="recibido-por-entrega"
                  value={recibidoPor}
                  onChange={(evento) => setRecibidoPor(evento.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Contacto del cliente (opcional)
                <Select
                  className="min-h-11"
                  data-testid="contacto-entrega"
                  value={contactoId}
                  onChange={(evento) => setContactoId(evento.target.value)}
                >
                  <option value="">Sin contacto registrado</option>
                  {datos.contactos.map((contacto) => (
                    <option key={contacto.id} value={contacto.id}>
                      {contacto.nombre}{contacto.esPrincipal ? ' (principal)' : ''}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <p className="text-xs text-texto-secundario">
              Recuerda adjuntar evidencia fotográfica y firma (digital o escaneada) en el detalle de la nota.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variante="contorno" onClick={onCerrar} data-testid="cerrar-panel-preparar">
            {resultado ? 'Cerrar' : 'Cancelar'}
          </Button>
          {datos && !resultado ? (
            <Button
              type="button"
              data-testid="confirmar-registrar-entrega"
              disabled={ocupado || preparacion.isPending || totalCapturado <= 0 || recibidoPor.trim().length < 3}
              onClick={() => void registrar()}
            >
              {ocupado ? 'Registrando…' : 'Registrar entrega'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
