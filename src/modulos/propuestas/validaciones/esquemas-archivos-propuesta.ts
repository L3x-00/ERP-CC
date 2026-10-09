import { z } from 'zod';

import {
  esquemaConfirmarArchivoPropuesta,
  esquemaPrepararArchivoPropuesta,
} from '@/modulos/propuestas/validaciones/esquemas-propuestas';

/**
 * C3.1: destino opcional por ítem. Sin `itemId` el archivo cuelga de la
 * cabecera de la revisión (`entidad='propuesta_revision'`, contrato B4.8); con
 * `itemId` cuelga del ítem (`entidad='propuesta_item'`), que es la única forma
 * de documentar un ítem nacido en una revisión B..Z sin tocar el RFQ. La
 * pertenencia del ítem a la revisión no se valida aquí: la comprueba el
 * servidor contra la base al preparar y al confirmar.
 */
const destinoItemPropuesta = { itemId: z.uuid('Identificador de ítem inválido').optional() };

/** Metadatos para preparar la subida directa de un archivo de revisión o de ítem. */
export const esquemaPrepararSubidaArchivoPropuesta =
  esquemaPrepararArchivoPropuesta.extend(destinoItemPropuesta);

/** Confirmación de la subida directa ya completada en Storage. */
export const esquemaConfirmarSubidaArchivoPropuesta =
  esquemaConfirmarArchivoPropuesta.extend(destinoItemPropuesta);

export type PrepararSubidaArchivoPropuestaInput = z.infer<
  typeof esquemaPrepararSubidaArchivoPropuesta
>;
export type ConfirmarSubidaArchivoPropuestaInput = z.infer<
  typeof esquemaConfirmarSubidaArchivoPropuesta
>;
