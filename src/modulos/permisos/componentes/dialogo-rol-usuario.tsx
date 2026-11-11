'use client';

import { useState } from 'react';

import { Badge } from '@/compartido/componentes/ui/badge';
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
import type { RolUsuario, UsuarioAdmin } from '@/modulos/permisos/tipos/indice';
import { NOMBRE_ROL } from '@/modulos/permisos/utilidades/matriz';
import { VistaPermisosRol } from './vista-permisos-rol';

export type ModoDialogoRol = 'cambio' | 'consulta';

/**
 * UI-04: al cambiar o consultar el rol de un usuario se muestran sus permisos
 * vigentes agrupados por módulo. Es una vista informativa: la matriz editable
 * sigue viviendo en el apartado Permisos y no se modifica desde aquí.
 */
export function DialogoRolUsuario({
  usuario,
  rolDestino,
  modo,
  onCerrar,
  onConfirmar,
  onIrAPermisos,
  ocupado,
  error,
}: {
  usuario: UsuarioAdmin;
  rolDestino: RolUsuario;
  modo: ModoDialogoRol;
  onCerrar: () => void;
  onConfirmar?: (motivo: string) => Promise<void>;
  onIrAPermisos?: () => void;
  ocupado: boolean;
  error: string | null;
}) {
  const [motivo, setMotivo] = useState('');
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);

  async function confirmar(): Promise<void> {
    if (!onConfirmar) return;
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
      <DialogContent data-testid="dialogo-rol-usuario">
        <DialogHeader>
          <DialogTitle>
            {modo === 'cambio' ? `Cambiar rol de ${usuario.nombreCompleto}` : `Permisos de ${usuario.nombreCompleto}`}
          </DialogTitle>
          <DialogDescription>
            Los permisos se administran por rol. Esta vista no modifica la matriz ni concede accesos.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 rounded-md bg-superficie-2 px-3 py-2 text-sm">
          <span className="text-texto-secundario">Rol actual:</span>
          <Badge variante="neutro">{NOMBRE_ROL[usuario.rol]}</Badge>
          {modo === 'cambio' && rolDestino !== usuario.rol ? (
            <>
              <span aria-hidden="true" className="text-texto-tenue">→</span>
              <span className="text-texto-secundario">Nuevo rol:</span>
              <Badge variante="info">{NOMBRE_ROL[rolDestino]}</Badge>
            </>
          ) : null}
        </div>

        <VistaPermisosRol rol={rolDestino} />

        {modo === 'cambio' ? (
          <div className="grid gap-1.5">
            <Label htmlFor="motivo-cambio-rol" obligatorio>Motivo del cambio</Label>
            <Input
              id="motivo-cambio-rol"
              data-testid="motivo-cambio-rol"
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
              <p role="alert" className="text-sm text-peligro-texto" data-testid="dialogo-rol-error">{error}</p>
            ) : null}
          </div>
        ) : error ? (
          <p role="alert" className="text-sm text-peligro-texto" data-testid="dialogo-rol-error">{error}</p>
        ) : null}

        <DialogFooter>
          <Button type="button" variante="contorno" onClick={onCerrar} disabled={ocupado} data-testid="cancelar-cambio-rol">
            Cancelar
          </Button>
          {onIrAPermisos ? (
            <Button type="button" variante="secundario" onClick={onIrAPermisos} disabled={ocupado} data-testid="ir-a-permisos-desde-usuario">
              Editar matriz de permisos
            </Button>
          ) : null}
          {modo === 'cambio' && onConfirmar ? (
            <Button type="button" onClick={() => void confirmar()} disabled={ocupado} data-testid="confirmar-cambio-rol">
              {ocupado ? 'Guardando…' : 'Confirmar cambio'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
