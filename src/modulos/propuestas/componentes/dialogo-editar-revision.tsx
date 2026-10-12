'use client';

import { useState } from 'react';
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
import { reabrirRevisionAccion } from '@/modulos/propuestas/acciones/reabrir-revision';
import { claveDetallePropuesta } from './claves-consulta';

/**
 * Obs. cliente 2026-10-12: en «Lista para enviar» ya no se ofrece «Crear nueva
 * versión»; el ajuste se hace con «Editar», que devuelve la revisión a borrador
 * (con motivo) para retocar ítems, ruteo o costos y volver a validar/enviar.
 * El PDF vigente queda invalidado por la RPC.
 */
export function BotonEditarRevision({
  propuestaId,
  revisionId,
  letra,
  actualizadoEn,
  puedeEditar,
  bloqueada = false,
  onReabierta,
}: {
  propuestaId: string;
  revisionId: string;
  letra: string;
  actualizadoEn: string;
  puedeEditar: boolean;
  bloqueada?: boolean;
  onReabierta?: () => void;
}) {
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  if (!puedeEditar || bloqueada) return null;

  const motivoValido = motivo.trim().length >= 3;

  async function reabrir(): Promise<void> {
    if (!motivoValido || procesando) return;
    setProcesando(true);
    setMensaje(null);
    const respuesta = await reabrirRevisionAccion({
      revisionId,
      actualizadoEn,
      motivo: motivo.trim(),
    });
    setProcesando(false);
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: claveDetallePropuesta(propuestaId) });
    await queryClient.invalidateQueries({ queryKey: ['propuestas'] });
    setAbierto(false);
    setMotivo('');
    onReabierta?.();
  }

  return (
    <>
      <Button
        variante="contorno"
        tamano="sm"
        onClick={() => setAbierto(true)}
        title="Devuelve esta versión a borrador para ajustarla antes de enviar"
        data-testid="boton-editar-revision"
      >
        Editar
      </Button>

      <Dialog
        open={abierto}
        onOpenChange={(valor) => {
          if (procesando) return;
          setAbierto(valor);
          if (!valor) setMensaje(null);
        }}
      >
        <DialogContent data-testid="dialogo-editar-revision">
          <DialogHeader>
            <DialogTitle>Editar versión {letra.trim().toUpperCase()}</DialogTitle>
            <DialogDescription>
              La versión vuelve a borrador para ajustar ítems, ruteo o costos. El PDF vigente se
              invalida: al terminar, valida la versión otra vez y genera el PDF antes de enviarla.
            </DialogDescription>
          </DialogHeader>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Motivo de la edición</span>
            <textarea
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              maxLength={300}
              rows={2}
              aria-label="Motivo de la edición"
              className="rounded-base border border-borde-fuerte bg-superficie px-2 py-1 text-sm"
            />
            <span className="text-xs text-texto-secundario">
              Describe qué se va a ajustar antes de enviar la propuesta.
            </span>
          </label>

          {mensaje !== null && (
            <p role="alert" className="text-sm text-peligro-texto">
              {mensaje}
            </p>
          )}

          <DialogFooter>
            <Button variante="fantasma" onClick={() => setAbierto(false)} disabled={procesando}>
              Cancelar
            </Button>
            <Button onClick={() => void reabrir()} disabled={procesando || !motivoValido}>
              {procesando ? 'Volviendo a borrador…' : 'Editar versión'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
