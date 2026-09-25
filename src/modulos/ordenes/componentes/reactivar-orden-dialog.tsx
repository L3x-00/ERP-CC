'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { reactivarOrdenAccion } from '@/modulos/ordenes/acciones/reactivar-orden';

type Props = {
  ordenId: string;
  folio: string;
  actualizadoEn: string;
  onCerrar: () => void;
};

/**
 * PRD-15: confirmación explícita antes de devolver una orden Lista a operación.
 * La Server Action y PostgreSQL rechazan si ya hay entrega o cobros.
 */
export function ReactivarOrdenDialog({ ordenId, folio, actualizadoEn, onCerrar }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [reactivada, setReactivada] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function confirmar(): Promise<void> {
    setError(null);
    setEnviando(true);
    try {
      const respuesta = await reactivarOrdenAccion({ ordenId, actualizadoEn });
      if (respuesta.exito) {
        setReactivada(true);
        router.refresh();
      } else {
        setError(respuesta.error);
      }
    } catch {
      setError('No se pudo reactivar la orden. Intenta de nuevo.');
    }
    setEnviando(false);
  }

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto && !enviando) onCerrar(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reactivar orden {folio}</DialogTitle>
          <DialogDescription>
            La orden vuelve a operación como «En proceso». Se conservan las sesiones, avances y
            programaciones previas. No se permite si ya existe entrega o cobros registrados.
          </DialogDescription>
        </DialogHeader>
        {reactivada ? (
          <div className="flex flex-col gap-3">
            <p role="status" className="text-sm text-exito-texto">
              Orden {folio} reactivada; ya aparece en operación con su historial previo.
            </p>
            <DialogFooter className="static">
              <Button type="button" onClick={onCerrar}>Cerrar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {error ? <p role="alert" className="text-sm text-peligro-texto">{error}</p> : null}
            <DialogFooter className="static">
              <Button type="button" variante="contorno" disabled={enviando} onClick={onCerrar}>
                Cancelar
              </Button>
              <Button type="button" data-testid="confirmar-reactivar-orden" disabled={enviando} onClick={() => void confirmar()}>
                {enviando ? 'Reactivando…' : 'Reactivar orden'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
