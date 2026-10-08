'use client';

import { useMemo, useState, type FormEvent } from 'react';

import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import {
  Tabla,
  TablaCelda,
  TablaContenedor,
  TablaCuerpo,
  TablaEncabezado,
  TablaEncabezadoCelda,
  TablaFila,
} from '@/compartido/componentes/diseno/tabla';
import { formatearNumero } from '@/compartido/utilidades/formatear';
import type { Rfq, RfqItem } from '@/modulos/rfq/tipos/indice';

import { cancelarItemRfqAccion } from '../acciones/cancelar-item-rfq';
import { guardarItemRfqAccion } from '../acciones/guardar-item-rfq';
import type { CatalogosRfq } from '../acciones/obtener-catalogos';

type BorradorItem = {
  descripcion: string;
  cantidad: string;
  materialId: string;
  espesorId: string;
  acabado: string;
  notas: string;
  procesoIds: string[];
};

function borradorVacio(): BorradorItem {
  return {
    descripcion: '',
    cantidad: '1',
    materialId: '',
    espesorId: '',
    acabado: '',
    notas: '',
    procesoIds: [],
  };
}

function borradorDeItem(item: RfqItem): BorradorItem {
  return {
    descripcion: item.descripcion,
    cantidad: String(item.cantidad),
    materialId: item.materialId ?? '',
    espesorId: item.espesorId ?? '',
    acabado: item.acabado ?? '',
    notas: item.notas ?? '',
    procesoIds: item.operaciones.map((operacion) => operacion.procesoId),
  };
}

/**
 * Pestaña Ítems: listado ITxx (nunca se reutiliza el número) con alta/edición
 * contra las RPC del módulo y cancelación lógica (rechazada si hay archivos).
 * En READY/terminal la edición se bloquea (igual que el servidor).
 */
export function TablaItemsRfq({
  rfq,
  catalogos,
  onCambio,
}: {
  rfq: Rfq;
  catalogos: CatalogosRfq | null;
  onCambio: () => void;
}) {
  const [borrador, setBorrador] = useState<BorradorItem | null>(null);
  const [itemEditando, setItemEditando] = useState<RfqItem | null>(null);
  const [itemCancelar, setItemCancelar] = useState<RfqItem | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const editable =
    rfq.estadoRfq === 'NEW' ||
    rfq.estadoRfq === 'INCOMPLETE' ||
    rfq.estadoRfq === 'WAITING_CUSTOMER' ||
    rfq.estadoRfq === 'WAITING_TECHNICAL';

  const nombreMaterial = useMemo(
    () => new Map((catalogos?.materiales ?? []).map((m) => [m.id, m.nombre])),
    [catalogos],
  );
  const nombreEspesor = useMemo(
    () => new Map((catalogos?.espesores ?? []).map((e) => [e.id, e.etiqueta])),
    [catalogos],
  );
  const nombreProceso = useMemo(
    () => new Map((catalogos?.procesos ?? []).map((p) => [p.id, p.nombre])),
    [catalogos],
  );

  const espesoresDelMaterial = (catalogos?.espesores ?? []).filter(
    (espesor) => espesor.materialId === (borrador?.materialId ?? ''),
  );

  function abrirNuevo(): void {
    setItemEditando(null);
    setMensaje(null);
    setBorrador(borradorVacio());
  }

  function abrirEdicion(item: RfqItem): void {
    setItemEditando(item);
    setMensaje(null);
    setBorrador(borradorDeItem(item));
  }

  function alternarProceso(procesoId: string): void {
    setBorrador((previo) =>
      previo
        ? {
            ...previo,
            procesoIds: previo.procesoIds.includes(procesoId)
              ? previo.procesoIds.filter((id) => id !== procesoId)
              : [...previo.procesoIds, procesoId],
          }
        : previo,
    );
  }

  async function guardarItem(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!borrador) return;
    setEnviando(true);
    setMensaje(null);

    const respuesta = await guardarItemRfqAccion({
      ...(itemEditando
        ? { itemId: itemEditando.id, actualizadoEn: itemEditando.actualizadoEn }
        : { rfqId: rfq.id }),
      datos: {
        descripcion: borrador.descripcion,
        cantidad: Number(borrador.cantidad),
        materialId: borrador.materialId || null,
        espesorId: borrador.espesorId || null,
        acabado: borrador.acabado.trim() || null,
        notas: borrador.notas.trim() || null,
        procesoIds: borrador.procesoIds,
      },
    });
    setEnviando(false);

    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    setBorrador(null);
    setItemEditando(null);
    onCambio();
  }

  async function confirmarCancelacion(): Promise<void> {
    if (!itemCancelar) return;
    setEnviando(true);
    setMensaje(null);
    const respuesta = await cancelarItemRfqAccion({
      itemId: itemCancelar.id,
      ...(motivoCancelar.trim() ? { motivo: motivoCancelar.trim() } : {}),
    });
    setEnviando(false);

    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    setItemCancelar(null);
    setMotivoCancelar('');
    onCambio();
  }

  return (
    <div className="flex flex-col gap-3" data-testid="tabla-items-rfq">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-texto-secundario">
          {rfq.items.length} ítem(s) · el código ITxx nunca se reutiliza
        </p>
        <Button type="button" tamano="sm" onClick={abrirNuevo} disabled={!editable || !catalogos}>
          Agregar ítem
        </Button>
      </div>

      {!editable && (
        <p className="rounded-md bg-superficie-2 px-3 py-2 text-sm text-texto-secundario">
          El RFQ no admite cambios de ítems en su estado actual.
        </p>
      )}

      {mensaje !== null && (
        <p role="alert" className="text-sm text-peligro-texto">
          {mensaje}
        </p>
      )}

      {rfq.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-borde px-4 py-6 text-center text-sm text-texto-secundario">
          Sin ítems capturados.
        </p>
      ) : (
        <TablaContenedor>
          <Tabla>
            <TablaEncabezado>
              <tr>
                <TablaEncabezadoCelda>Código</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Descripción</TablaEncabezadoCelda>
                <TablaEncabezadoCelda className="text-right">Cantidad</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Material / espesor</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Operaciones</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Estado</TablaEncabezadoCelda>
                <TablaEncabezadoCelda className="text-right">Acciones</TablaEncabezadoCelda>
              </tr>
            </TablaEncabezado>
            <TablaCuerpo>
              {rfq.items.map((item) => (
                <TablaFila key={item.id}>
                  <TablaCelda className="font-mono text-xs">{item.codigo}</TablaCelda>
                  <TablaCelda>
                    <span className="font-medium">{item.descripcion}</span>
                    {item.acabado && (
                      <span className="block text-xs text-texto-secundario">Acabado: {item.acabado}</span>
                    )}
                  </TablaCelda>
                  <TablaCelda className="text-right tabular-nums">
                    {formatearNumero(item.cantidad, 2)}
                  </TablaCelda>
                  <TablaCelda className="text-texto-secundario">
                    {item.materialId ? (nombreMaterial.get(item.materialId) ?? 'Material') : '—'}
                    {item.espesorId ? ` · ${nombreEspesor.get(item.espesorId) ?? ''}` : ''}
                  </TablaCelda>
                  <TablaCelda className="text-texto-secundario">
                    {item.operaciones.length > 0
                      ? item.operaciones
                          .map((operacion) => nombreProceso.get(operacion.procesoId) ?? 'Proceso')
                          .join(', ')
                      : '—'}
                  </TablaCelda>
                  <TablaCelda>
                    {item.estado === 'cancelado' ? (
                      <span className="rounded-full bg-superficie-2 px-2.5 py-0.5 text-xs text-texto-secundario">
                        Cancelado
                      </span>
                    ) : (
                      <span className="rounded-full bg-exito-suave px-2.5 py-0.5 text-xs text-exito-texto">
                        Activo
                      </span>
                    )}
                  </TablaCelda>
                  <TablaCelda className="text-right">
                    {item.estado === 'activo' && editable ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variante="contorno"
                          tamano="sm"
                          onClick={() => abrirEdicion(item)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variante="destructivo"
                          tamano="sm"
                          onClick={() => {
                            setMensaje(null);
                            setItemCancelar(item);
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-texto-tenue">—</span>
                    )}
                  </TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        </TablaContenedor>
      )}

      <Dialog open={borrador !== null} onOpenChange={(valor) => !valor && setBorrador(null)}>
        <DialogContent aria-label={itemEditando ? `Editar ${itemEditando.codigo}` : 'Nuevo ítem'}>
          <DialogHeader>
            <DialogTitle>{itemEditando ? `Editar ${itemEditando.codigo}` : 'Nuevo ítem'}</DialogTitle>
            <DialogDescription>
              Material/espesor y operaciones salen de los catálogos configurables.
            </DialogDescription>
          </DialogHeader>
          {borrador && (
            <form onSubmit={guardarItem} className="flex flex-col gap-3" noValidate>
              <label className="grid gap-1 text-sm font-medium" htmlFor="item-descripcion">
                Descripción
                <Input
                  id="item-descripcion"
                  value={borrador.descripcion}
                  onChange={(evento) =>
                    setBorrador({ ...borrador, descripcion: evento.target.value })
                  }
                  maxLength={300}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium" htmlFor="item-cantidad">
                Cantidad
                <Input
                  id="item-cantidad"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={borrador.cantidad}
                  onChange={(evento) => setBorrador({ ...borrador, cantidad: evento.target.value })}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium" htmlFor="item-material">
                Material
                <Select
                  id="item-material"
                  value={borrador.materialId}
                  onChange={(evento) =>
                    setBorrador({ ...borrador, materialId: evento.target.value, espesorId: '' })
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
              <div className="grid gap-1 text-sm">
                <label className="font-medium" htmlFor="item-espesor">
                  Espesor
                </label>
                <Select
                  id="item-espesor"
                  value={borrador.espesorId}
                  disabled={!borrador.materialId || espesoresDelMaterial.length === 0}
                  aria-describedby={
                    !borrador.materialId || espesoresDelMaterial.length === 0
                      ? 'item-espesor-ayuda'
                      : undefined
                  }
                  onChange={(evento) =>
                    setBorrador({ ...borrador, espesorId: evento.target.value })
                  }
                >
                  <option value="">
                    {!borrador.materialId
                      ? 'Selecciona un material primero'
                      : espesoresDelMaterial.length === 0
                        ? 'Sin espesores configurados'
                        : 'Selecciona un espesor'}
                  </option>
                  {espesoresDelMaterial.map((espesor) => (
                    <option key={espesor.id} value={espesor.id}>
                      {espesor.etiqueta}
                    </option>
                  ))}
                </Select>
                {(!borrador.materialId || espesoresDelMaterial.length === 0) && (
                  <span id="item-espesor-ayuda" className="text-xs text-texto-secundario">
                    {borrador.materialId
                      ? 'Este material no tiene espesores configurados.'
                      : 'Selecciona un material para ver sus espesores.'}
                  </span>
                )}
              </div>
              <fieldset className="grid gap-1 rounded-md border border-borde p-2">
                <legend className="px-1 text-sm font-medium">Operaciones solicitadas</legend>
                <div className="flex flex-wrap gap-2">
                  {(catalogos?.procesos ?? []).map((proceso) => (
                    <label
                      key={proceso.id}
                      className="flex items-center gap-1.5 text-sm"
                      htmlFor={`item-proceso-${proceso.codigo}`}
                    >
                      <input
                        id={`item-proceso-${proceso.codigo}`}
                        type="checkbox"
                        checked={borrador.procesoIds.includes(proceso.id)}
                        onChange={() => alternarProceso(proceso.id)}
                      />
                      {proceso.nombre}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="grid gap-1 text-sm font-medium" htmlFor="item-acabado">
                Acabado (opcional)
                <Input
                  id="item-acabado"
                  value={borrador.acabado}
                  onChange={(evento) => setBorrador({ ...borrador, acabado: evento.target.value })}
                  maxLength={120}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium" htmlFor="item-notas">
                Notas (opcional)
                <Textarea
                  id="item-notas"
                  value={borrador.notas}
                  onChange={(evento) => setBorrador({ ...borrador, notas: evento.target.value })}
                  rows={2}
                  maxLength={2000}
                />
              </label>

              {mensaje !== null && (
                <p role="alert" className="text-sm text-peligro-texto">
                  {mensaje}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button variante="contorno" tamano="sm" onClick={() => setBorrador(null)}>
                  Cerrar
                </Button>
                <Button type="submit" tamano="sm" disabled={enviando}>
                  {enviando ? 'Guardando…' : 'Guardar ítem'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={itemCancelar !== null} onOpenChange={(valor) => !valor && setItemCancelar(null)}>
        <DialogContent aria-label="Cancelar ítem">
          <DialogHeader>
            <DialogTitle>Cancelar {itemCancelar?.codigo}</DialogTitle>
            <DialogDescription>
              El número no se reutiliza; un ítem con documentos vinculados no puede cancelarse.
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1 text-sm font-medium" htmlFor="item-motivo-cancelar">
            Motivo (opcional)
            <Input
              id="item-motivo-cancelar"
              value={motivoCancelar}
              onChange={(evento) => setMotivoCancelar(evento.target.value)}
              maxLength={300}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variante="contorno" tamano="sm" onClick={() => setItemCancelar(null)}>
              Volver
            </Button>
            <Button variante="destructivo" tamano="sm" disabled={enviando} onClick={() => void confirmarCancelacion()}>
              Confirmar cancelación
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
