'use client';

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
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { usarTipoCambioVigente } from '@/modulos/configuracion/hooks/usar-tipo-cambio-vigente';
import { actualizarCompraAccion } from '@/modulos/compras/acciones/actualizar-compra';
import { cambiarEstadoCompraAccion } from '@/modulos/compras/acciones/cambiar-estado-compra';
import { crearCompraAccion } from '@/modulos/compras/acciones/crear-compra';
import {
  pagarCompraAccion,
  type ResultadoPagarCompra,
} from '@/modulos/compras/acciones/pagar-compra';
import {
  AvisoNivelCosto,
  CamposCostoCompra,
  ClasificarRubroCompra,
  type ValoresCostoCompra,
} from '@/modulos/compras/componentes/campos-costo-compra';
import type {
  CompraCola,
  MaterialOpcion,
  OrdenOpcion,
  ProveedorOpcion,
  RubroCostoCompra,
  UltimoCostoMaterial,
} from '@/modulos/compras/tipos/indice';

export type ModoPanelCompra = 'crear' | 'editar' | 'estado' | 'cancelar' | 'pagar';

/** SII-B8 F4: alta/edición, confirmación, recepción, pago y cancelación de compras. */
export function PanelCompra({
  modo,
  compra,
  proveedores,
  ordenes,
  materiales,
  ultimosCostos,
  abierto,
  onCerrar,
  onActualizada,
}: {
  modo: ModoPanelCompra;
  compra: CompraCola | null;
  proveedores: ProveedorOpcion[];
  ordenes: OrdenOpcion[];
  materiales: MaterialOpcion[];
  ultimosCostos: Record<string, UltimoCostoMaterial>;
  abierto: boolean;
  onCerrar: () => void;
  onActualizada: () => Promise<void> | void;
}) {
  const [mensaje, setMensaje] = useState<string | null>(null);

  const titulos: Record<ModoPanelCompra, string> = {
    crear: 'Nueva compra',
    editar: `Editar ${compra?.folioSii ?? ''}`,
    estado: `Cambiar estado ${compra?.folioSii ?? ''}`,
    cancelar: `Cancelar ${compra?.folioSii ?? ''}`,
    pagar: `Pagar ${compra?.folioSii ?? ''}`,
  };

  async function completar(texto: string): Promise<void> {
    setMensaje(texto);
    await onActualizada();
  }

  return (
    <Dialog open={abierto} onOpenChange={(siguiente) => (!siguiente ? onCerrar() : undefined)}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto" data-testid="panel-compra">
        <DialogHeader>
          <DialogTitle>{titulos[modo]}</DialogTitle>
          <DialogDescription>
            {modo === 'pagar'
              ? 'El pago se registra en la moneda de la compra y reduce el saldo; al saldarse queda PAGADA.'
              : 'Folio CG-MMYY_#### de la serie compartida compras/gastos. Con Orden, la compra se clasifica por rubro de costo; sin Orden es gasto indirecto.'}
          </DialogDescription>
        </DialogHeader>

        {compra ? <AvisoNivelCosto compra={compra} /> : null}

        {mensaje ? (
          <div className="rounded-md border border-exito-texto/40 bg-exito-suave p-3 text-sm" data-testid="compra-mensaje">
            <p className="font-semibold">{mensaje}</p>
          </div>
        ) : null}

        {!mensaje && modo !== 'editar' && compra && compra.ordenId && compra.rubroCosto === null
          && compra.estado !== 'CANCELADA' ? (
            <ClasificarRubroCompra compra={compra} onExito={(texto) => void completar(texto)} />
          ) : null}

        {(modo === 'crear' || modo === 'editar') && !mensaje ? (
          <FormularioCompra
            compra={modo === 'editar' ? compra : null}
            proveedores={proveedores}
            ordenes={ordenes}
            materiales={materiales}
            ultimosCostos={ultimosCostos}
            onExito={(texto) => void completar(texto)}
          />
        ) : null}

        {modo === 'estado' && compra && !mensaje ? (
          <FormularioEstado compra={compra} onExito={(texto) => void completar(texto)} />
        ) : null}

        {modo === 'cancelar' && compra && !mensaje ? (
          <FormularioCancelar compra={compra} onExito={(texto) => void completar(texto)} />
        ) : null}

        {modo === 'pagar' && compra && !mensaje ? (
          <FormularioPago compra={compra} onExito={(texto) => void completar(texto)} />
        ) : null}

        <DialogFooter>
          <Button type="button" variante="contorno" onClick={onCerrar} data-testid="cerrar-panel-compra">
            {mensaje ? 'Cerrar' : 'Cancelar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormularioCompra({
  compra,
  proveedores,
  ordenes,
  materiales,
  ultimosCostos,
  onExito,
}: {
  compra: CompraCola | null;
  proveedores: ProveedorOpcion[];
  ordenes: OrdenOpcion[];
  materiales: MaterialOpcion[];
  ultimosCostos: Record<string, UltimoCostoMaterial>;
  onExito: (texto: string) => void;
}) {
  const [proveedorId, setProveedorId] = useState(compra?.proveedorId ?? '');
  const [ordenId, setOrdenId] = useState(compra?.ordenId ?? '');
  const [subtotal, setSubtotal] = useState(compra ? String(compra.montoSubtotal) : '');
  const [iva, setIva] = useState(compra ? String(compra.montoIva) : '0');
  const [moneda, setMoneda] = useState<'MXN' | 'USD'>(compra?.moneda === 'USD' ? 'USD' : 'MXN');
  const [tipoCambio, setTipoCambio] = useState(compra ? String(compra.tipoCambio) : '1');
  // ACC-06: al capturar en USD se propone el TC vigente; el usuario puede corregirlo.
  const tipoCambioVigente = usarTipoCambioVigente();
  const [vencimiento, setVencimiento] = useState(compra?.fechaVencimiento?.slice(0, 10) ?? '');
  const [notas, setNotas] = useState(compra?.notas ?? '');
  const [costo, setCosto] = useState<ValoresCostoCompra>({
    rubroCosto: (compra?.rubroCosto ?? '') as RubroCostoCompra | '',
    concepto: compra?.concepto ?? '',
    materialId: compra?.materialId ?? '',
    cantidad: compra?.cantidad != null ? String(compra.cantidad) : '',
    unidad: compra?.unidad ?? '',
    costoUnitario: compra?.costoUnitario != null ? String(compra.costoUnitario) : '',
  });
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function cambiarCosto(parcial: Partial<ValoresCostoCompra>): void {
    const siguiente = { ...costo, ...parcial };
    setCosto(siguiente);
    // C10.1/F08: el subtotal se deriva cuando hay cantidad y costo unitario.
    if (siguiente.cantidad.trim() !== '' && siguiente.costoUnitario.trim() !== '') {
      const cantidad = Number(siguiente.cantidad);
      const costoUnitario = Number(siguiente.costoUnitario);
      if (Number.isFinite(cantidad) && Number.isFinite(costoUnitario)
        && cantidad > 0 && costoUnitario >= 0) {
        setSubtotal(String(Math.round(cantidad * costoUnitario * 10_000) / 10_000));
      }
    }
  }

  function aplicarMoneda(valor: 'MXN' | 'USD'): void {
    setMoneda(valor);
    setTipoCambio(
      valor === 'MXN'
        ? '1'
        : tipoCambioVigente !== null
          ? String(tipoCambioVigente)
          : '',
    );
  }

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setOcupado(true);
    setError(null);
    const datos = {
      proveedorId,
      ordenId: ordenId === '' ? null : ordenId,
      montoSubtotal: Number(subtotal),
      montoIva: Number(iva),
      moneda,
      tipoCambio: Number(tipoCambio),
      fechaVencimiento: vencimiento === '' ? null : vencimiento,
      notas: notas.trim() === '' ? null : notas.trim(),
      rubroCosto: costo.rubroCosto === '' ? null : costo.rubroCosto,
      concepto: costo.concepto.trim() === '' ? null : costo.concepto.trim(),
      materialId: costo.materialId === '' ? null : costo.materialId,
      cantidad: costo.cantidad.trim() === '' ? null : Number(costo.cantidad),
      unidad: costo.unidad.trim() === '' ? null : costo.unidad.trim(),
      costoUnitario: costo.costoUnitario.trim() === '' ? null : Number(costo.costoUnitario),
    };
    if (compra) {
      const respuesta = await actualizarCompraAccion({
        compraId: compra.id,
        actualizadoEn: compra.actualizadoEn,
        datos,
      });
      setOcupado(false);
      if (!respuesta.exito) {
        setError(respuesta.error);
        return;
      }
      onExito('Compra actualizada.');
      return;
    }
    const respuesta = await crearCompraAccion(datos);
    setOcupado(false);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    onExito(`Compra ${respuesta.datos?.folioSii} creada en borrador.`);
  }

  return (
    <form className="grid gap-3" onSubmit={(evento) => void enviar(evento)}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          Proveedor
          <Select className="min-h-11" required data-testid="compra-proveedor"
            value={proveedorId} onChange={(evento) => setProveedorId(evento.target.value)}>
            <option value="">Selecciona un proveedor</option>
            {proveedores.map((proveedor) => (
              <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Orden (opcional)
          <Select className="min-h-11" data-testid="compra-orden"
            value={ordenId} onChange={(evento) => setOrdenId(evento.target.value)}>
            <option value="">Sin orden vinculada</option>
            {ordenes.map((orden) => (
              <option key={orden.id} value={orden.id}>{orden.folioSii ?? orden.folio}</option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Subtotal
          <Input type="number" min="0" step="0.01" required className="min-h-11"
            data-testid="compra-subtotal" value={subtotal} onChange={(evento) => setSubtotal(evento.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          IVA
          <Input type="number" min="0" step="0.01" required className="min-h-11"
            data-testid="compra-iva" value={iva} onChange={(evento) => setIva(evento.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Moneda
          <Select className="min-h-11" data-testid="compra-moneda"
            value={moneda} onChange={(evento) => aplicarMoneda(evento.target.value as 'MXN' | 'USD')}>
            <option value="MXN">MXN</option>
            <option value="USD">USD</option>
          </Select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Tipo de cambio
          <Input type="number" min="0" step="0.0001" className="min-h-11" disabled={moneda === 'MXN'}
            data-testid="compra-tipo-cambio" value={tipoCambio} onChange={(evento) => setTipoCambio(evento.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Vencimiento (opcional)
          <Input type="date" className="min-h-11" data-testid="compra-vencimiento"
            value={vencimiento} onChange={(evento) => setVencimiento(evento.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Notas (opcional)
          <Input className="min-h-11" data-testid="compra-notas"
            value={notas} onChange={(evento) => setNotas(evento.target.value)} />
        </label>
        <CamposCostoCompra
          valores={costo}
          materiales={materiales}
          ultimosCostos={ultimosCostos}
          onCambiar={cambiarCosto}
        />
      </div>
      {error ? <p role="alert" className="text-sm text-peligro-texto" data-testid="compra-error">{error}</p> : null}
      <DialogFooter>
        <Button type="submit" disabled={ocupado || proveedorId === '' || (ordenId !== '' && costo.rubroCosto === '')}
          data-testid={compra ? 'confirmar-editar-compra' : 'confirmar-crear-compra'}>
          {ocupado ? 'Guardando…' : compra ? 'Guardar cambios' : 'Crear compra'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function FormularioEstado({ compra, onExito }: { compra: CompraCola; onExito: (texto: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const destino = compra.estado === 'BORRADOR' ? 'CONFIRMADA' : 'RECIBIDA';

  async function enviar(): Promise<void> {
    setOcupado(true);
    setError(null);
    const respuesta = await cambiarEstadoCompraAccion({
      compraId: compra.id,
      actualizadoEn: compra.actualizadoEn,
      estado: destino,
    });
    setOcupado(false);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    onExito(destino === 'CONFIRMADA' ? 'Compra confirmada (CxP pendiente).' : 'Compra marcada como recibida.');
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm">
        {destino === 'CONFIRMADA'
          ? 'Al confirmar, la compra queda como cuenta por pagar pendiente.'
          : 'Marca la mercancía como recibida; el saldo sigue pendiente hasta pagarse.'}
      </p>
      {error ? <p role="alert" className="text-sm text-peligro-texto" data-testid="compra-error">{error}</p> : null}
      <DialogFooter>
        <Button type="button" disabled={ocupado}
          data-testid={destino === 'CONFIRMADA' ? 'confirmar-confirmar-compra' : 'confirmar-recibir-compra'}
          onClick={() => void enviar()}>
          {ocupado ? 'Guardando…' : destino === 'CONFIRMADA' ? 'Confirmar compra' : 'Marcar recibida'}
        </Button>
      </DialogFooter>
    </div>
  );
}

function FormularioCancelar({ compra, onExito }: { compra: CompraCola; onExito: (texto: string) => void }) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setOcupado(true);
    setError(null);
    const respuesta = await cambiarEstadoCompraAccion({
      compraId: compra.id,
      actualizadoEn: compra.actualizadoEn,
      estado: 'CANCELADA',
      motivo,
    });
    setOcupado(false);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    onExito('Compra cancelada.');
  }

  return (
    <form className="grid gap-3" onSubmit={(evento) => void enviar(evento)}>
      <label className="grid gap-1 text-sm font-medium">
        Motivo de cancelación (mínimo 3 caracteres)
        <Input className="min-h-11" required minLength={3} maxLength={300} data-testid="compra-motivo"
          value={motivo} onChange={(evento) => setMotivo(evento.target.value)} />
      </label>
      {error ? <p role="alert" className="text-sm text-peligro-texto" data-testid="compra-error">{error}</p> : null}
      <DialogFooter>
        <Button type="submit" variante="destructivo" disabled={ocupado || motivo.trim().length < 3}
          data-testid="confirmar-cancelar-compra">
          {ocupado ? 'Cancelando…' : 'Confirmar cancelación'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function FormularioPago({ compra, onExito }: { compra: CompraCola; onExito: (texto: string) => void }) {
  const [monto, setMonto] = useState(String(compra.saldoPendiente));
  const [metodo, setMetodo] = useState<'transferencia' | 'efectivo' | 'cheque' | 'tarjeta'>('transferencia');
  const [referencia, setReferencia] = useState('');
  const [resultado, setResultado] = useState<ResultadoPagarCompra | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setOcupado(true);
    setError(null);
    const respuesta = await pagarCompraAccion({
      compraId: compra.id,
      monto: Number(monto),
      metodoPago: metodo,
      referencia: referencia.trim() === '' ? null : referencia.trim(),
    });
    setOcupado(false);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    setResultado(respuesta.datos ?? null);
    onExito(
      `Pago registrado; saldo ${formatearMoneda(respuesta.datos?.saldoPendiente ?? 0, compra.moneda as 'MXN' | 'USD')}${respuesta.datos?.estado === 'PAGADA' ? ' · compra PAGADA' : ''}.`,
    );
  }

  return (
    <form className="grid gap-3" onSubmit={(evento) => void enviar(evento)}>
      <p className="text-sm text-texto-secundario">
        Saldo pendiente: {formatearMoneda(compra.saldoPendiente, compra.moneda as 'MXN' | 'USD')}
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium">
          Monto
          <Input type="number" min="0" step="0.01" required className="min-h-11" data-testid="pago-monto"
            value={monto} onChange={(evento) => setMonto(evento.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Método
          <Select className="min-h-11" data-testid="pago-metodo"
            value={metodo} onChange={(evento) => setMetodo(evento.target.value as typeof metodo)}>
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="cheque">Cheque</option>
            <option value="tarjeta">Tarjeta</option>
          </Select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Referencia (opcional)
          <Input className="min-h-11" data-testid="pago-referencia"
            value={referencia} onChange={(evento) => setReferencia(evento.target.value)} />
        </label>
      </div>
      {error ? <p role="alert" className="text-sm text-peligro-texto" data-testid="compra-error">{error}</p> : null}
      {resultado ? (
        <p className="text-xs text-texto-secundario">Pago {resultado.pagoId.slice(0, 8)} · estado {resultado.estado}</p>
      ) : null}
      <DialogFooter>
        <Button type="submit" disabled={ocupado || !(Number(monto) > 0)} data-testid="confirmar-pago-compra">
          {ocupado ? 'Registrando…' : 'Registrar pago'}
        </Button>
      </DialogFooter>
    </form>
  );
}
