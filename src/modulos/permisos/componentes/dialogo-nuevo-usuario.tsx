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
import { Input, Select } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { ROLES } from '@/compartido/constantes/indice';
import { crearUsuarioAccion } from '@/modulos/permisos/acciones/indice';
import type { RolUsuario } from '@/modulos/permisos/tipos/indice';
import { NOMBRE_ROL } from '@/modulos/permisos/utilidades/matriz';
import { VistaPermisosRol } from './vista-permisos-rol';

type Creado = { email: string; rol: RolUsuario };

/**
 * Alta de usuario (Configuración → Personas y accesos → Usuarios).
 *
 * Flujo definido: el botón «Nuevo usuario» abre este modal, se capturan nombre,
 * correo, contraseña y rol, y el modal muestra desde ese momento los permisos
 * que concede el rol elegido. Al crear la cuenta, el mismo modal confirma el
 * alta y ofrece pasar al apartado Permisos para ajustar la matriz del rol.
 */
export function DialogoNuevoUsuario({
  onCerrar,
  onCreado,
  onIrAPermisos,
}: {
  onCerrar: () => void;
  onCreado?: (usuario: Creado) => void;
  onIrAPermisos?: () => void;
}) {
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<RolUsuario>('vendedor');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<Creado | null>(null);

  async function crear(): Promise<void> {
    setOcupado(true);
    setError(null);
    const respuesta = await crearUsuarioAccion({ nombreCompleto, email, password, rol });
    setOcupado(false);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    const alta = { email: email.trim().toLowerCase(), rol };
    setCreado(alta);
    setPassword('');
    onCreado?.(alta);
  }

  return (
    <Dialog open onOpenChange={(abierto) => (!abierto && !ocupado ? onCerrar() : undefined)}>
      <DialogContent data-testid="dialogo-nuevo-usuario" className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {creado ? 'Usuario creado' : 'Nuevo usuario'}
          </DialogTitle>
          <DialogDescription>
            {creado
              ? 'La cuenta ya puede iniciar sesión. Sus permisos son los del rol asignado; puedes ajustarlos en la matriz.'
              : 'Crea la cuenta y elige su rol. Los permisos se administran por rol: abajo ves exactamente los que concede el rol seleccionado.'}
          </DialogDescription>
        </DialogHeader>

        {creado ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-superficie-2 px-3 py-2 text-sm">
              <span className="font-medium text-texto-primario">{creado.email}</span>
              <Badge variante="info">{NOMBRE_ROL[creado.rol]}</Badge>
            </div>
            <VistaPermisosRol rol={creado.rol} />
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="nuevo-usuario-nombre" obligatorio>
                Nombre completo
              </Label>
              <Input
                id="nuevo-usuario-nombre"
                data-testid="nuevo-usuario-nombre"
                value={nombreCompleto}
                onChange={(evento) => setNombreCompleto(evento.target.value)}
                autoComplete="off"
                maxLength={120}
                disabled={ocupado}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="nuevo-usuario-email" obligatorio>
                Correo electrónico
              </Label>
              <Input
                id="nuevo-usuario-email"
                data-testid="nuevo-usuario-email"
                type="email"
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                autoComplete="off"
                maxLength={200}
                disabled={ocupado}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="nuevo-usuario-password" obligatorio>
                Contraseña inicial
              </Label>
              <Input
                id="nuevo-usuario-password"
                data-testid="nuevo-usuario-password"
                type="password"
                value={password}
                onChange={(evento) => setPassword(evento.target.value)}
                autoComplete="new-password"
                maxLength={72}
                disabled={ocupado}
              />
              <p className="text-xs text-texto-secundario">
                Mínimo 8 caracteres. Compártela con la persona por un canal seguro; puede cambiarla
                después.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="nuevo-usuario-rol" obligatorio>
                Rol
              </Label>
              <Select
                id="nuevo-usuario-rol"
                data-testid="nuevo-usuario-rol"
                value={rol}
                onChange={(evento) => setRol(evento.target.value as RolUsuario)}
                disabled={ocupado}
              >
                {ROLES.map((opcion) => (
                  <option key={opcion} value={opcion}>
                    {NOMBRE_ROL[opcion]}
                  </option>
                ))}
              </Select>
            </div>

            <VistaPermisosRol rol={rol} />

            {error ? (
              <p role="alert" className="text-sm text-peligro-texto" data-testid="nuevo-usuario-error">
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {creado ? (
            <>
              <Button
                type="button"
                variante="contorno"
                onClick={onCerrar}
                data-testid="cerrar-nuevo-usuario"
              >
                Cerrar
              </Button>
              {onIrAPermisos ? (
                <Button
                  type="button"
                  onClick={() => {
                    onCerrar();
                    onIrAPermisos();
                  }}
                  data-testid="ir-a-permisos-desde-alta"
                >
                  Ajustar permisos del rol
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Button
                type="button"
                variante="contorno"
                onClick={onCerrar}
                disabled={ocupado}
                data-testid="cancelar-nuevo-usuario"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => void crear()}
                disabled={ocupado}
                data-testid="confirmar-nuevo-usuario"
              >
                {ocupado ? 'Creando…' : 'Crear usuario'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
