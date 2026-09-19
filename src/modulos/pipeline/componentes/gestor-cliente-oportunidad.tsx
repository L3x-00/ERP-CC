'use client';

import { useState } from 'react';

import { asignarClienteOportunidadAccion } from '@/modulos/pipeline/acciones/asignar-cliente-oportunidad';
import { SelectorCliente } from '@/modulos/pipeline/componentes/selector-cliente';
import { ResumenClienteRfq } from '@/modulos/pipeline/componentes/resumen-cliente-rfq';
import { usarCliente } from '@/modulos/clientes/hooks/usar-cliente';
import { clienteAClienteRfq, type ClienteRfq, type CondicionesPago } from '@/modulos/pipeline/tipos/indice';

type Props = {
  oportunidadId: string;
  clienteId: string | null;
  condicionesPago: CondicionesPago | null;
  soloLectura?: boolean;
  onCambio?: (datos: { clienteId: string | null; condicionesPago: CondicionesPago | null }) => void;
};

/**
 * Cliente de una oportunidad abierta — RFQ-02/03. Permite ligarla a un cliente
 * del catálogo (o dar uno de alta) sin cerrar el editor de la cotización, y
 * heredar sus condiciones de pago cuando el vendedor lo pide.
 *
 * La herencia es opcional y explícita: una oportunidad puede tener condiciones
 * negociadas distintas a las del catálogo y elegir cliente no debe pisarlas en
 * silencio.
 */
export function GestorClienteOportunidad({
  oportunidadId,
  clienteId,
  condicionesPago,
  soloLectura = false,
  onCambio,
}: Props) {
  const [heredarCondiciones, setHeredarCondiciones] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const { data, isLoading } = usarCliente(clienteId);

  const seleccionado: ClienteRfq | null = data ? clienteAClienteRfq(data.cliente) : null;

  async function asignar(elegido: ClienteRfq | null): Promise<void> {
    setError(null);
    setGuardando(true);
    try {
      const respuesta = await asignarClienteOportunidadAccion({
        id: oportunidadId,
        clienteId: elegido?.id ?? null,
        heredarCondiciones,
      });
      if (respuesta.exito) {
        onCambio?.(
          respuesta.datos ?? { clienteId: elegido?.id ?? null, condicionesPago },
        );
      } else {
        setError(respuesta.error);
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  if (clienteId !== null && isLoading) {
    return (
      <p className="rounded-lg border border-borde px-4 py-3 text-xs text-texto-secundario">
        Cargando cliente de la oportunidad…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <SelectorCliente
        seleccionado={seleccionado}
        onSeleccionar={(elegido) => void asignar(elegido)}
        soloLectura={soloLectura || guardando}
      />
      {clienteId !== null && (
        <ResumenClienteRfq clienteId={clienteId} condicionesPago={condicionesPago} />
      )}
      {!soloLectura && (
        <label htmlFor={`heredar-condiciones-${oportunidadId}`} className="flex items-center gap-2 text-xs text-texto-secundario">
          <input
            id={`heredar-condiciones-${oportunidadId}`}
            type="checkbox"
            checked={heredarCondiciones}
            onChange={(evento) => setHeredarCondiciones(evento.target.checked)}
            disabled={guardando}
          />
          Heredar las condiciones de pago del cliente al asignarlo
        </label>
      )}
      {error !== null && (
        <p role="alert" className="text-xs text-peligro-texto">
          {error}
        </p>
      )}
    </div>
  );
}
