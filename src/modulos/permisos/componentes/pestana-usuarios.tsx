'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
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
import type { DatosUsuariosAdmin, UsuarioAdmin } from '@/modulos/permisos/tipos/indice';
import { NOMBRE_ROL } from '@/modulos/permisos/utilidades/matriz';

const CLAVE_USUARIOS_ADMIN = ['usuarios', 'admin'] as const;

function pedirMotivo(accion: string): string | null {
  const motivo = window.prompt(`Motivo para ${accion} (obligatorio, mín. 3 caracteres):`);
  if (motivo === null) return null;
  const limpio = motivo.trim();
  if (limpio.length < 3) {
    window.alert('El motivo es obligatorio (mínimo 3 caracteres).');
    return null;
  }
  return limpio;
}

/**
 * Administración de usuarios y roles (SII-B1.1, documento §5).
 * Protecciones: nadie se modifica a sí mismo ni se queda el sistema sin admin.
 */
export function PestanaUsuarios() {
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

  async function cambiarRol(usuario: UsuarioAdmin, nuevoRol: string): Promise<void> {
    if (nuevoRol === usuario.rol) return;
    const motivo = pedirMotivo(`cambiar el rol de ${usuario.nombreCompleto}`);
    if (!motivo) return;
    setOcupadoId(usuario.id);
    setError(null);
    setMensaje(null);
    const respuesta = await cambiarRolUsuarioAccion({
      usuarioId: usuario.id,
      rol: nuevoRol,
      motivo,
    });
    setOcupadoId(null);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    setMensaje('Rol actualizado');
    await consulta.refetch();
  }

  async function alternarEstado(usuario: UsuarioAdmin): Promise<void> {
    const accion = usuario.activo ? 'desactivar' : 'activar';
    if (!window.confirm(`¿${accion[0].toUpperCase()}${accion.slice(1)} a ${usuario.nombreCompleto}?`)) {
      return;
    }
    const motivo = pedirMotivo(`${accion} a ${usuario.nombreCompleto}`);
    if (!motivo) return;
    setOcupadoId(usuario.id);
    setError(null);
    setMensaje(null);
    const respuesta = await cambiarEstadoUsuarioAccion({
      usuarioId: usuario.id,
      activo: !usuario.activo,
      motivo,
    });
    setOcupadoId(null);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    setMensaje('Estado actualizado');
    await consulta.refetch();
  }

  if (consulta.isPending) {
    return <SkeletonTabla filas={6} columnas={4} />;
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

  if (consulta.data.usuarios.length === 0) {
    return <EstadoVacio titulo="Sin usuarios" descripcion="No hay usuarios registrados." />;
  }

  return (
    <div className="grid gap-4" data-testid="configuracion-usuarios">
      <div>
        <h2 className="text-lg font-semibold text-texto-primario">Usuarios y roles</h2>
        <p className="text-sm text-texto-secundario">
          Cada acción queda auditada con motivo. No puedes modificarte a ti mismo ni dejar el
          sistema sin administrador activo.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-borde">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-superficie-2 text-left text-texto-secundario">
              <th scope="col" className="px-4 py-3 font-semibold">Usuario</th>
              <th scope="col" className="px-4 py-3 font-semibold">Rol</th>
              <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {consulta.data.usuarios.map((usuario) => {
              const esUnoMismo = usuario.id === consulta.data.usuarioActualId;
              const ocupado = ocupadoId === usuario.id;
              return (
                <tr key={usuario.id} className="border-t border-borde" data-testid={`usuario-fila-${usuario.id}`}>
                  <td className="px-4 py-3">
                    <span className="font-medium text-texto-primario">{usuario.nombreCompleto}</span>
                    <span className="block text-xs text-texto-secundario">{usuario.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={usuario.rol}
                      disabled={esUnoMismo || ocupado}
                      aria-label={`Rol de ${usuario.nombreCompleto}`}
                      data-testid={`select-rol-${usuario.id}`}
                      onChange={(evento) => void cambiarRol(usuario, evento.target.value)}
                    >
                      {ROLES.map((rol) => (
                        <option key={rol} value={rol}>
                          {NOMBRE_ROL[rol]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <BadgeEstado estado={usuario.activo ? 'activo' : 'inactivo'} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variante={usuario.activo ? 'destructivo' : 'contorno'}
                      tamano="sm"
                      disabled={esUnoMismo || ocupado}
                      onClick={() => void alternarEstado(usuario)}
                      data-testid={`boton-estado-${usuario.id}`}
                    >
                      {usuario.activo ? 'Desactivar' : 'Activar'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {mensaje ? (
        <p role="status" className="text-sm text-exito-texto" data-testid="usuarios-confirmacion">
          {mensaje}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-peligro-texto" data-testid="usuarios-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
