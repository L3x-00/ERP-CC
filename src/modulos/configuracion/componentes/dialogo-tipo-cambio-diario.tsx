'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
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
import { Label } from '@/compartido/componentes/ui/label';
import { actualizarTipoCambioAccion } from '@/modulos/configuracion/acciones/indice';
import { CLAVE_CONFIGURACION } from '@/modulos/configuracion/componentes/claves-consulta';
import { formatearFechaHoraNegocio, type EstadoTipoCambioDiario } from '@/modulos/configuracion/utilidades/tipo-cambio-diario';

type PropsDialogoTipoCambioDiario = {
  estado: EstadoTipoCambioDiario;
  abierto: boolean;
  alCambiarAbierto: (abierto: boolean) => void;
  alGuardar: () => void;
};

/** Formulario único para registrar el TC diario desde cualquier punto autorizado. */
export function DialogoTipoCambioDiario({
  estado,
  abierto,
  alCambiarAbierto,
  alGuardar,
}: PropsDialogoTipoCambioDiario) {
  const router = useRouter();
  const clienteQuery = useQueryClient();
  const [valor, setValor] = useState(estado.tipoCambioUsd.toFixed(4));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero <= 0) {
      setError('Captura un tipo de cambio mayor que cero.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const respuesta = await actualizarTipoCambioAccion({ tipoCambioUsd: numero });
      if (!respuesta.exito) {
        setError(respuesta.error);
        return;
      }
      alGuardar();
      alCambiarAbierto(false);
      await clienteQuery.invalidateQueries({ queryKey: CLAVE_CONFIGURACION });
      router.refresh();
    } catch {
      setError('No se pudo guardar el tipo de cambio. Vuelve a intentarlo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={alCambiarAbierto}>
      <DialogContent data-testid="modal-tipo-cambio-diario">
        <DialogHeader>
          <DialogTitle>Tipo de cambio del día</DialogTitle>
          <DialogDescription>
            Cotizaciones, compras, gastos y cobros usan un solo tipo de cambio MXN por USD. Confirma el valor
            vigente de hoy; puedes corregirlo antes de guardar.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={guardar}>
          <div className="grid gap-1">
            <Label htmlFor="tipo-cambio-diario" obligatorio>Tipo de cambio (MXN por USD)</Label>
            <Input
              id="tipo-cambio-diario"
              data-testid="tipo-cambio-diario-input"
              type="number"
              min="0.0001"
              step="0.0001"
              value={valor}
              onChange={(evento) => setValor(evento.target.value)}
              required
            />
            <p className="text-xs text-texto-secundario">
              {estado.actualizadoEn
                ? `Última captura: ${formatearFechaHoraNegocio(estado.actualizadoEn)}.`
                : 'Sin registro previo del tipo de cambio.'}
            </p>
          </div>
          {error ? (
            <p role="alert" data-testid="tipo-cambio-diario-error" className="text-sm font-medium text-peligro-texto">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variante="contorno"
              data-testid="tipo-cambio-diario-mas-tarde"
              disabled={guardando}
              onClick={() => alCambiarAbierto(false)}
            >
              Más tarde
            </Button>
            <Button type="submit" data-testid="tipo-cambio-diario-guardar" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar tipo de cambio'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
