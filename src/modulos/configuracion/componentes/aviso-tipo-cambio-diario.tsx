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
import type { EstadoTipoCambioDiario } from '@/modulos/configuracion/utilidades/tipo-cambio-diario';
import { formatearFechaHoraNegocio } from '@/modulos/configuracion/utilidades/tipo-cambio-diario';

const TEXTO_MOTIVO: Record<NonNullable<EstadoTipoCambioDiario['motivo']>, string> = {
  sin_registro: 'Aún no se ha registrado el tipo de cambio.',
  nuevo_dia: 'El último registro corresponde a otro día.',
  mas_de_24_horas: 'El último registro tiene más de 24 horas.',
};

/**
 * ACC-06 / E2E-02: pide al administrador el TC del día al entrar al dashboard.
 *
 * No bloquea: «Más tarde» (o Esc/la X) cierra el modal y deja un aviso visible
 * con acceso para registrarlo. El aviso y el modal vuelven en el siguiente
 * ingreso mientras la fecha dedicada del TC siga vencida en la base.
 */
export function AvisoTipoCambioDiario({ estado }: { estado: EstadoTipoCambioDiario }) {
  const router = useRouter();
  const clienteQuery = useQueryClient();
  const [pendiente, setPendiente] = useState(estado.requiereActualizacion);
  const [abierto, setAbierto] = useState(estado.requiereActualizacion);
  const [valor, setValor] = useState(estado.tipoCambioUsd.toFixed(4));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!pendiente) return null;

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
      setPendiente(false);
      setAbierto(false);
      await clienteQuery.invalidateQueries({ queryKey: CLAVE_CONFIGURACION });
      router.refresh();
    } catch {
      setError('No se pudo guardar el tipo de cambio. Vuelve a intentarlo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <section
        role="status"
        aria-live="polite"
        data-testid="aviso-tipo-cambio-diario"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-advertencia-texto/30 bg-advertencia-suave px-4 py-3"
      >
        <div className="grid gap-1">
          <p className="text-sm font-semibold text-advertencia-texto">Tipo de cambio del día pendiente</p>
          <p className="text-sm text-texto-secundario">
            {estado.motivo ? TEXTO_MOTIVO[estado.motivo] : ''} Se usa {estado.tipoCambioUsd.toFixed(4)} MXN/USD
            {estado.actualizadoEn ? ` desde ${formatearFechaHoraNegocio(estado.actualizadoEn)}` : ''}.
          </p>
        </div>
        <Button variante="contorno" tamano="sm" onClick={() => setAbierto(true)}>
          Registrar ahora
        </Button>
      </section>

      <Dialog open={abierto} onOpenChange={setAbierto}>
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
                onClick={() => setAbierto(false)}
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
    </>
  );
}
