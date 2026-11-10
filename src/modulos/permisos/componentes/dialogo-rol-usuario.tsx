'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

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
import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';
import { obtenerMatrizPermisosAccion } from '@/modulos/permisos/acciones/indice';
import type { MatrizPermisos, RolUsuario, UsuarioAdmin } from '@/modulos/permisos/tipos/indice';
import { agruparPermisosPorModulo, NOMBRE_ROL } from '@/modulos/permisos/utilidades/matriz';

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
  const consulta = useQuery({
    queryKey: ['permisos', 'matriz'],
    queryFn: async (): Promise<MatrizPermisos> => {
      const respuesta = await obtenerMatrizPermisosAccion();
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'Matriz ausente' : respuesta.error);
      }
      return respuesta.datos;
    },
    staleTime: 60_000,
  });

  const grupos = agruparPermisosPorModulo(consulta.data?.permisos ?? []);
  const asignados = new Set(consulta.data?.asignaciones[rolDestino] ?? []);

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

        <section className="grid gap-2" aria-label={`Permisos del rol ${NOMBRE_ROL[rolDestino]}`} data-testid="preview-permisos-rol">
          <p className="text-sm font-medium text-texto-primario">
            Permisos de {NOMBRE_ROL[rolDestino]}
          </p>
          {consulta.isPending ? (
            <div className="grid gap-2" aria-busy="true" aria-label="Cargando permisos del rol">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : null}
          {consulta.isError ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-peligro-texto">
              No se pudieron cargar los permisos del rol.
              <Button variante="contorno" tamano="sm" onClick={() => void consulta.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : null}
          {consulta.data ? (
            <div className="max-h-64 overflow-y-auto rounded-md border border-borde">
              {grupos.map((grupo) => (
                <div key={grupo.modulo} className="border-t border-borde first:border-t-0">
                  <p className="bg-superficie-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-texto-secundario">
                    {grupo.modulo}
                  </p>
                  <ul className="grid gap-1 px-3 py-2">
                    {grupo.permisos.map((permiso) => (
                      <li key={permiso.codigo} className="flex items-start justify-between gap-3 text-sm">
                        <span className="text-texto-primario">{permiso.descripcion}</span>
                        <Badge variante={asignados.has(permiso.codigo) ? 'exito' : 'neutro'}>
                          {asignados.has(permiso.codigo) ? 'Sí' : 'No'}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </section>

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
