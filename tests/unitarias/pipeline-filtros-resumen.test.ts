import { describe, expect, it } from 'vitest';
import type { Oportunidad } from '@/modulos/pipeline/tipos/indice';
import {
  FILTROS_TABLERO_INICIAL,
  areasDistintas,
  clientesDistintos,
  etiquetasDistintas,
  filtrarOportunidades,
  hayFiltrosActivos,
  proximaAccionVencida,
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
    folioRfq: null,
    estadoRfq: 'NEW',
    nombreContacto: 'Contacto',
    empresa: 'Empresa',
    correo: null,
    telefono: null,
    clienteId: null,
    contactoId: null,
    vendedorId: 'v-1',
    responsableId: null,
    canal: null,
    fechaSolicitud: null,
    descripcionGeneral: null,
    moneda: 'MXN',
    condicionesPago: null,
    prioridad: 'normal',
    ivaPorcentaje: 16,
    etiquetas: [],
    esOrdenInterna: false,
    poCliente: null,
    fechaRequerida: null,
    horasEstimadas: null,
    notas: null,
    proximaAccionCodigo: null,
    proximaAccionTexto: null,
    fechaProximaAccion: null,
    responsableProximaAccionId: null,
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

  it('texto busca en folio RFQ/OP/CNC, empresa y contacto, sin distinguir mayúsculas', () => {
    const datos = [
      op({ empresa: 'Aceros del Norte' }),
      op({ nombreContacto: 'María López' }),
      op({ folioCnc: 'CNC-0926-0007' }),
      op({ folioRfq: 'RFQ-0926_04' }),
      op({ empresa: 'Otro' }),
    ];
    expect(filtrarOportunidades(datos, f({ texto: 'norte' }))).toHaveLength(1);
    expect(filtrarOportunidades(datos, f({ texto: 'lópez' }))).toHaveLength(1);
    expect(filtrarOportunidades(datos, f({ texto: 'cnc-0926' }))).toHaveLength(1);
    expect(filtrarOportunidades(datos, f({ texto: 'rfq-0926' }))).toHaveLength(1);
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

  it('filtra por estado RFQ (ola 2)', () => {
    const datos = [
      op({ estadoRfq: 'READY_FOR_PROPOSAL' }),
      op({ estadoRfq: 'CONVERTED' }),
      op({ estadoRfq: 'READY_FOR_PROPOSAL' }),
    ];
    expect(filtrarOportunidades(datos, f({ estadoRfq: 'READY_FOR_PROPOSAL' }))).toHaveLength(2);
    expect(filtrarOportunidades(datos, f({ estadoRfq: 'CLOSED' }))).toHaveLength(0);
  });

  it('filtra por responsable (responsable_id o vendedor si falta)', () => {
    const datos = [
      op({ responsableId: 'u-1' }),
      op({ responsableId: null, vendedorId: 'u-2' }),
      op({ responsableId: 'u-1' }),
    ];
    expect(filtrarOportunidades(datos, f({ responsableId: 'u-1' }))).toHaveLength(2);
    expect(filtrarOportunidades(datos, f({ responsableId: 'u-2' }))).toHaveLength(1);
  });

  it('filtra por próxima acción vencida, excluyendo terminales y con orden', () => {
    const hoy = '2026-09-20';
    const datos = [
      op({ fechaProximaAccion: '2026-09-10' }),
      op({ fechaProximaAccion: '2026-09-25' }),
      op({ fechaProximaAccion: '2026-09-01', estadoRfq: 'CLOSED' }),
      op({ fechaProximaAccion: '2026-09-01', ordenVinculada: { folio: 'OP-1', estado: 'borrador' } }),
    ];
    expect(filtrarOportunidades(datos, f({ proximaVencida: true }), hoy)).toHaveLength(1);
    expect(proximaAccionVencida(datos[0]!, hoy)).toBe(true);
    expect(proximaAccionVencida(datos[2]!, hoy)).toBe(false);
  });

  it('el texto también busca en el nombre del cliente ligado (RFQ-13)', () => {
    const datos = [op({ clienteNombre: 'Metales del Norte' }), op({ empresa: 'Otro' })];
    expect(filtrarOportunidades(datos, f({ texto: 'metales' }))).toHaveLength(1);
  });

  it('filtra por área presente en alguna línea (RFQ-05/13)', () => {
    const datos = [
      op({ areasTrabajo: ['CNC', 'DOBLEZ'] }),
      op({ areasTrabajo: ['SOLDADURA'] }),
      op({ areasTrabajo: [] }),
      op({}),
    ];
    expect(filtrarOportunidades(datos, f({ area: 'CNC' }))).toHaveLength(1);
    expect(filtrarOportunidades(datos, f({ area: 'DOBLEZ' }))).toHaveLength(1);
    expect(filtrarOportunidades(datos, f({ area: 'NADA' }))).toHaveLength(0);
  });

  it('filtra por cliente del catálogo ligado (RFQ-02/13)', () => {
    const datos = [
      op({ clienteId: 'c-1', clienteNombre: 'Metanor' }),
      op({ clienteId: 'c-2', clienteNombre: 'Aceros Baja' }),
      op({ clienteId: null }),
    ];
    expect(filtrarOportunidades(datos, f({ clienteId: 'c-1' }))).toHaveLength(1);
    expect(filtrarOportunidades(datos, f({ clienteId: 'c-3' }))).toHaveLength(0);
  });
});

describe('hayFiltrosActivos', () => {
  it('detecta filtros activos', () => {
    expect(hayFiltrosActivos(FILTROS_TABLERO_INICIAL)).toBe(false);
    expect(hayFiltrosActivos(f({ texto: 'x' }))).toBe(true);
    expect(hayFiltrosActivos(f({ soloInternas: true }))).toBe(true);
    expect(hayFiltrosActivos(f({ desde: '2026-09-01' }))).toBe(true);
    expect(hayFiltrosActivos(f({ estadoRfq: 'READY_FOR_PROPOSAL' }))).toBe(true);
    expect(hayFiltrosActivos(f({ responsableId: 'u-1' }))).toBe(true);
    expect(hayFiltrosActivos(f({ proximaVencida: true }))).toBe(true);
    expect(hayFiltrosActivos(f({ area: 'CNC' }))).toBe(true);
    expect(hayFiltrosActivos(f({ clienteId: 'c-1' }))).toBe(true);
  });
});

describe('areasDistintas y clientesDistintos (RFQ-13)', () => {
  it('devuelve áreas únicas ordenadas y sin vacíos', () => {
    const datos = [op({ areasTrabajo: ['DOBLEZ', 'CNC', ' '] }), op({ areasTrabajo: ['CNC'] })];
    expect(areasDistintas(datos)).toEqual(['CNC', 'DOBLEZ']);
  });

  it('devuelve clientes por id, ordenados por nombre y sin oportunidades sin cliente', () => {
    const datos = [
      op({ clienteId: 'c-2', clienteNombre: 'Zeta' }),
      op({ clienteId: 'c-1', clienteNombre: 'Alfa' }),
      op({ clienteId: 'c-2', clienteNombre: 'Zeta' }),
      op({ clienteId: null }),
      op({ clienteId: 'c-3', clienteNombre: null }),
    ];
    expect(clientesDistintos(datos)).toEqual([
      { id: 'c-1', nombre: 'Alfa' },
      { id: 'c-3', nombre: 'Cliente sin nombre' },
      { id: 'c-2', nombre: 'Zeta' },
    ]);
  });
});

describe('etiquetasDistintas', () => {
  it('devuelve etiquetas únicas ordenadas y sin vacíos', () => {
    const datos = [op({ etiquetas: ['beta', 'alfa', ' '] }), op({ etiquetas: ['alfa', 'gamma'] })];
    expect(etiquetasDistintas(datos)).toEqual(['alfa', 'beta', 'gamma']);
  });
});

describe('resumirPipeline', () => {
  it('cuenta por estado y calcula conversión por órdenes vinculadas', () => {
    const datos = [
      op({ estadoRfq: 'NEW' }),
      op({ estadoRfq: 'READY_FOR_PROPOSAL' }),
      op({ estadoRfq: 'CONVERTED', ordenVinculada: { folio: 'OP-1', estado: 'borrador' } }),
      op({ estadoRfq: 'CONVERTED', ordenVinculada: { folio: 'OP-2', estado: 'borrador' } }),
      op({ estadoRfq: 'CLOSED' }),
    ];
    const r = resumirPipeline(datos);
    expect(r.total).toBe(5);
    expect(r.porEstado.CONVERTED).toBe(2);
    expect(r.porEstado.CLOSED).toBe(1);
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

describe('resumirPipeline · importes (RFQ-14)', () => {
  it('no suma MXN y USD entre sí; separa importe por moneda', () => {
    const datos = [
      op({ moneda: 'MXN', importeSubtotal: 1000 }),
      op({ moneda: 'USD', importeSubtotal: 200 }),
    ];
    const r = resumirPipeline(datos);
    expect(r.importeTotal).toEqual({ MXN: 1000, USD: 200 });
  });

  it('pendiente vs enviado según fechaEnvioCotizacion, solo en abiertas', () => {
    const datos = [
      op({ estadoRfq: 'INCOMPLETE', importeSubtotal: 100, fechaEnvioCotizacion: null }),
      op({ estadoRfq: 'READY_FOR_PROPOSAL', importeSubtotal: 300, fechaEnvioCotizacion: '2026-09-12T00:00:00.000Z' }),
      // convertida en orden: resuelta, no cuenta en pendiente/enviado
      op({
        estadoRfq: 'CONVERTED',
        importeSubtotal: 999,
        fechaEnvioCotizacion: '2026-09-12T00:00:00.000Z',
        ordenVinculada: { folio: 'OP-1', estado: 'borrador' },
      }),
    ];
    const r = resumirPipeline(datos);
    expect(r.importePendiente.MXN).toBe(100);
    expect(r.importeEnviado.MXN).toBe(300);
    expect(r.importeTotal.MXN).toBe(1399);
  });

  it('importe por estado separado por moneda', () => {
    const datos = [
      op({ estadoRfq: 'CONVERTED', moneda: 'MXN', importeSubtotal: 500 }),
      op({ estadoRfq: 'CONVERTED', moneda: 'USD', importeSubtotal: 80 }),
    ];
    const r = resumirPipeline(datos);
    expect(r.importePorEstado.CONVERTED).toEqual({ MXN: 500, USD: 80 });
    expect(r.importePorEstado.NEW).toEqual({ MXN: 0, USD: 0 });
  });

  it('importe ausente (undefined) cuenta como cero', () => {
    const r = resumirPipeline([op({ moneda: 'MXN' })]);
    expect(r.importeTotal).toEqual({ MXN: 0, USD: 0 });
  });
});
