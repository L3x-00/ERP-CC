import { z } from 'zod';
import { PERIODOS_DASHBOARD } from '@/modulos/dashboard/tipos/dashboard';

const MAXIMO_DIAS_DASHBOARD = 366;

/** Filtro externo del dashboard; el servidor transforma este intervalo a UTC. */
export const esquemaFiltroPeriodo = z
  .object({
    fechaInicio: z.iso.datetime({
      offset: true,
      message: 'La fecha inicial debe ser ISO 8601',
    }),
    fechaFin: z.iso.datetime({
      offset: true,
      message: 'La fecha final debe ser ISO 8601',
    }),
    periodoTipo: z.enum(PERIODOS_DASHBOARD),
  })
  .strict()
  .superRefine((datos, contexto) => {
    const inicio = Date.parse(datos.fechaInicio);
    const fin = Date.parse(datos.fechaFin);
    if (!Number.isFinite(inicio) || !Number.isFinite(fin) || inicio >= fin) {
      contexto.addIssue({
        code: 'custom',
        path: ['fechaFin'],
        message: 'La fecha final debe ser posterior a la inicial',
      });
      return;
    }
    const dias = (fin - inicio) / 86_400_000;
    if (dias > MAXIMO_DIAS_DASHBOARD) {
      contexto.addIssue({
        code: 'custom',
        path: ['fechaFin'],
        message: `El periodo no puede exceder ${MAXIMO_DIAS_DASHBOARD} días`,
      });
    }
  });

export const esquemaCambiarPeriodoDashboard = esquemaFiltroPeriodo;
export type FiltroPeriodoDashboardInput = z.infer<typeof esquemaFiltroPeriodo>;
export type CambiarPeriodoDashboardInput = FiltroPeriodoDashboardInput;
