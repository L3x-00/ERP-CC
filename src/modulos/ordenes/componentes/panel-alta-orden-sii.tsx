'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { crearOrdenDesdeRevisionAccion } from '@/modulos/ordenes/acciones/crear-orden-desde-revision';
import { crearOrdenInternaAccion } from '@/modulos/ordenes/acciones/crear-orden-interna';
import {
  obtenerRevisionesAceptadasAccion,
  type RevisionAceptada,
} from '@/modulos/ordenes/acciones/obtener-revisiones-aceptadas';

const CLAVE_REVISIONES = ['ordenes', 'revisiones-aceptadas'] as const;

type ItemInterno = {
  descripcion: string;
  cantidad: string;
  material: string;
  espesor: string;
  procesos: string;
  horas: string;
};

const ITEM_VACIO: ItemInterno = { descripcion: '', cantidad: '1', material: '', espesor: '', procesos: '', horas: '0' };

function ahoraLocal(): string {
  const ahora = new Date();
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function PanelAltaOrdenSii({ clientes }: { clientes: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const consultas = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [desdeRevision, setDesdeRevision] = useState(false);
  const [revisionId, setRevisionId] = useState('');

  const [interna, setInterna] = useState(false);
  const [clienteId, setClienteId] = useState(clientes[0]?.id ?? '');
  const [fechaCompromiso, setFechaCompromiso] = useState(ahoraLocal());
  const [prioridad, setPrioridad] = useState('normal');
  const [motivo, setMotivo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [items, setItems] = useState<ItemInterno[]>([{ ...ITEM_VACIO }]);

  const revisiones = useQuery({
    queryKey: CLAVE_REVISIONES,
    queryFn: async (): Promise<RevisionAceptada[]> => {
      const respuesta = await obtenerRevisionesAceptadasAccion();
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'Sin revisiones' : respuesta.error);
      }
      return respuesta.datos;
    },
    enabled: desdeRevision,
    staleTime: 10_000,
  });

  function limpiar(): void {
    setError(null);
    setMensaje(null);
  }

  async function crearDesdeRevision(): Promise<void> {
    if (revisionId === '') {
      setError('Selecciona la revisión aceptada.');
      return;
    }
    limpiar();
    setOcupado(true);
    try {
      const respuesta = await crearOrdenDesdeRevisionAccion({ revisionId });
      if (!respuesta.exito || !respuesta.datos) {
        setError(respuesta.exito ? 'No se recibió la orden' : respuesta.error);
        return;
      }
      const datos = respuesta.datos;
      setMensaje(
        datos.yaExistia
          ? `La revisión ya tenía la orden ${datos.folioSii}`
          : `Orden ${datos.folioSii} creada desde la revisión`,
      );
      setDesdeRevision(false);
      setRevisionId('');
      await consultas.invalidateQueries({ queryKey: CLAVE_REVISIONES });
      router.refresh();
    } catch {
      setError('No se pudo crear la orden desde la revisión.');
    } finally {
      setOcupado(false);
    }
  }

  async function crearInterna(): Promise<void> {
    const motivoLimpio = motivo.trim();
    const itemsValidos = items.filter((item) => item.descripcion.trim() !== '');
    if (clienteId === '' || motivoLimpio.length < 3 || itemsValidos.length === 0) {
      setError('Indica cliente, motivo (3+) y al menos un ítem con descripción.');
      return;
    }
    limpiar();
    setOcupado(true);
    try {
      const respuesta = await crearOrdenInternaAccion({
        clienteId,
        fechaCompromiso: new Date(fechaCompromiso).toISOString(),
        prioridad,
        descripcion: descripcion.trim() === '' ? undefined : descripcion.trim(),
        motivoAutorizacion: motivoLimpio,
        items: itemsValidos.map((item) => ({
          descripcion: item.descripcion.trim(),
          cantidad: Number(item.cantidad),
          material: item.material.trim() === '' ? undefined : item.material.trim(),
          espesor: item.espesor.trim() === '' ? undefined : item.espesor.trim(),
          procesos: item.procesos.split(',').map((proceso) => proceso.trim()).filter((proceso) => proceso !== ''),
          tiempoEstimadoMinutos: Number(item.horas) * 60,
        })),
      });
      if (!respuesta.exito || !respuesta.datos) {
        setError(respuesta.exito ? 'No se recibió la orden' : respuesta.error);
        return;
      }
      setMensaje(`Orden interna ${respuesta.datos.folioSii} creada y autorizada`);
      setInterna(false);
      setMotivo('');
      setDescripcion('');
      setItems([{ ...ITEM_VACIO }]);
      router.refresh();
    } catch {
      setError('No se pudo crear la orden interna.');
    } finally {
      setOcupado(false);
    }
  }

  function cambiarItem(indice: number, campo: keyof ItemInterno, valor: string): void {
    setItems((actual) => actual.map((item, posicion) => (
      posicion === indice ? { ...item, [campo]: valor } : item
    )));
  }

  return (
    <div className="flex flex-col gap-3" data-testid="alta-orden-sii">
      <div className="flex flex-wrap items-center gap-2">
        <Button variante="secundario" tamano="sm" disabled={ocupado}
          data-testid="abrir-alta-desde-revision"
          onClick={() => { limpiar(); setDesdeRevision(true); }}>
          Crear desde revisión aceptada
        </Button>
        <Button variante="contorno" tamano="sm" disabled={ocupado || clientes.length === 0}
          data-testid="abrir-alta-interna"
          onClick={() => { limpiar(); setInterna(true); }}>
          Nueva orden interna (TI)
        </Button>
        <span className="text-xs text-texto-secundario">
          La orden comercial nace de la revisión aceptada; la TI exige autorización de Management/Admin.
        </span>
      </div>

      {error && !desdeRevision && !interna ? (
        <p role="alert" className="text-sm text-peligro-texto" data-testid="alta-error">{error}</p>
      ) : null}
      {mensaje ? (
        <p role="status" className="text-sm text-exito-texto" data-testid="alta-mensaje">{mensaje}</p>
      ) : null}

      <Dialog open={desdeRevision} onOpenChange={(abierto) => (!abierto ? setDesdeRevision(false) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear orden desde revisión aceptada</DialogTitle>
            <DialogDescription>
              Solo se ofrecen revisiones ACCEPTED/SALE_CONFIRMED sin orden. La RPC revalida la
              aceptación, el cliente y el crédito.
            </DialogDescription>
          </DialogHeader>
          {revisiones.isPending ? <p className="text-sm text-texto-secundario">Cargando revisiones…</p> : null}
          {revisiones.isError ? (
            <p role="alert" className="text-sm text-peligro-texto">No se pudieron cargar las revisiones.</p>
          ) : null}
          {revisiones.data && revisiones.data.length === 0 ? (
            <p className="text-sm text-texto-secundario">No hay revisiones aceptadas pendientes de orden.</p>
          ) : null}
          {revisiones.data && revisiones.data.length > 0 ? (
            <label className="grid gap-1 text-sm font-medium">
              Revisión aceptada
              <Select value={revisionId} data-testid="seleccion-revision"
                onChange={(evento) => setRevisionId(evento.target.value)}>
                <option value="">Selecciona…</option>
                {revisiones.data.map((revision) => (
                  <option key={revision.revisionId} value={revision.revisionId}>
                    {revision.folioRevision} · {revision.clienteNombre}
                    {revision.folioRfq ? ` · ${revision.folioRfq}` : ''}
                    {revision.esInterna ? ' · TI' : ''}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          {error ? <p role="alert" className="text-sm text-peligro-texto">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variante="contorno" onClick={() => setDesdeRevision(false)}>Volver</Button>
            <Button type="button" data-testid="confirmar-alta-desde-revision"
              disabled={ocupado || revisionId === ''}
              onClick={() => void crearDesdeRevision()}>
              {ocupado ? 'Creando…' : 'Crear orden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={interna} onOpenChange={(abierto) => (!abierto ? setInterna(false) : undefined)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva orden interna (TI)</DialogTitle>
            <DialogDescription>
              Alta directa autorizada, sin propuesta comercial y sin cuenta por cobrar. El motivo
              queda registrado con tu usuario.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Cliente (trabajo interno)
              <Select value={clienteId} data-testid="interna-cliente"
                onChange={(evento) => setClienteId(evento.target.value)}>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>
                ))}
              </Select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                Fecha compromiso
                <Input type="datetime-local" value={fechaCompromiso} min={ahoraLocal()}
                  data-testid="interna-fecha"
                  onChange={(evento) => setFechaCompromiso(evento.target.value)} />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Prioridad
                <Select value={prioridad} data-testid="interna-prioridad"
                  onChange={(evento) => setPrioridad(evento.target.value)}>
                  <option value="baja">Baja</option>
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </Select>
              </label>
            </div>
            <label className="grid gap-1 text-sm font-medium">
              Descripción general
              <Input value={descripcion} maxLength={300} data-testid="interna-descripcion"
                onChange={(evento) => setDescripcion(evento.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Motivo de la autorización (3 a 300 caracteres)
              <Textarea value={motivo} maxLength={300} data-testid="interna-motivo"
                onChange={(evento) => setMotivo(evento.target.value)} />
            </label>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Ítems</span>
                <Button type="button" variante="contorno" tamano="sm"
                  data-testid="interna-agregar-item"
                  onClick={() => setItems((actual) => [...actual, { ...ITEM_VACIO }])}>
                  Agregar ítem
                </Button>
              </div>
              {items.map((item, indice) => (
                <div key={indice} className="grid gap-2 rounded-md border border-borde p-2 sm:grid-cols-6"
                  data-testid={`interna-item-${indice}`}>
                  <Input placeholder="Descripción" value={item.descripcion} className="sm:col-span-2"
                    data-testid={`interna-item-descripcion-${indice}`}
                    onChange={(evento) => cambiarItem(indice, 'descripcion', evento.target.value)} />
                  <Input type="number" min="0.01" step="0.01" placeholder="Cantidad" value={item.cantidad}
                    data-testid={`interna-item-cantidad-${indice}`}
                    onChange={(evento) => cambiarItem(indice, 'cantidad', evento.target.value)} />
                  <Input placeholder="Material" value={item.material}
                    onChange={(evento) => cambiarItem(indice, 'material', evento.target.value)} />
                  <Input placeholder="Espesor" value={item.espesor}
                    onChange={(evento) => cambiarItem(indice, 'espesor', evento.target.value)} />
                  <Input placeholder="Procesos (coma)" value={item.procesos}
                    onChange={(evento) => cambiarItem(indice, 'procesos', evento.target.value)} />
                  {items.length > 1 ? (
                    <Button type="button" variante="fantasma" tamano="sm" className="sm:col-span-6 sm:justify-self-end"
                      onClick={() => setItems((actual) => actual.filter((_, posicion) => posicion !== indice))}>
                      Quitar ítem
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          {error ? <p role="alert" className="text-sm text-peligro-texto">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variante="contorno" onClick={() => setInterna(false)}>Volver</Button>
            <Button type="button" data-testid="confirmar-alta-interna" disabled={ocupado}
              onClick={() => void crearInterna()}>
              {ocupado ? 'Creando…' : 'Crear orden interna'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
