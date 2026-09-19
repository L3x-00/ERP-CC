'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { retirarOportunidadAccion } from '@/modulos/pipeline/acciones/retirar-oportunidad';
import { Button } from '@/compartido/componentes/ui/button';

type PropsBotonRetirar = {
  oportunidadId: string;
  folio: string;
};

/**
 * Retiro de una oportunidad sin orden asociada (RFQ-18). Pide confirmación en
 * dos pasos y llama a `retirarOportunidadAccion`; el servidor rechaza el retiro
 * si hay una orden detrás. En éxito invalida el listado y refresca la ruta.
 */
export function BotonRetirarOportunidad({ oportunidadId, folio }: PropsBotonRetirar) {
  const router = useRouter();
  const clienteConsultas = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function retirar(): Promise<void> {
    setError(null);
    setEnviando(true);
    try {
      const respuesta = await retirarOportunidadAccion({ id: oportunidadId });
      if (respuesta.exito) {
        await clienteConsultas.invalidateQueries({ queryKey: ['pipeline'] });
        router.refresh();
        return;
      }
      setError(respuesta.error);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    }
    setEnviando(false);
    setConfirmando(false);
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirmando(true);
        }}
        className="self-start text-xs font-semibold text-peligro-texto hover:underline"
      >
        Retirar
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-texto-secundario">
        ¿Retirar {folio} sin orden? No se puede deshacer.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variante="destructivo"
          tamano="sm"
          onClick={() => void retirar()}
          disabled={enviando}
        >
          {enviando ? 'Retirando…' : 'Confirmar retiro'}
        </Button>
        <Button
          type="button"
          variante="contorno"
          tamano="sm"
          onClick={() => setConfirmando(false)}
          disabled={enviando}
        >
          Cancelar
        </Button>
      </div>
      {error !== null && (
        <p role="alert" className="text-xs text-peligro-texto">
          {error}
        </p>
      )}
    </div>
  );
}
