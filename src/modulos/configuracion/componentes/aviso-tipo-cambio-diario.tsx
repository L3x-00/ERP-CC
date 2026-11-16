'use client';

import { useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import type { EstadoTipoCambioDiario } from '@/modulos/configuracion/utilidades/tipo-cambio-diario';
import { formatearFechaHoraNegocio } from '@/modulos/configuracion/utilidades/tipo-cambio-diario';
import { DialogoTipoCambioDiario } from './dialogo-tipo-cambio-diario';

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
  const [pendiente, setPendiente] = useState(estado.requiereActualizacion);
  const [abierto, setAbierto] = useState(estado.requiereActualizacion);

  if (!pendiente) return null;

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

      <DialogoTipoCambioDiario
        estado={estado}
        abierto={abierto}
        alCambiarAbierto={setAbierto}
        alGuardar={() => setPendiente(false)}
      />
    </>
  );
}
