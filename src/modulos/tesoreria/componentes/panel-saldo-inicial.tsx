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
import { Input } from '@/compartido/componentes/ui/input';
import { registrarSaldoInicialAccion } from '@/modulos/tesoreria/acciones/registrar-saldo-inicial';

/** SII-B8 F5: captura del saldo inicial de una cuenta. */
export function PanelSaldoInicial({
  cuentaId,
  cuentaEtiqueta,
  moneda,
  saldoActual,
  abierto,
  onCerrar,
  onGuardado,
}: {
  cuentaId: string;
  cuentaEtiqueta: string;
  moneda: string;
  saldoActual: number | null;
  abierto: boolean;
  onCerrar: () => void;
  onGuardado: () => Promise<void> | void;
}) {
  const [monto, setMonto] = useState(saldoActual === null ? '' : String(saldoActual));
  const [tipoCambio, setTipoCambio] = useState('1');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setOcupado(true);
    setError(null);
    const respuesta = await registrarSaldoInicialAccion({
      cuentaId,
      monto: Number(monto),
      moneda: moneda === 'USD' ? 'USD' : 'MXN',
      tipoCambio: Number(tipoCambio),
      fecha,
    });
    setOcupado(false);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    setMensaje('Saldo inicial registrado.');
    await onGuardado();
  }

  return (
    <Dialog open={abierto} onOpenChange={(siguiente) => (!siguiente ? onCerrar() : undefined)}>
      <DialogContent data-testid="panel-saldo-inicial">
        <DialogHeader>
          <DialogTitle>Saldo inicial · {cuentaEtiqueta}</DialogTitle>
          <DialogDescription>
            En la moneda de la cuenta; el tipo de cambio es a MXN (1 cuando la cuenta es MXN).
          </DialogDescription>
        </DialogHeader>
        {mensaje ? (
          <p role="status" className="text-sm text-exito-texto" data-testid="saldo-mensaje">{mensaje}</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-peligro-texto" data-testid="saldo-error">{error}</p>
        ) : null}
        {!mensaje ? (
          <form className="grid gap-3" onSubmit={(evento) => void enviar(evento)}>
            <label className="grid gap-1 text-sm font-medium">
              Monto ({moneda})
              <Input type="number" min="0" step="0.01" required className="min-h-11"
                data-testid="saldo-monto" value={monto} onChange={(evento) => setMonto(evento.target.value)} />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                Tipo de cambio (a MXN)
                <Input type="number" min="0" step="0.0001" className="min-h-11" disabled={moneda === 'MXN'}
                  data-testid="saldo-tipo-cambio" value={tipoCambio}
                  onChange={(evento) => setTipoCambio(evento.target.value)} />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Fecha
                <Input type="date" required className="min-h-11" data-testid="saldo-fecha"
                  value={fecha} onChange={(evento) => setFecha(evento.target.value)} />
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variante="contorno" onClick={onCerrar}>Cancelar</Button>
              <Button type="submit" disabled={ocupado || monto.trim() === ''} data-testid="confirmar-saldo-inicial">
                {ocupado ? 'Guardando…' : 'Guardar saldo inicial'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <DialogFooter>
            <Button type="button" onClick={onCerrar} data-testid="cerrar-saldo-inicial">Cerrar</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
