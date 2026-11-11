'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import {
  Tabla,
  TablaCelda,
  TablaContenedor,
  TablaCuerpo,
  TablaEncabezado,
  TablaEncabezadoCelda,
  TablaFila,
} from '@/compartido/componentes/diseno/tabla';
import { Button } from '@/compartido/componentes/ui/button';
import { Select } from '@/compartido/componentes/ui/input';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';
import { ROLES } from '@/compartido/constantes/indice';
import {
  cambiarEstadoUsuarioAccion,
  cambiarRolUsuarioAccion,
  obtenerUsuariosAccion,
} from '@/modulos/permisos/acciones/indice';
import type { DatosUsuariosAdmin, RolUsuario, UsuarioAdmin } from '@/modulos/permisos/tipos/indice';
import { NOMBRE_ROL } from '@/modulos/permisos/utilidades/matriz';
import { DialogoEstadoUsuario } from './dialogo-estado-usuario';
import { DialogoNuevoUsuario } from './dialogo-nuevo-usuario';
import { DialogoRolUsuario, type ModoDialogoRol } from './dialogo-rol-usuario';

const CLAVE_USUARIOS_ADMIN = ['usuarios', 'admin'] as const;

type DialogoRol = {
  usuario: UsuarioAdmin;
  rolDestino: RolUsuario;
  modo: ModoDialogoRol;
};

/**
 * Administración de usuarios y roles (SII-B1.1, documento §5).
 * Protecciones: nadie se modifica a sí mismo ni se queda el sistema sin admin.
 * UI-04: los cambios se confirman en diálogos del sistema y el rol muestra sus
 * permisos vigentes sin modificar la matriz.
 */
export function PestanaUsuarios({ onIrAPermisos }: { onIrAPermisos?: () => void }) {
  const consulta = useQuery({
    queryKey: CLAVE_USUARIOS_ADMIN,
    queryFn: async (): Promise<DatosUsuariosAdmin> => {
      const respuesta = await obtenerUsuariosAccion();
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'Usuarios ausentes' : respuesta.error);
      }
      return respuesta.datos;
    },
    staleTime: 0,
  });

  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [dialogoRol, setDialogoRol] = useState<DialogoRol | null>(null);
  const [dialogoEstado, setDialogoEstado] = useState<UsuarioAdmin | null>(null);
  // Alta de usuario: botón → modal → rol y permisos → opción de ajustar la matriz.
  const [dialogoNuevo, setDialogoNuevo] = useState(false);

  function abrirCambioRol(usuario: UsuarioAdmin, nuevoRol: string): void {
    if (nuevoRol === usuario.rol) return;
    setError(null);
    setMensaje(null);
    setDialogoRol({ usuario, rolDestino: nuevoRol as RolUsuario, modo: 'cambio' });
  }

  function abrirConsultaRol(usuario: UsuarioAdmin): void {
    setError(null);
    setMensaje(null);
    setDialogoRol({ usuario, rolDestino: usuario.rol, modo: 'consulta' });
  }

  async function confirmarRol(motivo: string): Promise<void> {
    if (!dialogoRol) return;
    setOcupadoId(dialogoRol.usuario.id);
    setError(null);
    const respuesta = await cambiarRolUsuarioAccion({
      usuarioId: dialogoRol.usuario.id,
      rol: dialogoRol.rolDestino,
      motivo,
    });
    setOcupadoId(null);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    setDialogoRol(null);
    setMensaje('Rol actualizado');
    await consulta.refetch();
  }

  async function confirmarEstado(motivo: string): Promise<void> {
    if (!dialogoEstado) return;
    setOcupadoId(dialogoEstado.id);
    setError(null);
    const respuesta = await cambiarEstadoUsuarioAccion({
      usuarioId: dialogoEstado.id,
      activo: !dialogoEstado.activo,
      motivo,
    });
    setOcupadoId(null);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    setDialogoEstado(null);
    setMensaje('Estado actualizado');
    await consulta.refetch();
  }

  if (consulta.isPending) {
    return <SkeletonTabla filas={6} columnas={5} />;
  }

  if (consulta.isError || !consulta.data) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-peligro-texto">
        No se pudo cargar la lista de usuarios.
        <Button variante="contorno" tamano="sm" onClick={() => void consulta.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const usuarios = consulta.data.usuarios;
  const dialogoAbierto = dialogoRol !== null || dialogoEstado !== null || dialogoNuevo;

  return (
    <div className="grid gap-4" data-testid="configuracion-usuarios">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-texto-primario">Usuarios y roles</h2>
          <p className="text-sm text-texto-secundario">
            Cada acción queda auditada con motivo. No puedes modificarte a ti mismo ni dejar el
            sistema sin administrador activo. Los permisos se administran por rol en el apartado
            Permisos.
          </p>
        </div>
        <Button
          tamano="sm"
          onClick={() => {
            setError(null);
            setMensaje(null);
            setDialogoNuevo(true);
          }}
          data-testid="nuevo-usuario"
        >
          Nuevo usuario
        </Button>
      </div>

      {usuarios.length === 0 ? (
        <div className="grid justify-items-start gap-3">
          <EstadoVacio
            titulo="Sin usuarios"
            descripcion="Aún no hay usuarios registrados. Crea el primero y asígnale un rol."
          />
        </div>
      ) : (
      <TablaContenedor>
        <Tabla className="min-w-[720px]">
          <caption className="sr-only">Usuarios del sistema, roles y estado</caption>
          <TablaEncabezado>
            <tr>
              <TablaEncabezadoCelda>Usuario</TablaEncabezadoCelda>
              <TablaEncabezadoCelda>Rol</TablaEncabezadoCelda>
              <TablaEncabezadoCelda>Estado</TablaEncabezadoCelda>
              <TablaEncabezadoCelda><span className="sr-only">Acciones</span></TablaEncabezadoCelda>
            </tr>
          </TablaEncabezado>
          <TablaCuerpo>
            {usuarios.map((usuario) => {
              const esUnoMismo = usuario.id === consulta.data.usuarioActualId;
              const ocupado = ocupadoId === usuario.id;
              return (
                <TablaFila key={usuario.id} data-testid={`usuario-fila-${usuario.id}`}>
                  <TablaCelda>
                    <span className="font-medium text-texto-primario">{usuario.nombreCompleto}</span>
                    <span className="block text-xs text-texto-secundario">{usuario.email}</span>
                  </TablaCelda>
                  <TablaCelda>
                    <Select
                      value={usuario.rol}
                      disabled={esUnoMismo || ocupado}
                      aria-label={`Rol de ${usuario.nombreCompleto}`}
                      data-testid={`select-rol-${usuario.id}`}
                      onChange={(evento) => abrirCambioRol(usuario, evento.target.value)}
                    >
                      {ROLES.map((rol) => (
                        <option key={rol} value={rol}>
                          {NOMBRE_ROL[rol]}
                        </option>
                      ))}
                    </Select>
                  </TablaCelda>
                  <TablaCelda>
                    <BadgeEstado estado={usuario.activo ? 'activo' : 'inactivo'} />
                  </TablaCelda>
                  <TablaCelda>
                    <span className="flex flex-wrap justify-end gap-2">
                      <Button
                        variante="contorno"
                        tamano="sm"
                        onClick={() => abrirConsultaRol(usuario)}
                        data-testid={`ver-permisos-${usuario.id}`}
                      >
                        Ver permisos
                      </Button>
                      <Button
                        variante={usuario.activo ? 'destructivo' : 'contorno'}
                        tamano="sm"
                        disabled={esUnoMismo || ocupado}
                        onClick={() => {
                          setError(null);
                          setMensaje(null);
                          setDialogoEstado(usuario);
                        }}
                        data-testid={`boton-estado-${usuario.id}`}
                      >
                        {usuario.activo ? 'Desactivar' : 'Activar'}
                      </Button>
                    </span>
                  </TablaCelda>
                </TablaFila>
              );
            })}
          </TablaCuerpo>
        </Tabla>
      </TablaContenedor>
      )}

      {dialogoNuevo ? (
        <DialogoNuevoUsuario
          onCerrar={() => {
            setDialogoNuevo(false);
            setError(null);
          }}
          onCreado={(usuario) => {
            setMensaje(`Usuario ${usuario.email} creado con rol ${NOMBRE_ROL[usuario.rol]}.`);
            void consulta.refetch();
          }}
          {...(onIrAPermisos ? { onIrAPermisos } : {})}
        />
      ) : null}

      {dialogoRol ? (
        <DialogoRolUsuario
          usuario={dialogoRol.usuario}
          rolDestino={dialogoRol.rolDestino}
          modo={dialogoRol.modo}
          onCerrar={() => {
            setDialogoRol(null);
            setError(null);
          }}
          {...(dialogoRol.modo === 'cambio' ? { onConfirmar: confirmarRol } : {})}
          {...(onIrAPermisos
            ? {
                onIrAPermisos: () => {
                  setDialogoRol(null);
                  onIrAPermisos();
                },
              }
            : {})}
          ocupado={ocupadoId === dialogoRol.usuario.id}
          error={error}
        />
      ) : null}

      {dialogoEstado ? (
        <DialogoEstadoUsuario
          usuario={dialogoEstado}
          onCerrar={() => {
            setDialogoEstado(null);
            setError(null);
          }}
          onConfirmar={confirmarEstado}
          ocupado={ocupadoId === dialogoEstado.id}
          error={error}
        />
      ) : null}

      {mensaje ? (
        <p role="status" className="text-sm text-exito-texto" data-testid="usuarios-confirmacion">
          {mensaje}
        </p>
      ) : null}
      {error && !dialogoAbierto ? (
        <p role="alert" className="text-sm text-peligro-texto" data-testid="usuarios-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
