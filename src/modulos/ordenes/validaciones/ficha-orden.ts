import { z } from 'zod';

import { PESTANAS_FICHA } from '@/modulos/ordenes/tipos/ficha-orden';

/** `?pestana=` de /ordenes/[id]: un valor desconocido se ignora, no rompe la ficha. */
export const esquemaPestanaFicha = z.enum(PESTANAS_FICHA);

/** `?ordenId=` de los enlaces profundos antiguos hacia /ordenes. */
export const esquemaIdOrdenEnlace = z.uuid();
