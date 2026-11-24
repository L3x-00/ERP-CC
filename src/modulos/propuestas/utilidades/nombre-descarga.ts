import { sanearNombreArchivo } from '@/nucleo/almacenamiento/archivos/validaciones';

/** Nombre legible de descarga: el explícito gana; si no, el guardado saneado. */
export function nombreDescargaEfectivo(
  descarga: string | undefined,
  nombreOriginal: string | null | undefined,
): string | undefined {
  if (descarga) return sanearNombreArchivo(descarga);
  return nombreOriginal ? sanearNombreArchivo(nombreOriginal) : undefined;
}
