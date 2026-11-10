'use client';

import { useState } from 'react';

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
import type { UsuarioAdmin } from '@/modulos/permisos/tipos/indice';

/**
 * UI-04: confirmación del sistema para activar o desactivar un usuario.
 * Sustituye las ventanas nativas sin cambiar la acción ni su auditoría.
 */
export function DialogoEstadoUsuario({
  usuario,
  onCerrar,
  onConfirmar,
  ocupado,
  error,
}: {
  usuario: UsuarioAdmin;
  onCerrar: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
  ocupado: boolean;
  error: string | null;
}) {
  const [motivo, setMotivo] = useState('');
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const accion = usuario.activo ? 'desactivar' : 'activar';

  async function confirmar(): Promise<void> {
    const limpio = motivo.trim();
    if (limpio.length < 3) {
      setErrorMotivo('El motivo es obligatorio (mínimo 3 caracteres).');
      return;
    }
    setErrorMotivo(null);
    await onConfirmar(limpio);
  }

  return (
    <Dialog open onOpenChange={(abierto) => (!abierto && !ocupado ? onCerrar() : undefined)}>
      <DialogContent data-testid="dialogo-estado-usuario">
        <DialogHeader>
          <DialogTitle>
            {usuario.activo ? 'Desactivar' : 'Activar'} a {usuario.nombreCompleto}
          </DialogTitle>
          <DialogDescription>
            {usuario.activo
              ? 'El usuario perderá acceso al sistema inmediatamente. Su historial se conserva.'
              : 'El usuario recuperará el acceso con el rol que tenga asignado.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="motivo-cambio-estado" obligatorio>Motivo para {accion}</Label>
          <Input
            id="motivo-cambio-estado"
            data-testid="motivo-cambio-estado"
            value={motivo}
            onChange={(evento) => {
              setMotivo(evento.target.value);
              setErrorMotivo(null);
            }}
            placeholder="Explica brevemente el cambio"
            maxLength={300}
          />
          {errorMotivo ? (
            <p role="alert" className="text-sm text-peligro-texto">{errorMotivo}</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-peligro-texto" data-testid="dialogo-estado-error">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variante="contorno" onClick={onCerrar} disabled={ocupado} data-testid="cancelar-cambio-estado">
            Cancelar
          </Button>
          <Button
            type="button"
            variante={usuario.activo ? 'destructivo' : 'primario'}
            onClick={() => void confirmar()}
            disabled={ocupado}
            data-testid="confirmar-cambio-estado"
          >
            {ocupado ? 'Guardando…' : usuario.activo ? 'Desactivar usuario' : 'Activar usuario'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
