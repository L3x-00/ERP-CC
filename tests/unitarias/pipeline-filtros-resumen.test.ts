import { describe, expect, it } from 'vitest';
import type { Oportunidad } from '@/modulos/pipeline/tipos/indice';
import {
  FILTROS_TABLERO_INICIAL,
  etiquetasDistintas,
  filtrarOportunidades,
  hayFiltrosActivos,
  type FiltrosTablero,
} from '@/modulos/pipeline/servicios/filtrar-oportunidades';
import { resumirPipeline } from '@/modulos/pipeline/servicios/resumen-pipeline';

let contador = 0;
function op(parcial: Partial<Oportunidad>): Oportunidad {
  contador += 1;
  return {
    id: `id-${contador}`,
    folioOp: `OP-${String(contador).padStart(4, '0')}`,
    folioCnc: null,
    etapa: 'prospecto',
    nombreContacto: 'Contacto',
    empresa: 'Empresa',
    correo: null,
    telefono: null,
    clienteId: null,
    vendedorId: 'v-1',
    moneda: 'MXN',
    condicionesPago: null,
    prioridad: 'normal',
    ivaPorcentaje: 16,
    etiquetas: [],
    esOrdenInterna: false,
    motivoPerdida: null,
    notasPerdida: null,
    fechaUltimoContacto: null,
    fechaEnvioCotizacion: null,
    creadoEn: '2026-09-10T00:00:00.000Z',
    actualizadoEn: '2026-09-10T00:00:00.000Z',
    ...parcial,
  };
}

const f = (parcial: Partial<FiltrosTablero>): FiltrosTablero => ({ ...FILTROS_TABLERO_INICIAL, ...parcial });

describe('filtrarOportunidades', () => {
  it('sin filtros devuelve todo', () => {
    const datos = [op({}), op({}), op({})];
    expect(filtrarOportunidades(datos, FILTROS_TABLERO_INICIAL)).toHaveLength(3);
  });

  it('texto busca en folio OP/CNC, empresa y contacto, sin distinguir mayúsculas', () => {
    const datos = [
      op({ empresa: 'Aceros del Norte' }),
      op({ nombreContacto: 'María López' }),
      op({ folioCnc: 'CNC-0926-0007' }),
      op({ empresa: 'Otro' }),
    ];
    expect(filtrarOportunidades(datos, f({ texto: 'norte' }))).toHaveLength(1);
    expect(filtrarOportunidades(datos, f({ texto: 'lópez' }))).toHaveLength(1);
    expect(filtrarOportunidades(datos, f({ texto: 'cnc-0926' }))).toHaveLength(1);
    expect(filtrarOportunidades(datos, f({ texto: 'zzz' }))).toHaveLength(0);
  });

  it('filtra por prioridad, etiqueta e internas', () => {
    const datos = [
      op({ prioridad: 'alta', etiquetas: ['urgente'] }),
      op({ prioridad: 'baja', etiquetas: ['seguimiento'] }),
      op({ prioridad: 'alta', esOrdenInterna: true }),
    ];
    expect(filtrarOportunidades(datos, f({ prioridad: 'alta' }))).toHaveLength(2);
    expect(filtrarOportunidades(datos, f({ etiqueta: 'seguimiento' }))).toHaveLength(1);
    expect(filtrarOportunidades(datos, f({ soloInternas: true }))).toHaveLength(1);
  });

  it('filtra por rango de fecha de creación (inclusive)', () => {
    const datos = [
      op({ creadoEn: '2026-09-01T10:00:00.000Z' }),
      op({ creadoEn: '2026-09-15T10:00:00.000Z' }),
      op({ creadoEn: '2026-09-30T10:00:00.000Z' }),
    ];
    expect(filtrarOportunidades(datos, f({ desde: '2026-09-10', hasta: '2026-09-20' }))).toHaveLength(1);
    expect(filtrarOportunidades(datos, f({ desde: '2026-09-15' }))).toHaveLength(2);
    expect(filtrarOportunidades(datos, f({ hasta: '2026-09-15' }))).toHaveLength(2);
  });

  it('combina filtros con AND', () => {
    const datos = [
      op({ empresa: 'Norte', prioridad: 'alta', etiquetas: ['x'] }),
      op({ empresa: 'Norte', prioridad: 'baja', etiquetas: ['x'] }),
    ];
    expect(filtrarOportunidades(datos, f({ texto: 'norte', prioridad: 'alta', etiqueta: 'x' }))).toHaveLength(1);
  });
});

describe('hayFiltrosActivos', () => {
  it('detecta filtros activos', () => {
    expect(hayFiltrosActivos(FILTROS_TABLERO_INICIAL)).toBe(false);
    expect(hayFiltrosActivos(f({ texto: 'x' }))).toBe(true);
    expect(hayFiltrosActivos(f({ soloInternas: true }))).toBe(true);
    expect(hayFiltrosActivos(f({ desde: '2026-09-01' }))).toBe(true);
  });
});

describe('etiquetasDistintas', () => {
  it('devuelve etiquetas únicas ordenadas y sin vacíos', () => {
    const datos = [op({ etiquetas: ['beta', 'alfa', ' '] }), op({ etiquetas: ['alfa', 'gamma'] })];
    expect(etiquetasDistintas(datos)).toEqual(['alfa', 'beta', 'gamma']);
  });
});

describe('resumirPipeline', () => {
  it('cuenta por etapa y calcula conversión aprobadas/total', () => {
    const datos = [
      op({ etapa: 'prospecto' }),
      op({ etapa: 'cotizado' }),
      op({ etapa: 'ganada' }),
      op({ etapa: 'ganada' }),
      op({ etapa: 'perdida' }),
    ];
    const r = resumirPipeline(datos);
    expect(r.total).toBe(5);
    expect(r.porEtapa.ganada).toBe(2);
    expect(r.porEtapa.perdida).toBe(1);
    expect(r.ganadas).toBe(2);
    expect(r.perdidas).toBe(1);
    expect(r.conversion).toBe(40); // 2/5
  });

  it('conversión 0 sin oportunidades', () => {
    const r = resumirPipeline([]);
    expect(r.total).toBe(0);
    expect(r.conversion).toBe(0);
  });
});
