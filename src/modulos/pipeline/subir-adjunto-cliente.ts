'use client';

import {
  confirmarAdjuntoPipelineAccion,
  descartarAdjuntoPipelineAccion,
  prepararAdjuntoPipelineAccion,
} from '@/modulos/pipeline/acciones/agregar-archivo-adjunto';
import { subirArchivoDirecto } from '@/nucleo/almacenamiento/archivos/subida-navegador';

/** Sube un adjunto de la oportunidad directo a Storage (H-B1-29) y lo vincula. */
export function subirAdjuntoPipeline(
  pipelineId: string,
  archivo: File,
  clase?: string,
): Promise<{ ruta: string }> {
  const destino = { pipelineId, nombre: archivo.name, ...(clase ? { clase } : {}) };
  return subirArchivoDirecto(archivo, {
    preparar: () => prepararAdjuntoPipelineAccion({ ...destino, tamano: archivo.size, mime: archivo.type }),
    confirmar: (ruta) => confirmarAdjuntoPipelineAccion({ ...destino, ruta }),
    descartar: (ruta) => descartarAdjuntoPipelineAccion({ ruta }),
  });
}
