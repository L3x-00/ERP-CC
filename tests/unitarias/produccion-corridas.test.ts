import { describe, expect, it } from 'vitest';

import {
  corridaDesdeJson,
  inspeccionDesdeJson,
} from '@/modulos/produccion/tipos/corridas';
import {
  ETIQUETAS_ESTADO_AUTORIZACION_HORA_EXTRA,
  esEstadoCorridaTerminal,
  esReferenciaLoteValida,
  formatearCodigoCorrida,
  referenciasLotePermitidas,
  siguienteConsecutivoCorrida,
  verificacionInicioCompleta,
} from '@/modulos/produccion/utilidades/corridas';
import {
  esquemaConsultarCorridas,
  esquemaCrearCorrida,
  esquemaEstadoCorrida,
  esquemaRegistrarInspeccion,
  esquemaVerificacionInicio,
} from '@/modulos/produccion/validaciones/corridas';
import { filaASesionTrabajo } from '@/modulos/produccion/tipos/produccion';

const UUID = '10000000-0000-4000-8000-000000000001';
const UUID2 = '10000000-0000-4000-8000-000000000002';

const VERIFICACION = {
  material: true,
  espesor: true,
  cantidad: true,
  archivo: true,
  proceso_equipo: true,
  observaciones: 'Listo',
};

describe('códigos de corrida', () => {
  it('formatea dos dígitos mínimos sin truncar en 100+', () => {
    expect(formatearCodigoCorrida('LAS', 1)).toBe('LAS01');
    expect(formatearCodigoCorrida('LAS', 9)).toBe('LAS09');
    expect(formatearCodigoCorrida('LAS', 10)).toBe('LAS10');
    expect(formatearCodigoCorrida('LAS', 99)).toBe('LAS99');
    expect(formatearCodigoCorrida('LAS', 100)).toBe('LAS100');
    expect(formatearCodigoCorrida('DOB', 101)).toBe('DOB101');
  });

  it('calcula el siguiente consecutivo por prefijo ignorando otros códigos', () => {
    expect(siguienteConsecutivoCorrida([], 'LAS')).toBe(1);
    expect(siguienteConsecutivoCorrida(['LAS01', 'LAS02', 'DOB01'], 'LAS')).toBe(3);
    expect(siguienteConsecutivoCorrida(['LAS99'], 'LAS')).toBe(100);
    expect(siguienteConsecutivoCorrida(['LAS100'], 'LAS')).toBe(101);
  });

  it('detecta estados terminales', () => {
    expect(esEstadoCorridaTerminal('COMPLETADA')).toBe(true);
    expect(esEstadoCorridaTerminal('CANCELADA')).toBe(true);
    expect(esEstadoCorridaTerminal('PAUSADA')).toBe(false);
  });

  it('etiqueta los estados de autorización de horas extra', () => {
    expect(ETIQUETAS_ESTADO_AUTORIZACION_HORA_EXTRA).toEqual({
      VIGENTE: 'Vigente',
      USADA: 'Usada',
      REVOCADA: 'Revocada',
    });
  });
});

describe('verificación inicial y referencias de lote', () => {
  it('valida el checklist completo de eventos críticos', () => {
    expect(verificacionInicioCompleta(VERIFICACION)).toBe(true);
    expect(verificacionInicioCompleta({ ...VERIFICACION, material: false })).toBe(false);
    expect(verificacionInicioCompleta({ ...VERIFICACION, observaciones: 7 })).toBe(false);
    expect(verificacionInicioCompleta(null)).toBe(false);
    expect(esquemaVerificacionInicio.safeParse(VERIFICACION).success).toBe(true);
    expect(esquemaVerificacionInicio.safeParse({ ...VERIFICACION, extra: 1 }).success).toBe(false);
  });

  it('calcula referencias 1/3/5 y múltiplos del intervalo', () => {
    expect(referenciasLotePermitidas(4, null)).toEqual([]);
    expect(referenciasLotePermitidas(5, null)).toEqual([1, 3, 5]);
    expect(referenciasLotePermitidas(10, 10)).toEqual([1, 3, 5, 10]);
    expect(referenciasLotePermitidas(25, 20)).toEqual([1, 3, 5, 20]);
  });

  it('acepta referencias válidas y rechaza intermedias inválidas', () => {
    expect(esReferenciaLoteValida(10, 10, 1)).toBe(true);
    expect(esReferenciaLoteValida(10, 10, 10)).toBe(true);
    expect(esReferenciaLoteValida(10, 10, 2)).toBe(false);
    expect(esReferenciaLoteValida(4, null, 1)).toBe(true);
    expect(esReferenciaLoteValida(4, null, null)).toBe(false);
    expect(esReferenciaLoteValida(25, 20, 20)).toBe(true);
    expect(esReferenciaLoteValida(25, 20, 7)).toBe(false);
  });
});

describe('esquemas B6', () => {
  it('crearCorrida exige orden, proceso y al menos un ítem válido', () => {
    expect(esquemaCrearCorrida.safeParse({
      ordenId: UUID,
      procesoId: UUID2,
      items: [{ partidaId: UUID }],
    }).success).toBe(true);
    expect(esquemaCrearCorrida.safeParse({
      ordenId: UUID,
      procesoId: UUID2,
      items: [],
    }).success).toBe(false);
    expect(esquemaCrearCorrida.safeParse({
      ordenId: UUID,
      procesoId: UUID2,
      items: [{ partidaId: UUID, cantidad: 1.005 }],
    }).success).toBe(false);
  });

  it('estadoCorrida exige checklist al iniciar y motivo al cancelar', () => {
    expect(esquemaEstadoCorrida.safeParse({
      corridaId: UUID,
      accion: 'iniciar',
      verificacion: VERIFICACION,
    }).success).toBe(true);
    expect(esquemaEstadoCorrida.safeParse({ corridaId: UUID, accion: 'iniciar' }).success).toBe(false);
    expect(esquemaEstadoCorrida.safeParse({ corridaId: UUID, accion: 'cancelar' }).success).toBe(false);
    expect(esquemaEstadoCorrida.safeParse({
      corridaId: UUID,
      accion: 'cancelar',
      motivo: 'material dañado',
    }).success).toBe(true);
    expect(esquemaEstadoCorrida.safeParse({ corridaId: UUID, accion: 'completar' }).success).toBe(true);
  });

  it('registrarInspeccion exige referencia en lote y valida cantidades', () => {
    const base = {
      ordenId: UUID,
      codigoItem: 'IT01',
      tipo: 'CIERRE',
      resultado: 'APROBADA',
    };
    expect(esquemaRegistrarInspeccion.safeParse(base).success).toBe(true);
    expect(esquemaRegistrarInspeccion.safeParse({
      ...base,
      tipo: 'REFERENCIA_LOTE',
    }).success).toBe(false);
    expect(esquemaRegistrarInspeccion.safeParse({
      ...base,
      tipo: 'REFERENCIA_LOTE',
      referencia: 3,
    }).success).toBe(true);
    expect(esquemaRegistrarInspeccion.safeParse({ ...base, cantidadOk: -1 }).success).toBe(false);
  });

  it('las consultas B6 exigen UUID de orden', () => {
    expect(esquemaConsultarCorridas.safeParse({ ordenId: UUID }).success).toBe(true);
    expect(esquemaConsultarCorridas.safeParse({ ordenId: 'no-es-uuid' }).success).toBe(false);
    expect(esquemaConsultarCorridas.safeParse({}).success).toBe(false);
  });
});

describe('mappers B6', () => {
  it('mapea defensivamente el jsonb de corrida', () => {
    const corrida = corridaDesdeJson({
      id: UUID,
      orden_id: UUID2,
      codigo: 'LAS01',
      proceso_id: UUID,
      estado: 'EN_PROCESO',
      cantidad_planificada: 10,
      corrida_origen_id: null,
      items: [{ partida_id: UUID2, codigo_item: 'IT01', cantidad: 10 }],
    });
    expect(corrida).toMatchObject({
      codigo: 'LAS01',
      estado: 'EN_PROCESO',
      cantidadPlanificada: 10,
      items: [{ codigoItem: 'IT01', cantidad: 10 }],
    });
    expect(corridaDesdeJson(null)).toBeNull();
    expect(corridaDesdeJson({ codigo: 'LAS01' })).toBeNull();
  });

  it('mapea defensivamente el jsonb de inspección', () => {
    const inspeccion = inspeccionDesdeJson({
      id: UUID,
      tipo: 'PRIMERA_PIEZA',
      resultado: 'APROBADA',
      codigo_item: 'IT01',
      referencia: null,
    });
    expect(inspeccion).toMatchObject({ tipo: 'PRIMERA_PIEZA', resultado: 'APROBADA', codigoItem: 'IT01' });
    expect(inspeccionDesdeJson('x')).toBeNull();
  });

  it('el mapper de sesión expone corrida, pausa por catálogo y checklist', () => {
    const sesion = filaASesionTrabajo({
      id: UUID,
      orden_id: UUID2,
      partida_id: UUID,
      programacion_id: UUID2,
      operador_id: UUID,
      corrida_id: UUID2,
      fecha_inicio: '2026-10-05T10:00:00Z',
      fecha_fin: null,
      horas_brutas: 0,
      horas_netas: 0,
      piezas_producidas: 0,
      motivo_pausa: 'material_pendiente',
      motivo_pausa_codigo: 'MATERIAL',
      motivo_pausa_nota: null,
      recurso_liberado: true,
      verificacion_inicio: VERIFICACION,
      notas: null,
      estado_sesion: 'pausada',
      creado_en: '2026-10-05T10:00:00Z',
      actualizado_en: '2026-10-05T10:00:00Z',
    });
    expect(sesion).toMatchObject({
      corridaId: UUID2,
      motivoPausaCodigo: 'MATERIAL',
      recursoLiberado: true,
      verificacionInicio: VERIFICACION,
    });
  });
});
