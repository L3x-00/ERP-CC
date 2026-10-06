'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

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
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { cancelarPromesaPagoAccion } from '@/modulos/cobranza/acciones/cancelar-promesa';
import { crearPromesaPagoAccion } from '@/modulos/cobranza/acciones/crear-promesa';
import { obtenerPromesaCuentaAccion } from '@/modulos/cobranza/acciones/obtener-promesa-cuenta';

function fechaSugerida(): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + 7);
  return fecha.toISOString().slice(0, 10);
}

/** SII-B8 F3: alta/cancelación de la promesa de pago de una cuenta. */
export function ModalPromesaPago({
  cuentaId,
  saldo,
  referencia,
  abierto,
  onCerrar,
  onGuardada,
}: {
  cuentaId: string;
  saldo: number;
  referencia: string;
  abierto: boolean;
  onCerrar: () => void;
  onGuardada: () => Promise<void> | void;
}) {
  const consulta = useQuery({
    queryKey: ['cobranza', 'promesa', cuentaId],
    enabled: abierto,
    queryFn: async () => {
      const respuesta = await obtenerPromesaCuentaAccion({ cuentaId });
      if (!respuesta.exito) throw new Error(respuesta.error);
      return respuesta.datos ?? null;
    },
  });

  const [fecha, setFecha] = useState(fechaSugerida);
  const [monto, setMonto] = useState(String(saldo));
  const [motivo, setMotivo] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const promesa = consulta.data ?? null;

  async function crear(): Promise<void> {
    setOcupado(true);
    setError(null);
    const respuesta = await crearPromesaPagoAccion({
      cuentaId,
      fechaPrometida: fecha,
      monto: Number(monto),
    });
    setOcupado(false);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    setMensaje(`Promesa registrada para el ${respuesta.datos?.fechaPrometida}.`);
    await consulta.refetch();
    await onGuardada();
  }

  async function cancelar(): Promise<void> {
    if (!promesa) return;
    setOcupado(true);
    setError(null);
    const respuesta = await cancelarPromesaPagoAccion({ promesaId: promesa.id, motivo });
    setOcupado(false);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    setMensaje('Promesa cancelada.');
    setMotivo('');
    await consulta.refetch();
    await onGuardada();
  }

  return (
    <Dialog open={abierto} onOpenChange={(siguiente) => (!siguiente ? onCerrar() : undefined)}>
      <DialogContent data-testid="modal-promesa-pago">
        <DialogHeader>
          <DialogTitle>Promesa de pago · {referencia}</DialogTitle>
          <DialogDescription>
            Saldo actual {formatearMoneda(saldo, 'MXN')}. Las promesas reciben aviso interno 2 días
            antes del vencimiento y al quedar vencidas.
          </DialogDescription>
        </DialogHeader>

        {consulta.isPending ? <p className="text-sm text-texto-secundario">Cargando promesa…</p> : null}
        {error ? <p role="alert" className="text-sm text-peligro-texto" data-testid="promesa-error">{error}</p> : null}
        {mensaje ? <p role="status" className="text-sm text-exito-texto" data-testid="promesa-mensaje">{mensaje}</p> : null}

        {!consulta.isPending && !promesa && !mensaje ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Fecha prometida
              <Input type="date" className="min-h-11" data-testid="promesa-fecha"
                value={fecha} onChange={(evento) => setFecha(evento.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Monto prometido
              <Input type="number" min="0" step="0.01" className="min-h-11" data-testid="promesa-monto"
                value={monto} onChange={(evento) => setMonto(evento.target.value)} />
            </label>
            <DialogFooter>
              <Button type="button" variante="contorno" onClick={onCerrar}>Cerrar</Button>
              <Button type="button" data-testid="confirmar-crear-promesa"
                disabled={ocupado || fecha === '' || !(Number(monto) > 0)}
                onClick={() => void crear()}>
                {ocupado ? 'Guardando…' : 'Registrar promesa'}
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {!consulta.isPending && promesa ? (
          <div className="grid gap-3">
            <p className="text-sm">
              Estado actual: <strong>{promesa.estado}</strong> · {formatearMoneda(promesa.monto, 'MXN')} para el{' '}
              {promesa.fechaPrometida}
            </p>
            {!mensaje ? (
              <>
                <label className="grid gap-1 text-sm font-medium">
                  Motivo de cancelación (si aplica)
                  <Input className="min-h-11" minLength={3} maxLength={300} data-testid="promesa-motivo"
                    value={motivo} onChange={(evento) => setMotivo(evento.target.value)} />
                </label>
                <DialogFooter>
                  <Button type="button" variante="contorno" onClick={onCerrar}>Cerrar</Button>
                  <Button type="button" variante="destructivo" data-testid="confirmar-cancelar-promesa"
                    disabled={ocupado || motivo.trim().length < 3} onClick={() => void cancelar()}>
                    {ocupado ? 'Cancelando…' : 'Cancelar promesa'}
                  </Button>
                </DialogFooter>
              </>
            ) : null}
          </div>
        ) : null}

        {mensaje ? (
          <DialogFooter>
            <Button type="button" onClick={onCerrar} data-testid="cerrar-promesa">Cerrar</Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
