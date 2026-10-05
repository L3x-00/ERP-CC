'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';
import type { RolUsuario } from '@/modulos/autenticacion/tipos/indice';
import {
  actualizarPermisosRolAccion,
  obtenerMatrizPermisosAccion,
} from '@/modulos/permisos/acciones/indice';
import type { MatrizPermisos } from '@/modulos/permisos/tipos/indice';
import {
  agruparPermisosPorModulo,
  hayCambios,
  normalizarSeleccion,
  NOMBRE_ROL,
  ROLES_EDITABLES,
} from '@/modulos/permisos/utilidades/matriz';

/** Clave de caché de la matriz administrativa. */
const CLAVE_MATRIZ_PERMISOS = ['permisos', 'matriz'] as const;

/** Columnas visibles: roles editables + admin informativo (siempre completo). */
const COLUMNAS: RolUsuario[] = [...ROLES_EDITABLES, 'admin'];

function copiarAsignaciones(
  asignaciones: Record<RolUsuario, string[]>,
): Record<RolUsuario, string[]> {
  return {
    admin: [...asignaciones.admin],
    vendedor: [...asignaciones.vendedor],
    gerente: [...asignaciones.gerente],
    contador: [...asignaciones.contador],
    operador: [...asignaciones.operador],
  };
}

/**
 * Matriz rol × permiso por acción (SII-B1.2, documento §5).
 * El rol admin es inmutable por diseño (`can()` siempre concede).
 */
export function PestanaPermisos() {
  const clienteQuery = useQueryClient();
  const consulta = useQuery({
    queryKey: CLAVE_MATRIZ_PERMISOS,
    queryFn: async (): Promise<MatrizPermisos> => {
      const respuesta = await obtenerMatrizPermisosAccion();
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'Matriz ausente' : respuesta.error);
      }
      return respuesta.datos;
    },
    staleTime: 0,
  });

  const [seleccion, setSeleccion] = useState<Record<RolUsuario, string[]> | null>(null);
  const [baseSincronizada, setBaseSincronizada] = useState<MatrizPermisos | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Patrón React de estado derivado: al llegar datos nuevos (carga o refetch
  // tras guardar), se reinicia el borrador durante el render, sin efectos.
  if (consulta.data && consulta.data !== baseSincronizada) {
    setBaseSincronizada(consulta.data);
    setSeleccion(copiarAsignaciones(consulta.data.asignaciones));
    setMensaje(null);
    setError(null);
  }

  const grupos = useMemo(
    () => agruparPermisosPorModulo(consulta.data?.permisos ?? []),
    [consulta.data],
  );

  const rolesConCambios = useMemo(() => {
    if (!consulta.data || !seleccion) return [];
    return ROLES_EDITABLES.filter((rol) =>
      hayCambios(consulta.data.asignaciones[rol], seleccion[rol]),
    );
  }, [consulta.data, seleccion]);

  function alternar(rol: RolUsuario, codigo: string): void {
    setSeleccion((actual) => {
      if (!actual) return actual;
      const codigos = new Set(actual[rol]);
      if (codigos.has(codigo)) {
        codigos.delete(codigo);
      } else {
        codigos.add(codigo);
      }
      return { ...actual, [rol]: Array.from(codigos) };
    });
    setMensaje(null);
  }

  async function guardar(): Promise<void> {
    if (!seleccion || rolesConCambios.length === 0) return;
    setOcupado(true);
    setError(null);
    setMensaje(null);
    const fallos: string[] = [];
    for (const rol of rolesConCambios) {
      const respuesta = await actualizarPermisosRolAccion({
        rol,
        permisos: normalizarSeleccion(seleccion[rol]),
      });
      if (!respuesta.exito) {
        fallos.push(`${NOMBRE_ROL[rol]}: ${respuesta.error}`);
      }
    }
    setOcupado(false);
    if (fallos.length > 0) {
      setError(fallos.join(' · '));
      return;
    }
    setMensaje('Permisos guardados');
    await clienteQuery.invalidateQueries({ queryKey: CLAVE_MATRIZ_PERMISOS });
  }

  function descartar(): void {
    if (!consulta.data) return;
    setSeleccion(copiarAsignaciones(consulta.data.asignaciones));
    setMensaje(null);
    setError(null);
  }

  if (consulta.isPending) {
    return <SkeletonTabla filas={10} columnas={5} />;
  }

  if (consulta.isError || !consulta.data || !seleccion) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-peligro-texto">
        No se pudo cargar la matriz de permisos.
        <Button variante="contorno" tamano="sm" onClick={() => void consulta.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (consulta.data.permisos.length === 0) {
    return (
      <EstadoVacio
        titulo="Catálogo vacío"
        descripcion="No hay permisos registrados en el catálogo."
      />
    );
  }

  return (
    <div className="grid gap-4" data-testid="matriz-permisos">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-texto-primario">Matriz de permisos</h2>
          <p className="text-sm text-texto-secundario">
            Los permisos se aplican en el servidor. Admin siempre tiene todos; Operador nunca ve
            precios.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variante="contorno"
            tamano="lg"
            disabled={ocupado || rolesConCambios.length === 0}
            onClick={descartar}
            data-testid="descartar-permisos"
          >
            Descartar
          </Button>
          <Button
            tamano="lg"
            disabled={ocupado || rolesConCambios.length === 0}
            onClick={() => void guardar()}
            data-testid="guardar-permisos"
          >
            {ocupado ? 'Guardando…' : `Guardar cambios${rolesConCambios.length ? ` (${rolesConCambios.length})` : ''}`}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-borde">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-superficie-2 text-left text-texto-secundario">
              <th scope="col" className="px-4 py-3 font-semibold">Permiso</th>
              {COLUMNAS.map((rol) => (
                <th key={rol} scope="col" className="px-3 py-3 text-center font-semibold">
                  {NOMBRE_ROL[rol]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupos.map((grupo) => (
              <Fragment key={grupo.modulo}>
                <tr className="bg-superficie-2/60">
                  <th
                    scope="colgroup"
                    colSpan={COLUMNAS.length + 1}
                    className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-texto-secundario"
                  >
                    {grupo.modulo}
                  </th>
                </tr>
                {grupo.permisos.map((permiso) => (
                  <tr key={permiso.codigo} className="border-t border-borde" data-testid={`fila-permiso-${permiso.codigo}`}>
                    <td className="px-4 py-2">
                      <span className="font-medium text-texto-primario">{permiso.descripcion}</span>
                      <span className="block text-xs text-texto-secundario">{permiso.codigo}</span>
                    </td>
                    {COLUMNAS.map((rol) => {
                      const esAdmin = rol === 'admin';
                      const marcado = esAdmin ? true : seleccion[rol].includes(permiso.codigo);
                      return (
                        <td key={rol} className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-acento"
                            checked={marcado}
                            disabled={esAdmin || !permiso.activo || ocupado}
                            onChange={() => alternar(rol, permiso.codigo)}
                            aria-label={`${NOMBRE_ROL[rol]}: ${permiso.descripcion}`}
                            data-testid={`check-${rol}-${permiso.codigo}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {mensaje ? (
        <p role="status" className="text-sm text-exito-texto" data-testid="permisos-confirmacion">
          {mensaje}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-peligro-texto" data-testid="permisos-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
