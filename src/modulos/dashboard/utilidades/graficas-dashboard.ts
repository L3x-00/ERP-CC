import type {
  GastoPorCategoriaDashboard,
  PipelinePorEtapa,
  ResumenAgingContador,
  ResumenOrdenesDashboard,
} from '@/modulos/dashboard/tipos/indice';

/** Dato plano que una gráfica puede presentar sin reinterpretar la métrica. */
export interface DatoGraficaDashboard {
  id: string;
  etiqueta: string;
  valor: number;
}

const ETAPAS_PIPELINE: readonly [keyof PipelinePorEtapa, string][] = [
  ['prospecto', 'Prospecto'],
  ['contactado', 'Contactado'],
  ['cotizado', 'Cotizado'],
  ['negociacion', 'Negociación'],
  ['ganada', 'Ganada'],
  ['perdida', 'Perdida'],
];

const ETIQUETAS_GASTO: Record<string, string> = {
  materia_prima: 'Materia prima',
  consumibles: 'Consumibles',
  herramentental: 'Herramental',
  maquila_externa: 'Maquila externa',
  logistica: 'Logística',
  servicios_generales: 'Servicios generales',
  nomina: 'Nómina',
  mantenimiento: 'Mantenimiento',
  otros: 'Otros',
};

/** Conserva las seis etapas autorizadas, incluso cuando una tenga valor cero. */
export function crearSeriePipelineDashboard(pipeline: PipelinePorEtapa): DatoGraficaDashboard[] {
  return ETAPAS_PIPELINE.map(([id, etiqueta]) => ({ id, etiqueta, valor: pipeline[id] }));
}

/** Resumen operativo; no agrega estados ni deduce severidades nuevas. */
export function crearSerieOrdenesDashboard(ordenes: ResumenOrdenesDashboard): DatoGraficaDashboard[] {
  return [
    { id: 'aprobaciones-pendientes', etiqueta: 'Aprobaciones pendientes', valor: ordenes.aprobacionesPendientes },
    { id: 'activas', etiqueta: 'Órdenes activas', valor: ordenes.activas },
    { id: 'atrasadas', etiqueta: 'Órdenes atrasadas', valor: ordenes.atrasadas },
    { id: 'en-riesgo', etiqueta: 'En riesgo (3 días)', valor: ordenes.enRiesgo },
    { id: 'completadas', etiqueta: 'Completadas', valor: ordenes.completadas },
  ];
}

/** Distribución monetaria de gastos tal como llega de la consulta autorizada. */
export function crearSerieGastoDashboard(
  distribucion: readonly GastoPorCategoriaDashboard[],
): DatoGraficaDashboard[] {
  return distribucion.map(({ categoria, montoMxn }) => ({
    id: categoria,
    etiqueta: ETIQUETAS_GASTO[categoria] ?? categoria,
    valor: montoMxn,
  }));
}

/** Mantiene todos los rangos para que el detalle de cobranza siga íntegro. */
export function crearSerieAgingDashboard(aging: ResumenAgingContador): DatoGraficaDashboard[] {
  return [
    { id: 'alCorriente', etiqueta: 'Corriente', valor: aging.corrienteMxn },
    { id: 'de1A30Dias', etiqueta: '1–30 días', valor: aging.unoTreintaMxn },
    { id: 'de31A60Dias', etiqueta: '31–60 días', valor: aging.treintaSesentaMxn },
    { id: 'de61A90Dias', etiqueta: '61–90 días', valor: aging.sesentaNoventaMxn },
    { id: 'masDe90Dias', etiqueta: 'Más de 90 días', valor: aging.mayorNoventaMxn },
  ];
}

export { ETIQUETAS_GASTO };
