'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/compartido/componentes/ui/dialog';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import type { CuentaCartera } from '@/modulos/cobranza/servicios/cobranza-servicio';

export interface DatosFacturaAr {
  arId: string;
  actualizadoEnEsperado: string;
  folioFactura: string;
  fechaVencimiento: string | null;
}

type Resultado = { exito: true } | { exito: false; error: string };

export function ModalRegistrarFactura({
  cuenta, abierto, onAbiertoChange, onGuardar,
}: {
  cuenta: CuentaCartera | null;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onGuardar: (datos: DatosFacturaAr, abrirAbono: boolean) => Promise<Resultado>;
}) {
  const [folio, setFolio] = useState(cuenta?.folioFacturaRemision ?? '');
  const [vencimiento, setVencimiento] = useState(cuenta?.fechaVencimiento?.slice(0, 10) ?? '');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!cuenta) return null;
  const cobrable = cuenta.cobrableDesde !== null;

  async function guardar(abrirAbono: boolean): Promise<void> {
    if (!cuenta) return;
    setError(null);
    if (!folio.trim() || (cobrable && !vencimiento)) {
      setError('Indica el folio fiscal y, si la cuenta ya es cobrable, el vencimiento.');
      return;
    }
    setProcesando(true);
    try {
      const resultado = await onGuardar({
        arId: cuenta.id,
        actualizadoEnEsperado: cuenta.actualizadoEn,
        folioFactura: folio.trim(),
        fechaVencimiento: cobrable ? `${vencimiento}T12:00:00.000Z` : null,
      }, abrirAbono);
      if (!resultado.exito) setError(resultado.error);
    } catch {
      setError('No se pudo comunicar el registro de la factura. Actualiza la cartera antes de reintentar.');
    } finally {
      setProcesando(false);
    }
  }

  function enviar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    void guardar(false);
  }

  return <Dialog open={abierto} onOpenChange={(siguiente) => { if (!procesando) onAbiertoChange(siguiente); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden">
      <DialogHeader>
        <DialogTitle>Factura de {cuenta.referenciaInterna}</DialogTitle>
        <DialogDescription>
          {cuenta.clienteNombre} · {cuenta.folioOrden} · {formatearMoneda(cuenta.montoTotal, cuenta.moneda)}.
          La cuenta ya está vinculada a esta orden; aquí se registra su número fiscal.
        </DialogDescription>
      </DialogHeader>
      <form className="flex min-h-0 flex-col gap-4" onSubmit={enviar} noValidate>
        <div className="grid min-h-0 gap-4 overflow-y-auto pb-1">
          <label className="grid gap-1 text-sm font-medium">Número de factura o remisión
            <Input value={folio} onChange={(evento) => setFolio(evento.target.value)} maxLength={60} required />
          </label>
          {cobrable ? <label className="grid gap-1 text-sm font-medium">Fecha de vencimiento
            <Input type="date" value={vencimiento} onChange={(evento) => setVencimiento(evento.target.value)} required />
          </label> : <p className="text-sm text-texto-secundario">
            Esta cuenta aún no es cobrable. El vencimiento se fija al entregar; puedes registrar ahora el número fiscal.
          </p>}
          {error && <p role="alert" className="text-sm text-peligro-texto">{error}</p>}
        </div>
        <DialogFooter className="static mt-2 shrink-0">
          <Button type="button" variante="contorno" disabled={procesando} onClick={() => onAbiertoChange(false)}>Cancelar</Button>
          <Button type="submit" disabled={procesando}>{procesando ? 'Guardando…' : 'Guardar factura'}</Button>
          {cuenta.saldoPendiente > 0 && <Button type="button" variante="secundario" disabled={procesando} onClick={() => void guardar(true)}>
            Guardar y registrar abono
          </Button>}
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
