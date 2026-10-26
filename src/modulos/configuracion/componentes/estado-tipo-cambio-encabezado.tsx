'use client';

import { useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { DialogoTipoCambioDiario } from '@/modulos/configuracion/componentes/dialogo-tipo-cambio-diario';
import type { EstadoTipoCambioDiario } from '@/modulos/configuracion/utilidades/tipo-cambio-diario';

type PropsEstadoTipoCambioEncabezado = {
  estado: EstadoTipoCambioDiario | null;
  puedeActualizar: boolean;
};

function formatearTipoCambio(valor: number): string {
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

/** Indicador global del TC sin exponer una acción de configuración a quien no puede usarla. */
export function EstadoTipoCambioEncabezado({ estado, puedeActualizar }: PropsEstadoTipoCambioEncabezado) {
  const [abierto, setAbierto] = useState(false);

  if (estado === null) {
    return <span className="whitespace-nowrap text-xs text-texto-tenue">T.C. no disponible</span>;
  }

  if (estado.actualizadoEn) {
    return (
      <span data-testid="tipo-cambio-encabezado" className="whitespace-nowrap text-xs font-semibold text-texto-secundario">
        T.C. ${formatearTipoCambio(estado.tipoCambioUsd)} MXN/USD
      </span>
    );
  }

  if (!puedeActualizar) {
    return <span className="whitespace-nowrap text-xs font-medium text-advertencia-texto">T.C. sin establecer</span>;
  }

  return (
    <>
      <Button
        variante="contorno"
        tamano="sm"
        onClick={() => setAbierto(true)}
        className="whitespace-nowrap text-xs"
      >
        Establecer tipo de cambio
      </Button>
      <DialogoTipoCambioDiario
        estado={estado}
        abierto={abierto}
        alCambiarAbierto={setAbierto}
        alGuardar={() => setAbierto(false)}
      />
    </>
  );
}
