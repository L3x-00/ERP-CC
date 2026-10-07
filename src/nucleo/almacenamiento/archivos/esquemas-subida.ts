import { z } from 'zod';

/**
 * Campos comunes del contrato de subida directa (H-B1-29). El navegador declara
 * metadatos al preparar y devuelve la ruta emitida al confirmar o descartar; el
 * servidor revalida todo contra el objeto real, así que aquí solo se acota forma.
 */
export const camposPrepararSubida = {
  tamano: z.number().int().positive(),
  mime: z.string().max(150),
};

export const campoRutaSubida = { ruta: z.string().min(1).max(300) };

export const esquemaDescartarSubida = z.object(campoRutaSubida).strict();
