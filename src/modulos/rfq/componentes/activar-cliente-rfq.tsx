'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Button } from '@/compartido/componentes/ui/button';
import { cambiarEstadoClienteAccion } from '@/modulos/clientes/acciones/cambiar-estado-cliente';
import { claveDetalleCliente } from '@/modulos/clientes/componentes/claves-consulta';
import { usarCliente } from '@/modulos/clientes/hooks/usar-cliente';

/**
 * Activa un cliente prospecto desde la ficha del RFQ reutilizando la misma
 * server action, el mismo permiso (`cliente_editar`) y el CAS de
 * `clientes.actualizado_en`. No inventa estados ni toca la máquina del RFQ.
 */
export function ActivarClienteRfq({
  clienteId,
  puedeEditarCliente,
}: {
  clienteId: string;
  puedeEditarCliente: boolean;
}) {
  const consulta = usarCliente(clienteId);
  const clienteConsultas = useQueryClient();
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cliente = consulta.data?.cliente;

  if (!puedeEditarCliente || !cliente || cliente.estado !== 'prospecto') return null;

  async function activar(): Promise<void> {
    setProcesando(true);
    setError(null);
    const respuesta = await cambiarEstadoClienteAccion({
      clienteId,
      nuevoEstado: 'activo',
      actualizadoEn: cliente!.actualizadoEn,
    });
    setProcesando(false);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    await clienteConsultas.invalidateQueries({ queryKey: claveDetalleCliente(clienteId) });
    await clienteConsultas.invalidateQueries({ queryKey: ['clientes'] });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-advertencia/40 bg-advertencia-suave px-3 py-2">
      <BadgeEstado estado={cliente.estado} />
      <Button
        type="button"
        tamano="sm"
        disabled={procesando}
        onClick={() => void activar()}
        data-testid="rfq-activar-cliente"
      >
        {procesando ? 'Activando cliente…' : 'Activar cliente'}
      </Button>
      {error ? <p role="alert" className="text-xs text-peligro-texto">{error}</p> : null}
    </div>
  );
}
