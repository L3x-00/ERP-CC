import { z } from 'zod';

const esquemaIdEnlace = z.uuid();

/** Ruta del RFQ de origen; `/rfq` lee `?rfq=<id>`. Un id que no es uuid no arma enlace. */
export function enlaceRfqOrigen(rfqId: string | null | undefined): string | null {
  const id = esquemaIdEnlace.safeParse(rfqId);
  return id.success ? `/rfq?rfq=${id.data}` : null;
}

/** Ruta de la propuesta (y su revisión aceptada); `/propuestas` lee `?propuesta=<id>`. */
export function enlacePropuestaOrigen(propuestaId: string | null | undefined): string | null {
  const id = esquemaIdEnlace.safeParse(propuestaId);
  return id.success ? `/propuestas?propuesta=${id.data}` : null;
}
