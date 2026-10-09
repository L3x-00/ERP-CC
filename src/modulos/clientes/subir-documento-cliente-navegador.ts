'use client';

import {
  confirmarDocumentoClienteAccion,
  descartarDocumentoClienteAccion,
  prepararDocumentoClienteAccion,
} from '@/modulos/clientes/acciones/subir-documento-cliente';
import type { SubirDocumentoInput } from '@/modulos/clientes/validaciones/cliente-schema';
import { subirArchivoDirecto } from '@/nucleo/almacenamiento/archivos/subida-navegador';
import { validarSubidaArchivo } from '@/nucleo/almacenamiento/archivos/validaciones';

/**
 * Sube un documento del cliente directo a Storage (H-B1-29) y lo registra.
 * `nombreErp` conserva la clave de versionado al reemplazar (SII-B2.6).
 */
export function subirDocumentoCliente(
  destino: { clienteId: string; tipo: SubirDocumentoInput['tipo']; nombreErp?: string },
  archivo: File,
): Promise<{ id: string }> {
  const validacion = validarSubidaArchivo('cliente', { nombre: archivo.name, tamano: archivo.size });
  if (!validacion.ok) return Promise.reject(new Error(validacion.error));
  const datos = { ...destino, nombreArchivo: archivo.name };
  return subirArchivoDirecto(archivo, {
    preparar: () =>
      prepararDocumentoClienteAccion({ ...datos, tamano: archivo.size, mime: archivo.type }),
    confirmar: (ruta) => confirmarDocumentoClienteAccion({ ...datos, ruta }),
    descartar: (ruta) => descartarDocumentoClienteAccion({ ruta }),
  });
}
