'use client';

import { useState, type FormEvent } from 'react';
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
import { Input } from '@/compartido/componentes/ui/input';
import { repetirOrdenAccion } from '@/modulos/ordenes/acciones/repetir-orden';

type Props = {
  ordenOrigenId: string;
  folioOrigen: string;
  onCerrar: () => void;
};

function fechaPorDefecto(): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + 30);
  return fecha.toISOString().slice(0, 10);
}

function aFechaIso(fecha: string): string {
  const instante = new Date(`${fecha}T00:00:00`);
  return Number.isNaN(instante.getTime()) ? '' : instante.toISOString();
}

/** CLI-08: repite el trabajo con un folio nuevo y sin copiar la ejecución previa. */
export function RepetirOrdenDialog({ ordenOrigenId, folioOrigen, onCerrar }: Props) {
  const router = useRouter();
  const [fechaCompromiso, setFechaCompromiso] = useState(fechaPorDefecto);
  const [error, setError] = useState<string | null>(null);
  const [folioNuevo, setFolioNuevo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    if (fechaCompromiso === '') {
      setError('Indica la fecha de compromiso.');
      return;
    }
    setEnviando(true);
    try {
      const respuesta = await repetirOrdenAccion({
        ordenOrigenId,
        fechaCompromiso: aFechaIso(fechaCompromiso),
      });
      if (respuesta.exito && respuesta.datos) {
        setFolioNuevo(respuesta.datos.folio);
        router.refresh();
      } else {
        setError(respuesta.exito ? 'No se pudo repetir el trabajo' : respuesta.error);
      }
    } catch {
      setError('No se pudo repetir el trabajo. Intenta de nuevo.');
    }
    setEnviando(false);
  }

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto && !enviando) onCerrar(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Repetir trabajo de {folioOrigen}</DialogTitle>
          <DialogDescription>
            Se crea una orden nueva con los mismos datos comerciales y técnicos. No se copian
            avances, sesiones, pagos, documentos ni notas de la ejecución anterior.
          </DialogDescription>
        </DialogHeader>
        {folioNuevo === null ? (
          <form className="flex flex-col gap-3" onSubmit={enviar} noValidate>
            <label className="flex flex-col gap-1 text-sm font-medium text-texto-secundario">
              Fecha de compromiso
              <Input
                data-testid="repetir-fecha-compromiso"
                type="date"
                value={fechaCompromiso}
                onChange={(evento) => setFechaCompromiso(evento.target.value)}
              />
            </label>
            {error ? <p role="alert" className="text-sm text-peligro-texto">{error}</p> : null}
            <DialogFooter className="static mt-1">
              <Button type="button" variante="contorno" disabled={enviando} onClick={onCerrar}>
                Cancelar
              </Button>
              <Button type="submit" data-testid="confirmar-repetir-orden" disabled={enviando}>
                {enviando ? 'Repitiendo…' : 'Crear trabajo repetido'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <p role="status" className="text-sm text-exito-texto">
              Trabajo repetido en la orden <strong>{folioNuevo}</strong>; ya está en Bandeja.
            </p>
            <DialogFooter className="static">
              <Button type="button" onClick={onCerrar}>Cerrar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
