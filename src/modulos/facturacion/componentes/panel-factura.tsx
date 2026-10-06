'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

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
import { actualizarFacturaBorradorAccion } from '@/modulos/facturacion/acciones/actualizar-factura-borrador';
import { cancelarFacturaAccion } from '@/modulos/facturacion/acciones/cancelar-factura';
import { crearFacturaBorradorAccion } from '@/modulos/facturacion/acciones/crear-factura-borrador';
import { emitirFacturaAccion } from '@/modulos/facturacion/acciones/emitir-factura';
import { prepararFacturaEntregaAccion } from '@/modulos/facturacion/acciones/preparar-factura-entrega';
import type { EntregaFacturable, FacturaCola } from '@/modulos/facturacion/servicios/obtener-facturas';
import { ETIQUETA_ESTADO_FACTURA } from '@/modulos/facturacion/utilidades/indice';

export type ModoPanelFactura = 'crear' | 'editar' | 'emitir' | 'cancelar';

export function PanelFactura({
  modo,
  factura,
  entregas,
  entregaInicialId,
  abierto,
  onCerrar,
  onActualizada,
}: {
  modo: ModoPanelFactura;
  factura: FacturaCola | null;
  entregas: EntregaFacturable[];
  entregaInicialId?: string;
  abierto: boolean;
  onCerrar: () => void;
  onActualizada: () => Promise<void> | void;
}) {
  const consultas = useQueryClient();
  const [entregaId, setEntregaId] = useState(entregaInicialId ?? '');
  const [mensaje, setMensaje] = useState<string | null>(null);

  const preparacion = useQuery({
    queryKey: ['facturacion', 'preparacion', entregaId],
    enabled: abierto && modo === 'crear' && entregaId !== '',
    queryFn: async () => {
      const respuesta = await prepararFacturaEntregaAccion({ entregaId });
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'Sin datos de la entrega' : respuesta.error);
      }
      return respuesta.datos;
    },
  });

  async function refrescar(): Promise<void> {
    await consultas.invalidateQueries({ queryKey: ['facturacion'] });
    await onActualizada();
  }

  const titulos: Record<ModoPanelFactura, string> = {
    crear: 'Nueva factura (borrador)',
    editar: 'Editar borrador',
    emitir: 'Emitir factura',
    cancelar: 'Cancelar factura',
  };

  return (
    <Dialog open={abierto} onOpenChange={(siguiente) => (!siguiente ? onCerrar() : undefined)}>
      <DialogContent data-testid="panel-factura">
        <DialogHeader>
          <DialogTitle>{titulos[modo]}</DialogTitle>
          <DialogDescription>
            {modo === 'crear'
              ? 'Se precargan los montos de la cuenta por cobrar; puedes ajustarlos antes de emitir.'
              : modo === 'emitir'
                ? 'Captura el folio fiscal del PAC; al emitir se vincula la cuenta por cobrar de la orden.'
                : modo === 'cancelar'
                  ? 'La cancelación conserva el historial y desvincula la cuenta por cobrar para permitir re-facturar.'
                  : 'Solo los borradores se pueden editar.'}
          </DialogDescription>
        </DialogHeader>

        {mensaje ? (
          <div className="rounded-md border border-exito-texto/40 bg-exito-suave p-3 text-sm" data-testid="factura-mensaje">
            <p className="font-semibold">{mensaje}</p>
          </div>
        ) : null}

        {modo === 'crear' && !mensaje ? (
          <FormularioCrearFactura
            entregas={entregas}
            entregaId={entregaId}
            setEntregaId={setEntregaId}
            preparacion={preparacion.data ?? null}
            cargando={preparacion.isPending}
            errorPreparacion={preparacion.isError ? (preparacion.error as Error).message : null}
            onExito={async (texto) => {
              setMensaje(texto);
              await refrescar();
            }}
            onCerrar={onCerrar}
          />
        ) : null}

        {modo === 'editar' && factura && !mensaje ? (
          <FormularioEditarFactura
            factura={factura}
            onExito={async (texto) => {
              setMensaje(texto);
              await refrescar();
            }}
          />
        ) : null}

        {modo === 'emitir' && factura && !mensaje ? (
          <FormularioEmitirFactura
            factura={factura}
            onExito={async (texto) => {
              setMensaje(texto);
              await refrescar();
            }}
          />
        ) : null}

        {modo === 'cancelar' && factura && !mensaje ? (
          <FormularioCancelarFactura
            factura={factura}
            onExito={async (texto) => {
              setMensaje(texto);
              await refrescar();
            }}
          />
        ) : null}

        <DialogFooter>
          <Button type="button" variante="contorno" onClick={onCerrar} data-testid="cerrar-panel-factura">
            {mensaje ? 'Cerrar' : 'Cancelar'}
          </Button>
          {mensaje && factura ? (
            <Link href={`/entregas/${factura.entregaId}`} className="text-sm text-acento underline self-center">
              Abrir entrega
            </Link>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormularioCrearFactura({
  entregas,
  entregaId,
  setEntregaId,
  preparacion,
  cargando,
  errorPreparacion,
  onExito,
  onCerrar,
}: {
  entregas: EntregaFacturable[];
  entregaId: string;
  setEntregaId: (valor: string) => void;
  preparacion: {
    entrega: { folioSii: string | null; folio: string };
    orden: { folioSii: string | null; folio: string };
    cliente: { nombre: string };
    ar: { subtotal: number | null; iva: number | null; total: number; folioFacturaRemision: string | null } | null;
    facturaActiva: { id: string; estado: string } | null;
  } | null;
  cargando: boolean;
  errorPreparacion: string | null;
  onExito: (texto: string) => Promise<void>;
  onCerrar: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="grid gap-1 text-sm font-medium">
        Entrega a facturar
        <Select
          className="min-h-11"
          data-testid="select-entrega-factura"
          value={entregaId}
          onChange={(evento) => setEntregaId(evento.target.value)}
        >
          <option value="">Selecciona una entrega</option>
          {entregas.map((entrega) => (
            <option key={entrega.entregaId} value={entrega.entregaId}>
              {entrega.folioSii ?? entrega.folio} · {entrega.ordenFolioSii ?? entrega.ordenFolio}
              {entrega.clienteNombre ? ` · ${entrega.clienteNombre}` : ''}
            </option>
          ))}
        </Select>
      </label>

      {cargando ? <p className="text-sm text-texto-secundario">Cargando montos de la cuenta…</p> : null}
      {errorPreparacion ? <p role="alert" className="text-sm text-peligro-texto">{errorPreparacion}</p> : null}
      {preparacion ? (
        <>
          <p className="text-xs text-texto-secundario">
            {preparacion.cliente.nombre} · Orden {preparacion.orden.folioSii ?? preparacion.orden.folio}
            {preparacion.ar?.folioFacturaRemision ? ` · Folio en AR: ${preparacion.ar.folioFacturaRemision}` : ''}
          </p>
          {preparacion.facturaActiva ? (
            <p role="status" className="text-sm text-advertencia-texto">
              Esta entrega ya tiene una factura en estado {ETIQUETA_ESTADO_FACTURA[
                preparacion.facturaActiva.estado as keyof typeof ETIQUETA_ESTADO_FACTURA
              ] ?? preparacion.facturaActiva.estado}; se mostrará sin duplicar.
            </p>
          ) : null}
          <FormularioMontos
            datosIniciales={{
              subtotal: preparacion.ar?.subtotal ?? null,
              iva: preparacion.ar?.iva ?? null,
              total: preparacion.ar?.total ?? null,
              rfcReceptor: '',
            }}
            testidPrefijo="crear"
            etiquetaBoton="Crear borrador"
            onGuardar={async (datos) => {
              const respuesta = await crearFacturaBorradorAccion({ entregaId, ...datos });
              if (!respuesta.exito) return respuesta.error;
              await onExito(
                `Borrador de ${preparacion.entrega.folioSii ?? preparacion.entrega.folio} listo${respuesta.datos?.yaExistia ? ' (ya existía)' : ''}.`,
              );
              return null;
            }}
            onCancelar={onCerrar}
          />
        </>
      ) : null}
    </div>
  );
}

function FormularioMontos({
  datosIniciales,
  testidPrefijo,
  etiquetaBoton,
  onGuardar,
  onCancelar,
}: {
  datosIniciales: {
    subtotal: number | null;
    iva: number | null;
    total: number | null;
    rfcReceptor: string;
  };
  testidPrefijo: string;
  etiquetaBoton: string;
  onGuardar: (datos: {
    subtotal: number | null;
    iva: number | null;
    total: number | null;
    rfcReceptor: string | null;
  }) => Promise<string | null>;
  onCancelar?: () => void;
}) {
  const [subtotal, setSubtotal] = useState(datosIniciales.subtotal === null ? '' : String(datosIniciales.subtotal));
  const [iva, setIva] = useState(datosIniciales.iva === null ? '' : String(datosIniciales.iva));
  const [total, setTotal] = useState(datosIniciales.total === null ? '' : String(datosIniciales.total));
  const [rfc, setRfc] = useState(datosIniciales.rfcReceptor);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const numero = (valor: string): number | null => {
    if (valor.trim() === '') return null;
    const convertido = Number(valor);
    return Number.isFinite(convertido) ? convertido : NaN;
  };

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    const datos = {
      subtotal: numero(subtotal),
      iva: numero(iva),
      total: numero(total),
      rfcReceptor: rfc.trim() === '' ? null : rfc.trim(),
    };
    if ([datos.subtotal, datos.iva, datos.total].some((valor) => Number.isNaN(valor))) {
      setError('Revisa los montos capturados');
      return;
    }
    setOcupado(true);
    setError(null);
    const resultado = await onGuardar(datos);
    setOcupado(false);
    if (resultado) setError(resultado);
  }

  return (
    <form className="grid gap-3" onSubmit={(evento) => void enviar(evento)}>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium">
          Subtotal
          <Input type="number" min="0" step="0.01" className="min-h-11"
            data-testid={`${testidPrefijo}-subtotal`}
            value={subtotal} onChange={(evento) => setSubtotal(evento.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          IVA
          <Input type="number" min="0" step="0.01" className="min-h-11"
            data-testid={`${testidPrefijo}-iva`}
            value={iva} onChange={(evento) => setIva(evento.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Total
          <Input type="number" min="0" step="0.01" className="min-h-11"
            data-testid={`${testidPrefijo}-total`}
            value={total} onChange={(evento) => setTotal(evento.target.value)} />
        </label>
      </div>
      <label className="grid gap-1 text-sm font-medium">
        RFC receptor (opcional)
        <Input className="min-h-11" maxLength={13} data-testid={`${testidPrefijo}-rfc`}
          value={rfc} onChange={(evento) => setRfc(evento.target.value)} />
      </label>
      {error ? <p role="alert" className="text-sm text-peligro-texto" data-testid="factura-error">{error}</p> : null}
      <DialogFooter>
        {onCancelar ? (
          <Button type="button" variante="contorno" onClick={onCancelar}>Volver</Button>
        ) : null}
        <Button type="submit" disabled={ocupado} data-testid={`confirmar-${testidPrefijo}-factura`}>
          {ocupado ? 'Guardando…' : etiquetaBoton}
        </Button>
      </DialogFooter>
    </form>
  );
}

function FormularioEditarFactura({
  factura,
  onExito,
}: {
  factura: FacturaCola;
  onExito: (texto: string) => Promise<void>;
}) {
  return (
    <FormularioMontos
      datosIniciales={{
        subtotal: factura.subtotal,
        iva: factura.iva,
        total: factura.total,
        rfcReceptor: factura.rfcReceptor ?? '',
      }}
      testidPrefijo="editar"
      etiquetaBoton="Guardar borrador"
      onGuardar={async (datos) => {
        const respuesta = await actualizarFacturaBorradorAccion({
          facturaId: factura.id,
          actualizadoEn: factura.actualizadoEn,
          datos,
        });
        if (!respuesta.exito) return respuesta.error;
        await onExito('Borrador actualizado.');
        return null;
      }}
    />
  );
}

function FormularioEmitirFactura({
  factura,
  onExito,
}: {
  factura: FacturaCola;
  onExito: (texto: string) => Promise<void>;
}) {
  const [folioFiscal, setFolioFiscal] = useState('');
  const [rfc, setRfc] = useState(factura.rfcReceptor ?? '');
  const [uuidFiscal, setUuidFiscal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setOcupado(true);
    setError(null);
    const respuesta = await emitirFacturaAccion({
      facturaId: factura.id,
      actualizadoEn: factura.actualizadoEn,
      folioFiscal,
      rfcReceptor: rfc.trim() === '' ? null : rfc.trim(),
      uuidFiscal: uuidFiscal.trim() === '' ? null : uuidFiscal.trim(),
    });
    setOcupado(false);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    await onExito(`Factura ${respuesta.datos?.folioFiscal} emitida y vinculada a la cuenta por cobrar.`);
  }

  return (
    <form className="grid gap-3" onSubmit={(evento) => void enviar(evento)}>
      <label className="grid gap-1 text-sm font-medium">
        Folio fiscal (PAC)
        <Input className="min-h-11" required maxLength={60} data-testid="factura-folio-fiscal"
          value={folioFiscal} onChange={(evento) => setFolioFiscal(evento.target.value)} />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          RFC receptor (opcional)
          <Input className="min-h-11" maxLength={13} data-testid="factura-rfc-receptor"
            value={rfc} onChange={(evento) => setRfc(evento.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          UUID fiscal (opcional)
          <Input className="min-h-11" maxLength={64} data-testid="factura-uuid-fiscal"
            value={uuidFiscal} onChange={(evento) => setUuidFiscal(evento.target.value)} />
        </label>
      </div>
      {error ? <p role="alert" className="text-sm text-peligro-texto" data-testid="factura-error">{error}</p> : null}
      <DialogFooter>
        <Button type="submit" disabled={ocupado || folioFiscal.trim() === ''} data-testid="confirmar-emitir-factura">
          {ocupado ? 'Emitiendo…' : 'Emitir factura'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function FormularioCancelarFactura({
  factura,
  onExito,
}: {
  factura: FacturaCola;
  onExito: (texto: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setOcupado(true);
    setError(null);
    const respuesta = await cancelarFacturaAccion({
      facturaId: factura.id,
      actualizadoEn: factura.actualizadoEn,
      motivo,
    });
    setOcupado(false);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    await onExito(
      factura.estado === 'EMITIDA'
        ? 'Factura cancelada; la cuenta por cobrar quedó desvinculada para re-facturar.'
        : 'Borrador cancelado.',
    );
  }

  return (
    <form className="grid gap-3" onSubmit={(evento) => void enviar(evento)}>
      <label className="grid gap-1 text-sm font-medium">
        Motivo de cancelación (mínimo 3 caracteres)
        <Input className="min-h-11" required minLength={3} maxLength={500} data-testid="factura-motivo"
          value={motivo} onChange={(evento) => setMotivo(evento.target.value)} />
      </label>
      {error ? <p role="alert" className="text-sm text-peligro-texto" data-testid="factura-error">{error}</p> : null}
      <DialogFooter>
        <Button type="submit" disabled={ocupado || motivo.trim().length < 3} data-testid="confirmar-cancelar-factura">
          {ocupado ? 'Cancelando…' : 'Confirmar cancelación'}
        </Button>
      </DialogFooter>
    </form>
  );
}
