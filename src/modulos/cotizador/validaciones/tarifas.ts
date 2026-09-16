import { z } from 'zod';

/**
 * Catálogo central de tarifas por estación del cotizador. Es la fuente de la
 * que el cotizador precarga sus tarifas: al cambiar una tarifa aquí, las
 * cotizaciones NUEVAS reflejan el cambio, mientras que las cotizaciones ya
 * calculadas conservan su instantánea (`entrada.*.tarifas`) y no se recalculan.
 *
 * El motor de cálculo (`calcular-cotizacion-tecnica.ts`) sigue recibiendo las
 * tarifas dentro de cada estación de la entrada; este catálogo solo alimenta
 * los valores por defecto del formulario, que el usuario todavía puede ajustar
 * por cotización.
 */

const costo = z.number().finite().nonnegative();
const positivo = z.number().finite().positive();

/** Materiales con tiempos de perforación configurables; coinciden con el selector del cotizador. */
export const MATERIALES_COTIZADOR = ['Acero al carbono', 'Acero inoxidable', 'Aluminio', 'Otro'] as const;
export type MaterialCotizador = (typeof MATERIALES_COTIZADOR)[number];

const tiemposPerforacion = z
  .object({ hasta3Mm: costo, hasta6Mm: costo, mayor6Mm: costo })
  .strict();

export const esquemaCatalogoTarifas = z
  .object({
    laser: z
      .object({
        maquinaHora: costo,
        preparacionHora: costo,
        consumoGasHora: costo,
        gas: z.object({ O2: costo, N2: costo, aire: costo }).strict(),
        segundosPerforacion: z
          .object({
            'Acero al carbono': tiemposPerforacion,
            'Acero inoxidable': tiemposPerforacion,
            Aluminio: tiemposPerforacion,
            Otro: tiemposPerforacion,
          })
          .strict(),
      })
      .strict(),
    router: z
      .object({ maquinaHora: costo, preparacionHora: costo, endmill: costo, ballnose: costo })
      .strict(),
    doblado: z
      .object({
        maquinaHora: costo,
        preparacionHora: costo,
        segundoOperarioHora: costo,
        longitudMaximaMm: positivo,
        factorLongitudMaxima: costo.max(1),
        piezasHora: z.object({ simple: positivo, media: positivo, compleja: positivo }).strict(),
      })
      .strict(),
    fabricacion: z
      .object({ manoObraHora: costo, soldaduraHora: costo, consumiblesHora: costo, acabadoHora: costo })
      .strict(),
  })
  .strict();

export type CatalogoTarifasCotizador = z.infer<typeof esquemaCatalogoTarifas>;
