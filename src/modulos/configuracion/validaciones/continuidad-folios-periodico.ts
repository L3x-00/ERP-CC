import { z } from 'zod';

import { TIPOS_FOLIO_PERIODICO } from '@/modulos/configuracion/tipos/continuidad-folios-periodico';

/** Periodo `MMYY` (mes 01-12 + dos dígitos de año), igual que la RPC. */
export const PERIODO_FOLIO = /^(0[1-9]|1[0-2])[0-9]{2}$/;

export const esquemaConsultarContinuidadPeriodico = z
  .object({ tipo: z.enum(TIPOS_FOLIO_PERIODICO) })
  .strict();

export const esquemaAjustarContinuidadPeriodico = z
  .object({
    tipo: z.enum(TIPOS_FOLIO_PERIODICO),
    periodo: z.string().regex(PERIODO_FOLIO, 'El periodo debe ser MMAA'),
    ultimo: z
      .number({ message: 'El último folio debe ser numérico' })
      .int('El último folio debe ser entero')
      .min(0, 'El último folio no puede ser negativo')
      .max(99, 'El último folio no puede superar 99'),
  })
  .strict();

export type ConsultarContinuidadPeriodicoInput = z.infer<typeof esquemaConsultarContinuidadPeriodico>;
export type AjustarContinuidadPeriodicoInput = z.infer<typeof esquemaAjustarContinuidadPeriodico>;
