'use client';

import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';
import { obtenerMatrizPermisosAccion } from '@/modulos/permisos/acciones/indice';
import type { MatrizPermisos, RolUsuario } from '@/modulos/permisos/tipos/indice';
import { agruparPermisosPorModulo, NOMBRE_ROL } from '@/modulos/permisos/utilidades/matriz';

/**
 * Vista informativa de los permisos vigentes de un rol. La comparten el alta de
 * usuario y el cambio/consulta de rol: ambas muestran exactamente lo que el rol
 * concede hoy, sin modificar la matriz (que se edita en el apartado Permisos).
 */
export function VistaPermisosRol({ rol }: { rol: RolUsuario }) {
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
  const asignados = new Set(consulta.data?.asignaciones[rol] ?? []);

  return (
    <section
      className="grid gap-2"
      aria-label={`Permisos del rol ${NOMBRE_ROL[rol]}`}
      data-testid="preview-permisos-rol"
    >
      <p className="text-sm font-medium text-texto-primario">Permisos de {NOMBRE_ROL[rol]}</p>
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
                  <li
                    key={permiso.codigo}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
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
  );
}
