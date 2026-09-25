'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
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
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import {
  CONDICIONES_PAGO_ORDEN,
  type CondicionPagoOrden,
} from '@/modulos/ordenes/tipos/ordenes';
import type { OrdenHistoricaCreada } from '@/modulos/ordenes/servicios/ordenes-servicio';

export type ClienteOpcion = { id: string; nombre: string };
export type AreaOpcion = { codigo: string; nombre: string };

const ETIQUETA_CONDICION: Record<CondicionPagoOrden, string> = {
  contado: 'Contado',
  '15_dias': '15 días',
  '30_dias': '30 días',
  credito: 'Crédito',
};

const CLASE_INPUT =
  'w-full rounded-base border border-borde-fuerte bg-superficie px-2 py-1.5 text-sm text-foreground outline-none focus:border-primario focus:ring-2 focus:ring-primario/30';
const CLASE_ETIQUETA = 'text-xs font-medium text-texto-secundario';

type PartidaFormulario = {
  codigoPieza: string;
  descripcion: string;
  cantidadSolicitada: string;
  unidadMedida: string;
  tiempoEstimadoMinutos: string;
  areaTrabajoCodigo: string;
  procesos: string;
  maquinaAsignada: string;
};

function partidaVacia(): PartidaFormulario {
  return {
    codigoPieza: '',
    descripcion: '',
    cantidadSolicitada: '1',
    unidadMedida: 'pza',
    tiempoEstimadoMinutos: '0',
    areaTrabajoCodigo: '',
    procesos: '',
    maquinaAsignada: '',
  };
}

function aFechaIso(fecha: string): string {
  const instante = new Date(`${fecha}T00:00:00`);
  return Number.isNaN(instante.getTime()) ? '' : instante.toISOString();
}

function aPartida(partida: PartidaFormulario) {
  const descripcion = partida.descripcion.trim();
  const maquina = partida.maquinaAsignada.trim();
  const procesos = partida.procesos
    .split(',')
    .map((proceso) => proceso.trim())
    .filter((proceso) => proceso !== '');
  return {
    codigoPieza: partida.codigoPieza.trim(),
    cantidadSolicitada: Number(partida.cantidadSolicitada),
    unidadMedida: partida.unidadMedida.trim(),
    tiempoEstimadoMinutos: Number(partida.tiempoEstimadoMinutos) || 0,
    ...(descripcion === '' ? {} : { descripcion }),
    ...(partida.areaTrabajoCodigo === '' ? {} : { areaTrabajoCodigo: partida.areaTrabajoCodigo }),
    ...(procesos.length === 0 ? {} : { procesos }),
    ...(maquina === '' ? {} : { maquinaAsignada: maquina }),
  };
}

type Props = {
  clientes: ClienteOpcion[];
  areas: AreaOpcion[];
  alCrear: (entrada: unknown) => Promise<RespuestaAccion<OrdenHistoricaCreada>>;
  onCerrar: () => void;
  onCreada: (orden: OrdenHistoricaCreada) => void;
};

/**
 * ORD-06: alta administrativa del trabajo heredado. La orden entra en Bandeja
 * con folio OP nuevo y AR no cobrable; el diálogo solo captura datos.
 */
export function CrearOrdenHeredadaDialog({ clientes, areas, alCrear, onCerrar, onCreada }: Props) {
  const router = useRouter();
  const [clienteId, setClienteId] = useState('');
  const [idHistorico, setIdHistorico] = useState('');
  const [fechaTrabajo, setFechaTrabajo] = useState('');
  const [fechaCompromiso, setFechaCompromiso] = useState('');
  const [condicionPago, setCondicionPago] = useState<CondicionPagoOrden>('contado');
  const [referenciaExterna, setReferenciaExterna] = useState('');
  const [montoSinIva, setMontoSinIva] = useState('');
  const [montoIva, setMontoIva] = useState('');
  const [horasEstimadas, setHorasEstimadas] = useState('0');
  const [notas, setNotas] = useState('');
  const [partidas, setPartidas] = useState<PartidaFormulario[]>(() => [partidaVacia()]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function actualizarPartida(indice: number, campo: keyof PartidaFormulario, valor: string): void {
    setPartidas((previas) => previas.map((partida, i) => (
      i === indice ? { ...partida, [campo]: valor } : partida
    )));
  }

  function validar(): string | null {
    if (clienteId === '') return 'Selecciona un cliente.';
    if (idHistorico.trim() === '') return 'Indica el ID previo.';
    if (idHistorico.trim().length > 40) return 'El ID previo admite máximo 40 caracteres.';
    if (fechaTrabajo === '') return 'Indica la fecha del trabajo.';
    if (fechaCompromiso === '') return 'Indica la fecha de compromiso.';
    const sinIva = Number(montoSinIva);
    const iva = Number(montoIva);
    if (!Number.isFinite(sinIva) || sinIva < 0 || !Number.isFinite(iva) || iva < 0) {
      return 'Los montos deben ser números no negativos.';
    }
    if (sinIva + iva <= 0) return 'El monto sin IVA más el IVA debe ser mayor a cero.';
    const horas = Number(horasEstimadas);
    if (!Number.isFinite(horas) || horas < 0) return 'Las horas no pueden ser negativas.';
    for (const [indice, partida] of partidas.entries()) {
      if (partida.codigoPieza.trim() === '') return `La partida ${indice + 1} requiere código.`;
      if (partida.unidadMedida.trim() === '') return `La partida ${indice + 1} requiere unidad.`;
      const cantidad = Number(partida.cantidadSolicitada);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        return `La cantidad de la partida ${indice + 1} debe ser mayor a 0.`;
      }
    }
    return null;
  }

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    const problema = validar();
    if (problema !== null) {
      setError(problema);
      return;
    }
    setEnviando(true);
    try {
      const respuesta = await alCrear({
        clienteId,
        idHistorico: idHistorico.trim(),
        fechaTrabajo,
        fechaCompromiso: aFechaIso(fechaCompromiso),
        condicionPago,
        ...(referenciaExterna.trim() === '' ? {} : { referenciaExterna: referenciaExterna.trim() }),
        montoSinIva: Number(montoSinIva),
        montoIva: Number(montoIva),
        horasEstimadas: Number(horasEstimadas),
        ...(notas.trim() === '' ? {} : { notas: notas.trim() }),
        partidas: partidas.map(aPartida),
      });
      if (respuesta.exito && respuesta.datos) {
        router.refresh();
        onCreada(respuesta.datos);
      } else {
        setError(respuesta.exito ? 'No se pudo crear la orden heredada' : respuesta.error);
      }
    } catch {
      setError('No se pudo crear la orden heredada. Intenta de nuevo.');
    }
    setEnviando(false);
  }

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto && !enviando) onCerrar(); }}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nueva orden heredada</DialogTitle>
          <DialogDescription>
            Captura un trabajo del sistema anterior. Entra en Bandeja con folio OP nuevo y una
            cuenta por cobrar no cobrable hasta la entrega; no consume folio de cotización.
          </DialogDescription>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1" onSubmit={enviar} noValidate>
          <section className="grid gap-3 sm:grid-cols-3">
            <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
              Cliente
              <Select
                className={CLASE_INPUT}
                data-testid="historica-cliente"
                value={clienteId}
                onChange={(evento) => setClienteId(evento.target.value)}
              >
                <option value="">Selecciona un cliente</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>
                ))}
              </Select>
            </label>
            <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
              ID previo
              <Input
                className={CLASE_INPUT}
                data-testid="historica-id"
                maxLength={40}
                value={idHistorico}
                onChange={(evento) => setIdHistorico(evento.target.value)}
              />
            </label>
            <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
              Condición de pago
              <Select
                className={CLASE_INPUT}
                value={condicionPago}
                onChange={(evento) => setCondicionPago(evento.target.value as CondicionPagoOrden)}
              >
                {CONDICIONES_PAGO_ORDEN.map((condicion) => (
                  <option key={condicion} value={condicion}>{ETIQUETA_CONDICION[condicion]}</option>
                ))}
              </Select>
            </label>
            <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
              Fecha del trabajo
              <Input
                className={CLASE_INPUT}
                data-testid="historica-fecha-trabajo"
                type="date"
                value={fechaTrabajo}
                onChange={(evento) => setFechaTrabajo(evento.target.value)}
              />
            </label>
            <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
              Fecha compromiso
              <Input
                className={CLASE_INPUT}
                data-testid="historica-fecha-compromiso"
                type="date"
                value={fechaCompromiso}
                onChange={(evento) => setFechaCompromiso(evento.target.value)}
              />
            </label>
            <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
              Referencia externa (opcional)
              <Input
                className={CLASE_INPUT}
                maxLength={120}
                value={referenciaExterna}
                onChange={(evento) => setReferenciaExterna(evento.target.value)}
              />
            </label>
            <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
              Monto sin IVA (MXN)
              <Input
                className={CLASE_INPUT}
                data-testid="historica-subtotal"
                type="number"
                min="0"
                step="any"
                value={montoSinIva}
                onChange={(evento) => setMontoSinIva(evento.target.value)}
              />
            </label>
            <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
              IVA (MXN)
              <Input
                className={CLASE_INPUT}
                data-testid="historica-iva"
                type="number"
                min="0"
                step="any"
                value={montoIva}
                onChange={(evento) => setMontoIva(evento.target.value)}
              />
            </label>
            <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
              Horas estimadas
              <Input
                className={CLASE_INPUT}
                type="number"
                min="0"
                step="any"
                value={horasEstimadas}
                onChange={(evento) => setHorasEstimadas(evento.target.value)}
              />
            </label>
          </section>

          <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
            Notas
            <Textarea
              className={CLASE_INPUT}
              maxLength={2000}
              rows={2}
              value={notas}
              onChange={(evento) => setNotas(evento.target.value)}
            />
          </label>

          {partidas.map((partida, indice) => (
            <fieldset key={indice} className="flex flex-col gap-2 rounded-base border border-borde p-3">
              <legend className="px-1 text-sm font-semibold">Partida {indice + 1}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
                  Código de pieza
                  <Input
                    className={CLASE_INPUT}
                    data-testid={`historica-partida-codigo-${indice}`}
                    value={partida.codigoPieza}
                    onChange={(evento) => actualizarPartida(indice, 'codigoPieza', evento.target.value)}
                  />
                </label>
                <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
                  Descripción (opcional)
                  <Input
                    className={CLASE_INPUT}
                    value={partida.descripcion}
                    onChange={(evento) => actualizarPartida(indice, 'descripcion', evento.target.value)}
                  />
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
                  Cantidad
                  <Input
                    className={CLASE_INPUT}
                    data-testid={`historica-partida-cantidad-${indice}`}
                    type="number"
                    min="0"
                    step="any"
                    value={partida.cantidadSolicitada}
                    onChange={(evento) => actualizarPartida(indice, 'cantidadSolicitada', evento.target.value)}
                  />
                </label>
                <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
                  Unidad
                  <Input
                    className={CLASE_INPUT}
                    value={partida.unidadMedida}
                    onChange={(evento) => actualizarPartida(indice, 'unidadMedida', evento.target.value)}
                  />
                </label>
                <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
                  Tiempo estimado (min)
                  <Input
                    className={CLASE_INPUT}
                    type="number"
                    min="0"
                    step="any"
                    value={partida.tiempoEstimadoMinutos}
                    onChange={(evento) => actualizarPartida(indice, 'tiempoEstimadoMinutos', evento.target.value)}
                  />
                </label>
                <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
                  Área
                  <Select
                    className={CLASE_INPUT}
                    data-testid={`historica-partida-area-${indice}`}
                    value={partida.areaTrabajoCodigo}
                    onChange={(evento) => actualizarPartida(indice, 'areaTrabajoCodigo', evento.target.value)}
                  >
                    <option value="">Por definir</option>
                    {areas.map((area) => (
                      <option key={area.codigo} value={area.codigo}>{area.nombre}</option>
                    ))}
                  </Select>
                </label>
                <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
                  Máquina (opcional)
                  <Input
                    className={CLASE_INPUT}
                    value={partida.maquinaAsignada}
                    onChange={(evento) => actualizarPartida(indice, 'maquinaAsignada', evento.target.value)}
                  />
                </label>
              </div>
              <label className={`${CLASE_ETIQUETA} flex flex-col gap-1`}>
                Procesos separados por coma (opcional)
                <Input
                  className={CLASE_INPUT}
                  data-testid={`historica-partida-procesos-${indice}`}
                  placeholder="Corte, Doblado, Pulido"
                  value={partida.procesos}
                  onChange={(evento) => actualizarPartida(indice, 'procesos', evento.target.value)}
                />
              </label>
              <Button
                type="button"
                variante="contorno"
                tamano="sm"
                className="self-end"
                disabled={partidas.length <= 1}
                onClick={() => setPartidas((previas) => previas.filter((_, i) => i !== indice))}
              >
                Quitar partida {indice + 1}
              </Button>
            </fieldset>
          ))}
          <Button
            type="button"
            variante="contorno"
            tamano="sm"
            className="self-start"
            onClick={() => setPartidas((previas) => [...previas, partidaVacia()])}
          >
            Agregar partida
          </Button>

          {error ? <p role="alert" className="text-sm text-peligro-texto">{error}</p> : null}

          <DialogFooter className="static mt-1 shrink-0">
            <Button type="button" variante="contorno" disabled={enviando} onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" data-testid="historica-crear" disabled={enviando}>
              {enviando ? 'Creando orden…' : 'Crear orden heredada'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
