'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';
import { obtenerDatosEmpresaAccion } from '@/modulos/configuracion/acciones/indice';
import { CLAVE_CONFIGURACION } from './claves-consulta';
import { PestanaEmpresa } from './pestana-empresa';

const CLAVE_EMPRESA_MENU = ['configuracion', 'empresa-menu'] as const;

/**
 * UI-02: los datos de empresa se consultan y editan desde el menú de usuario.
 * Reutiliza el formulario existente y conserva la acción y validaciones actuales.
 */
export function DialogoDatosEmpresa({
  abierto,
  alCambiarAbierto,
}: {
  abierto: boolean;
  alCambiarAbierto: (abierto: boolean) => void;
}) {
  const clienteQuery = useQueryClient();
  const consulta = useQuery({
    queryKey: CLAVE_EMPRESA_MENU,
    queryFn: async () => {
      const respuesta = await obtenerDatosEmpresaAccion();
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'Datos de empresa ausentes' : respuesta.error);
      }
      return respuesta.datos;
    },
    enabled: abierto,
    staleTime: 30_000,
  });

  return (
    <Dialog open={abierto} onOpenChange={alCambiarAbierto}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Datos de empresa</DialogTitle>
          <DialogDescription>
            Información fiscal y de contacto que aparece en documentos y propuestas.
          </DialogDescription>
        </DialogHeader>

        {consulta.isPending ? (
          <div className="grid gap-3" aria-busy="true" aria-label="Cargando datos de empresa">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}

        {consulta.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-peligro-texto">
            No se pudieron cargar los datos de empresa.
            <Button variante="contorno" tamano="sm" onClick={() => void consulta.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : null}

        {consulta.data ? (
          <PestanaEmpresa
            key={`empresa-menu-${consulta.dataUpdatedAt}`}
            datos={consulta.data}
            onGuardado={(configuracion) => {
              clienteQuery.setQueryData(CLAVE_EMPRESA_MENU, configuracion.empresa);
              void clienteQuery.invalidateQueries({ queryKey: CLAVE_CONFIGURACION });
              alCambiarAbierto(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
