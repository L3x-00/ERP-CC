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
import { crearNuevaRevisionAccion } from '@/modulos/propuestas/acciones/crear-nueva-revision';
import type { EstadoPropuesta } from '@/modulos/propuestas/tipos/indice';
import { claveDetallePropuesta } from './claves-consulta';

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Estados desde los que el servidor admite abrir una versión nueva. Obs.
 * cliente 2026-10-12: solo desde revisiones ya ENVIADAS (SENT/FOLLOW_UP);
 * «Lista para enviar» se ajusta con «Editar» (reabrir_revision) y una propuesta
 * aceptada ya no admite versiones nuevas.
 */
const ESTADOS_CON_NUEVA_VERSION: readonly EstadoPropuesta[] = ['SENT', 'FOLLOW_UP'];

/**
 * Observación del cliente: la ficha ofrece «Crear nueva versión» desde una
 * revisión ya enviada, con el mismo espíritu del versionado del RFQ. Copia
 * ítems, ruteo y costos en la letra siguiente (B..Z), exige motivo y conserva
 * la versión anterior en el historial. No se ofrece en borrador (esa versión se
 * edita directamente), en «Lista para enviar» (se usa «Editar») ni cuando la
 * propuesta ya tiene una revisión aceptada.
 */
export function BotonNuevaVersionPropuesta({
  propuestaId,
  revisionId,
  letra,
  estado,
  puedeCrear,
  bloqueada = false,
  onVersionCreada,
}: {
  propuestaId: string;
  revisionId: string;
  letra: string;
  estado: EstadoPropuesta;
  puedeCrear: boolean;
  bloqueada?: boolean;
  onVersionCreada?: (revisionId: string, letra: string) => void;
}) {
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Sin permiso, en borrador, en estados terminales o con la propuesta ya
  // aceptada no hay versión que abrir: no se muestra un control bloqueado.
  if (bloqueada || !puedeCrear || !ESTADOS_CON_NUEVA_VERSION.includes(estado)) return null;

  const indice = LETRAS.indexOf(letra.trim().toUpperCase());
  const letraSiguiente = indice >= 0 && indice < LETRAS.length - 1 ? LETRAS[indice + 1] : null;
  const motivoValido = motivo.trim().length >= 3;

  async function crearVersion(): Promise<void> {
    if (!motivoValido || procesando) return;
    setProcesando(true);
    setMensaje(null);
    const respuesta = await crearNuevaRevisionAccion({
      revisionOrigen: revisionId,
      motivo: motivo.trim(),
    });
    setProcesando(false);
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: claveDetallePropuesta(propuestaId) });
    await queryClient.invalidateQueries({ queryKey: ['propuestas'] });
    const nueva = respuesta.datos;
    setAbierto(false);
    setMotivo('');
    if (nueva) onVersionCreada?.(nueva.revisionId, nueva.letra);
  }

  return (
    <>
      <Button
        variante="contorno"
        tamano="sm"
        onClick={() => setAbierto(true)}
        title="Crea la siguiente versión a partir de esta"
        data-testid="boton-crear-nueva-version"
      >
        Crear nueva versión
      </Button>

      <Dialog
        open={abierto}
        onOpenChange={(valor) => {
          if (procesando) return;
          setAbierto(valor);
          if (!valor) setMensaje(null);
        }}
      >
        <DialogContent data-testid="dialogo-nueva-version">
          <DialogHeader>
            <DialogTitle>Crear nueva versión</DialogTitle>
            <DialogDescription>
              Se copiará la versión {letra.trim().toUpperCase()}
              {letraSiguiente ? ` en la versión ${letraSiguiente}` : ''} con sus ítems, ruteo y
              costos. Podrás agregar o quitar ítems y procesos, y ajustar cantidades; la versión
              anterior queda en el historial como solo lectura.
            </DialogDescription>
          </DialogHeader>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Motivo de la nueva versión</span>
            <textarea
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              maxLength={300}
              rows={2}
              aria-label="Motivo de la nueva versión"
              className="rounded-base border border-borde-fuerte bg-superficie px-2 py-1 text-sm"
            />
            <span className="text-xs text-texto-secundario">
              Describe qué cambió el cliente (cantidades, material, procesos…).
            </span>
          </label>

          {mensaje !== null && (
            <p role="alert" className="text-sm text-peligro-texto">
              {mensaje}
            </p>
          )}

          <DialogFooter>
            <Button
              variante="fantasma"
              onClick={() => setAbierto(false)}
              disabled={procesando}
            >
              Cancelar
            </Button>
            <Button onClick={() => void crearVersion()} disabled={procesando || !motivoValido}>
              {procesando ? 'Creando versión…' : 'Crear versión'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
