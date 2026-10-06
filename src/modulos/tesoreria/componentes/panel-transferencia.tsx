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
import { registrarTransferenciaAccion } from '@/modulos/tesoreria/acciones/registrar-transferencia';
import type { CuentaTesoreria } from '@/modulos/tesoreria/tipos/indice';

/** SII-B8 F5: transferencia interna entre cuentas activas de la misma moneda. */
export function PanelTransferencia({
  cuentas,
  abierto,
  onCerrar,
  onRegistrada,
}: {
  cuentas: readonly CuentaTesoreria[];
  abierto: boolean;
  onCerrar: () => void;
  onRegistrada: () => Promise<void> | void;
}) {
  const activas = cuentas.filter((cuenta) => cuenta.activa);
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [monto, setMonto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cuentaOrigen = activas.find((cuenta) => cuenta.id === origen) ?? null;
  const cuentasDestino = activas.filter(
    (cuenta) => cuenta.id !== origen && (!cuentaOrigen || cuenta.moneda === cuentaOrigen.moneda),
  );

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setOcupado(true);
    setError(null);
    const respuesta = await registrarTransferenciaAccion({
      cuentaOrigenId: origen,
      cuentaDestinoId: destino,
      monto: Number(monto),
      referencia: referencia.trim() === '' ? null : referencia.trim(),
    });
    setOcupado(false);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    setMensaje('Transferencia interna registrada (no es ingreso ni gasto).');
    await onRegistrada();
  }

  return (
    <Dialog open={abierto} onOpenChange={(siguiente) => (!siguiente ? onCerrar() : undefined)}>
      <DialogContent data-testid="panel-transferencia">
        <DialogHeader>
          <DialogTitle>Transferencia interna</DialogTitle>
          <DialogDescription>
            Mueve saldo entre cuentas activas de la misma moneda; queda como par salida/entrada y no
            cuenta como ingreso ni gasto.
          </DialogDescription>
        </DialogHeader>
        {mensaje ? (
          <p role="status" className="text-sm text-exito-texto" data-testid="transf-mensaje">{mensaje}</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-peligro-texto" data-testid="transf-error">{error}</p>
        ) : null}
        {!mensaje ? (
          <form className="grid gap-3" onSubmit={(evento) => void enviar(evento)}>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                Cuenta origen
                <Select className="min-h-11" required data-testid="transf-origen"
                  value={origen} onChange={(evento) => { setOrigen(evento.target.value); setDestino(''); }}>
                  <option value="">Selecciona una cuenta</option>
                  {activas.map((cuenta) => (
                    <option key={cuenta.id} value={cuenta.id}>{cuenta.etiqueta}</option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Cuenta destino
                <Select className="min-h-11" required data-testid="transf-destino"
                  value={destino} onChange={(evento) => setDestino(evento.target.value)}>
                  <option value="">Selecciona una cuenta</option>
                  {cuentasDestino.map((cuenta) => (
                    <option key={cuenta.id} value={cuenta.id}>{cuenta.etiqueta}</option>
                  ))}
                </Select>
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                Monto
                <Input type="number" min="0" step="0.01" required className="min-h-11"
                  data-testid="transf-monto" value={monto} onChange={(evento) => setMonto(evento.target.value)} />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Referencia (opcional)
                <Input className="min-h-11" data-testid="transf-referencia"
                  value={referencia} onChange={(evento) => setReferencia(evento.target.value)} />
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variante="contorno" onClick={onCerrar}>Cancelar</Button>
              <Button type="submit" disabled={ocupado || origen === '' || destino === '' || !(Number(monto) > 0)}
                data-testid="confirmar-transferencia">
                {ocupado ? 'Registrando…' : 'Registrar transferencia'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <DialogFooter>
            <Button type="button" onClick={onCerrar} data-testid="cerrar-transferencia">Cerrar</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
