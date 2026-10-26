import { describe, expect, it } from 'vitest';
import {
  crearSerieAgingDashboard,
  crearSerieGastoDashboard,
  crearSerieOrdenesDashboard,
  crearSeriePipelineDashboard,
} from '@/modulos/dashboard/utilidades/graficas-dashboard';

describe('series visuales del dashboard', () => {
  it('conserva cada etapa y su conteo, incluidos los ceros', () => {
    expect(crearSeriePipelineDashboard({
      prospecto: 4,
      contactado: 0,
      cotizado: 2,
      negociacion: 1,
      ganada: 3,
      perdida: 5,
    })).toEqual([
      { id: 'prospecto', etiqueta: 'Prospecto', valor: 4 },
      { id: 'contactado', etiqueta: 'Contactado', valor: 0 },
      { id: 'cotizado', etiqueta: 'Cotizado', valor: 2 },
      { id: 'negociacion', etiqueta: 'Negociación', valor: 1 },
      { id: 'ganada', etiqueta: 'Ganada', valor: 3 },
      { id: 'perdida', etiqueta: 'Perdida', valor: 5 },
    ]);
  });

  it('mapea los estados de producción sin calcular porcentajes', () => {
    expect(crearSerieOrdenesDashboard({
      aprobacionesPendientes: 1,
      activas: 2,
      atrasadas: 3,
      enRiesgo: 4,
      completadas: 5,
      internas: 0,
    })).toEqual([
      { id: 'aprobaciones-pendientes', etiqueta: 'Aprobaciones pendientes', valor: 1 },
      { id: 'activas', etiqueta: 'Órdenes activas', valor: 2 },
      { id: 'atrasadas', etiqueta: 'Órdenes atrasadas', valor: 3 },
      { id: 'en-riesgo', etiqueta: 'En riesgo (3 días)', valor: 4 },
      { id: 'completadas', etiqueta: 'Completadas', valor: 5 },
    ]);
  });

  it('preserva importes por categoría y devuelve una lista vacía sin datos', () => {
    expect(crearSerieGastoDashboard([
      { categoria: 'materia_prima', montoMxn: 1_250 },
      { categoria: 'otros', montoMxn: 0 },
    ])).toEqual([
      { id: 'materia_prima', etiqueta: 'Materia prima', valor: 1_250 },
      { id: 'otros', etiqueta: 'Otros', valor: 0 },
    ]);
    expect(crearSerieGastoDashboard([])).toEqual([]);
  });

  it('conserva todos los buckets de antigüedad con sus importes en MXN', () => {
    expect(crearSerieAgingDashboard({
      corrienteMxn: 100,
      unoTreintaMxn: 90,
      treintaSesentaMxn: 80,
      sesentaNoventaMxn: 70,
      mayorNoventaMxn: 60,
    })).toEqual([
      { id: 'alCorriente', etiqueta: 'Corriente', valor: 100 },
      { id: 'de1A30Dias', etiqueta: '1–30 días', valor: 90 },
      { id: 'de31A60Dias', etiqueta: '31–60 días', valor: 80 },
      { id: 'de61A90Dias', etiqueta: '61–90 días', valor: 70 },
      { id: 'masDe90Dias', etiqueta: 'Más de 90 días', valor: 60 },
    ]);
  });
});
