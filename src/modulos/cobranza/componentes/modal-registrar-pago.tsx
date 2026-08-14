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
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import type { CuentaCartera } from '@/modulos/cobranza/servicios/cobranza-servicio';

export interface DatosPagoFormulario {
  arId: string;
  montoPagado: number;
  monedaPago: 'USD' | 'MXN';
  tipoCambioPago: number;
  metodoPago: 'transferencia' | 'efectivo' | 'cheque' | 'tarjeta';
  referenciaBancaria?: string;
  notas?: string;
  solicitudId: string;
}

export interface DatosSaldoFormulario {
  clienteId: string;
  arId: string;
  montoAAplicar: number;
  solicitudId: string;
}

export interface ModalRegistrarPagoProps {
  cuenta: CuentaCartera | null;
  abierto: boolean;
  procesando: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onRegistrarPago: (datos: DatosPagoFormulario) => Promise<{ exito: boolean; error?: string }>;
  onAplicarSaldo: (datos: DatosSaldoFormulario) => Promise<{ exito: boolean; error?: string }>;
}

export function ModalRegistrarPago({
  cuenta,
  abierto,
  procesando,
  onAbiertoChange,
  onRegistrarPago,
  onAplicarSaldo,
}: ModalRegistrarPagoProps) {
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<'USD' | 'MXN'>('MXN');
  const [tipoCambio, setTipoCambio] = useState('1');
  const [metodo, setMetodo] = useState<DatosPagoFormulario['metodoPago']>('transferencia');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [solicitudId, setSolicitudId] = useState<string | null>(null);
  const [estado, setEstado] = useState<string | null>(null);

  if (!cuenta) return null;

  function obtenerSolicitudId(): string {
    if (solicitudId) return solicitudId;
    const nueva = crypto.randomUUID();
    setSolicitudId(nueva);
    return nueva;
  }

  function cerrar(): void {
    setEstado(null);
    setSolicitudId(null);
    onAbiertoChange(false);
  }

  async function registrarPago(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!cuenta) return;
    setEstado(null);
    const respuesta = await onRegistrarPago({
      arId: cuenta.id,
      montoPagado: Number(monto),
      monedaPago: moneda,
      tipoCambioPago: Number(tipoCambio),
      metodoPago: metodo,
      referenciaBancaria: referencia || undefined,
      notas: notas || undefined,
      solicitudId: obtenerSolicitudId(),
    });
    if (respuesta.exito) {
      cerrar();
    } else {
      setEstado(respuesta.error ?? 'No se pudo registrar el pago');
    }
  }

  async function aplicarSaldo(): Promise<void> {
    if (!cuenta) return;
    setEstado(null);
    const respuesta = await onAplicarSaldo({
      clienteId: cuenta.clienteId,
      arId: cuenta.id,
      montoAAplicar: Number(monto),
      solicitudId: obtenerSolicitudId(),
    });
    if (respuesta.exito) {
      cerrar();
    } else {
      setEstado(respuesta.error ?? 'No se pudo aplicar el saldo a favor');
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(siguiente) => {
      if (siguiente) onAbiertoChange(true); else cerrar();
    }}>
      <DialogContent aria-describedby="descripcion-registro-pago">
        <DialogHeader>
          <DialogTitle>Registrar cobro · {cuenta.folioOrden}</DialogTitle>
          <DialogDescription id="descripcion-registro-pago">
            Saldo: {new Intl.NumberFormat('es-MX', { style: 'currency', currency: cuenta.moneda }).format(cuenta.saldoPendiente)} · Monedero disponible: MXN {cuenta.saldoAFavorMxn.toFixed(2)}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={registrarPago}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1"><Label htmlFor="monto-pago">Monto</Label><Input id="monto-pago" type="number" min="0.0001" step="0.0001" value={monto} onChange={(evento) => setMonto(evento.target.value)} required /></div>
            <div className="grid gap-1"><Label htmlFor="moneda-pago">Moneda de pago</Label><Select id="moneda-pago" value={moneda} onChange={(evento) => setMoneda(evento.target.value as 'USD' | 'MXN')}><option value="MXN">MXN</option><option value="USD">USD</option></Select></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1"><Label htmlFor="tipo-cambio-pago">Tipo de cambio (MXN)</Label><Input id="tipo-cambio-pago" type="number" min="0.0001" step="0.0001" value={tipoCambio} onChange={(evento) => setTipoCambio(evento.target.value)} required /></div>
            <div className="grid gap-1"><Label htmlFor="metodo-pago">Método</Label><Select id="metodo-pago" value={metodo} onChange={(evento) => setMetodo(evento.target.value as DatosPagoFormulario['metodoPago'])}><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="cheque">Cheque</option><option value="tarjeta">Tarjeta</option></Select></div>
          </div>
          <div className="grid gap-1"><Label htmlFor="referencia-pago">Referencia bancaria</Label><Input id="referencia-pago" value={referencia} onChange={(evento) => setReferencia(evento.target.value)} /></div>
          <div className="grid gap-1"><Label htmlFor="notas-pago">Notas</Label><Textarea id="notas-pago" value={notas} onChange={(evento) => setNotas(evento.target.value)} /></div>
          {estado ? <p role="alert" className="text-sm text-red-700">{estado}</p> : null}
          <DialogFooter>
            <Button variante="contorno" type="button" onClick={cerrar} disabled={procesando}>Cancelar</Button>
            <Button
              variante="secundario"
              type="button"
              disabled={procesando || !monto || cuenta.saldoAFavorMxn <= 0}
              onClick={() => void aplicarSaldo()}
            >
              Aplicar saldo a favor
            </Button>
            <Button type="submit" disabled={procesando}>{procesando ? 'Registrando…' : 'Registrar pago'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
