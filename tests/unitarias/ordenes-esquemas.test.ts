import { describe, expect, it } from 'vitest';
import {
  esquemaCambiarEstadoOrden,
  esquemaCrearOrden,
  esquemaRegistrarTiempoOperador,
} from '@/modulos/ordenes/validaciones/ordenes';
import {
  filaAOrden,
  filaAPartida,
  filaARegistroTiempo,
} from '@/modulos/ordenes/tipos/ordenes';

const uuidCliente = '11111111-1111-4111-8111-111111111111';
const uuidCotizacion = '22222222-2222-4222-8222-222222222222';
const uuidMaterial = '33333333-3333-4333-8333-333333333333';
const uuidOrden = '44444444-4444-4444-8444-444444444444';
const uuidPartida = '55555555-5555-4555-8555-555555555555';
const uuidOperador = '66666666-6666-4666-8666-666666666666';

const partidaValida = {
  codigoPieza: 'PLACA-BASE-120',
  descripcion: 'Placa base para equipo CNC',
  cantidadSolicitada: 25,
  unidadMedida: 'pieza',
  materialId: uuidMaterial,
  tiempoEstimadoMinutos: 45,
};

describe('esquemaCrearOrden', () => {
  const ordenValida = {
    clienteId: uuidCliente,
    cotizacionId: uuidCotizacion,
    fechaCompromiso: '2026-09-15T18:00:00.000Z',
    partidas: [partidaValida],
  };

  it('acepta una orden con cliente, compromiso y partidas válidas', () => {
    const resultado = esquemaCrearOrden.safeParse(ordenValida);

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.prioridad).toBe('normal');
      expect(resultado.data.partidas).toHaveLength(1);
    }
  });

  it('rechaza UUID inválidos de cliente, cotización o material', () => {
    expect(esquemaCrearOrden.safeParse({ ...ordenValida, clienteId: 'cliente-1' }).success).toBe(false);
    expect(esquemaCrearOrden.safeParse({ ...ordenValida, cotizacionId: 'cotizacion-1' }).success).toBe(false);
    expect(
      esquemaCrearOrden.safeParse({
        ...ordenValida,
        partidas: [{ ...partidaValida, materialId: 'material-1' }],
      }).success,
    ).toBe(false);
  });

  it('rechaza cantidades no positivas y tiempos negativos', () => {
    expect(
      esquemaCrearOrden.safeParse({
        ...ordenValida,
        partidas: [{ ...partidaValida, cantidadSolicitada: -1 }],
      }).success,
    ).toBe(false);
    expect(
      esquemaCrearOrden.safeParse({
        ...ordenValida,
        partidas: [{ ...partidaValida, tiempoEstimadoMinutos: -1 }],
      }).success,
    ).toBe(false);
  });

  it('aplica cero minutos estimados cuando no se proporciona', () => {
    const resultado = esquemaCrearOrden.safeParse({
      ...ordenValida,
      partidas: [{ ...partidaValida, tiempoEstimadoMinutos: undefined }],
    });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.partidas[0].tiempoEstimadoMinutos).toBe(0);
    }
  });

  it('rechaza una fecha de compromiso que no es ISO datetime', () => {
    expect(
      esquemaCrearOrden.safeParse({ ...ordenValida, fechaCompromiso: '15/09/2026' }).success,
    ).toBe(false);
  });

  it('rechaza una orden sin partidas', () => {
    expect(esquemaCrearOrden.safeParse({ ...ordenValida, partidas: [] }).success).toBe(false);
  });

  it('rechaza prioridad fuera del enum', () => {
    expect(esquemaCrearOrden.safeParse({ ...ordenValida, prioridad: 'crítica' }).success).toBe(false);
  });
});

describe('esquemaCambiarEstadoOrden', () => {
  const cambioValido = {
    ordenId: uuidOrden,
    estadoActual: 'borrador',
    estado: 'programada',
  };

  it('acepta los estados definidos para una orden', () => {
    expect(esquemaCambiarEstadoOrden.safeParse(cambioValido).success).toBe(true);
  });

  it('rechaza el UUID y los estados fuera de rango', () => {
    expect(
      esquemaCambiarEstadoOrden.safeParse({ ...cambioValido, ordenId: 'OP-001001' }).success,
    ).toBe(false);
    expect(
      esquemaCambiarEstadoOrden.safeParse({ ...cambioValido, estado: 'liberada' }).success,
    ).toBe(false);
    expect(
      esquemaCambiarEstadoOrden.safeParse({ ...cambioValido, estadoActual: 'liberada' }).success,
    ).toBe(false);
  });

  it('exige estadoActual explícito', () => {
    expect(
      esquemaCambiarEstadoOrden.safeParse({ ordenId: uuidOrden, estado: 'programada' }).success,
    ).toBe(false);
  });

  it('acepta una cancelación con motivo de al menos 3 caracteres', () => {
    const resultado = esquemaCambiarEstadoOrden.safeParse({
      ...cambioValido,
      estado: 'cancelada',
      motivoCancelacion: 'Cliente canceló el pedido',
    });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.motivoCancelacion).toBe('Cliente canceló el pedido');
    }
  });

  it('rechaza una cancelación sin motivo o con motivo demasiado corto', () => {
    const sinMotivo = esquemaCambiarEstadoOrden.safeParse({
      ...cambioValido,
      estado: 'cancelada',
    });
    expect(sinMotivo.success).toBe(false);
    if (!sinMotivo.success) {
      expect(sinMotivo.error.issues[0].path).toEqual(['motivoCancelacion']);
    }

    expect(
      esquemaCambiarEstadoOrden.safeParse({
        ...cambioValido,
        estado: 'cancelada',
        motivoCancelacion: 'xy',
      }).success,
    ).toBe(false);
    expect(
      esquemaCambiarEstadoOrden.safeParse({
        ...cambioValido,
        estado: 'cancelada',
        motivoCancelacion: '   ',
      }).success,
    ).toBe(false);
  });

  it('no exige motivo cuando el destino no es cancelada', () => {
    expect(
      esquemaCambiarEstadoOrden.safeParse({
        ...cambioValido,
        estadoActual: 'en_proceso',
        estado: 'completada',
      }).success,
    ).toBe(true);
  });
});

describe('esquemaRegistrarTiempoOperador', () => {
  const registroValido = {
    partidaId: uuidPartida,
    operadorId: uuidOperador,
    accion: 'inicio',
    fechaRegistro: '2026-08-12T14:30:00.000Z',
  };

  it('acepta un evento CNC de inicio válido', () => {
    expect(esquemaRegistrarTiempoOperador.safeParse(registroValido).success).toBe(true);
  });

  it('acepta pausa y fin sin fecha explícita', () => {
    expect(
      esquemaRegistrarTiempoOperador.safeParse({ ...registroValido, accion: 'pausa' }).success,
    ).toBe(true);
    expect(
      esquemaRegistrarTiempoOperador.safeParse({ ...registroValido, accion: 'fin' }).success,
    ).toBe(true);
  });

  it('rechaza IDs, acción y fecha fuera de contrato', () => {
    expect(
      esquemaRegistrarTiempoOperador.safeParse({ ...registroValido, operadorId: 'operador-1' }).success,
    ).toBe(false);
    expect(
      esquemaRegistrarTiempoOperador.safeParse({ ...registroValido, accion: 'reanudacion' }).success,
    ).toBe(false);
    expect(
      esquemaRegistrarTiempoOperador.safeParse({ ...registroValido, fechaRegistro: '2026-08-12' }).success,
    ).toBe(false);
  });
});

describe('mappers de órdenes', () => {
  it('mapea filas snake_case de las tres tablas sin perder cantidades', () => {
    expect(
      filaAOrden({
        id: uuidOrden,
        folio: 'OP-001001',
        cliente_id: uuidCliente,
        cotizacion_id: uuidCotizacion,
        estado: 'programada',
        prioridad: 'alta',
        fecha_compromiso: '2026-09-15T18:00:00+00:00',
        fecha_inicio: null,
        fecha_fin: null,
        motivo_cancelacion: null,
        creado_en: '2026-08-12T10:00:00+00:00',
        actualizado_en: '2026-08-12T10:00:00+00:00',
      }),
    ).toMatchObject({ clienteId: uuidCliente, estado: 'programada', prioridad: 'alta' });

    expect(
      filaAPartida({
        id: uuidPartida,
        orden_id: uuidOrden,
        codigo_pieza: 'PLACA-BASE-120',
        descripcion: null,
        cantidad_solicitada: 25,
        cantidad_producida: 10,
        cantidad_scrap: 1,
        unidad_medida: 'pieza',
        material_id: uuidMaterial,
        tiempo_estimado_minutos: 45,
        tiempo_real_minutos: 30,
        maquina_asignada: 'CNC-01',
        creado_en: '2026-08-12T10:00:00+00:00',
        actualizado_en: '2026-08-12T10:00:00+00:00',
      }),
    ).toMatchObject({ cantidadSolicitada: 25, cantidadProducida: 10, cantidadScrap: 1 });

    expect(
      filaARegistroTiempo({
        id: '77777777-7777-4777-8777-777777777777',
        partida_id: uuidPartida,
        operador_id: uuidOperador,
        accion: 'inicio',
        fecha_registro: '2026-08-12T14:30:00+00:00',
        notas: null,
        creado_en: '2026-08-12T14:30:00+00:00',
        actualizado_en: '2026-08-12T14:30:00+00:00',
      }),
    ).toMatchObject({ partidaId: uuidPartida, accion: 'inicio' });
  });

  it('rechaza un valor de enum corrupto proveniente de base de datos', () => {
    expect(() =>
      filaAOrden({
        id: uuidOrden,
        folio: 'OP-001001',
        cliente_id: uuidCliente,
        cotizacion_id: null,
        estado: 'desconocido',
        prioridad: 'normal',
        fecha_compromiso: '2026-09-15T18:00:00+00:00',
        fecha_inicio: null,
        fecha_fin: null,
        motivo_cancelacion: null,
        creado_en: '2026-08-12T10:00:00+00:00',
        actualizado_en: '2026-08-12T10:00:00+00:00',
      }),
    ).toThrow('estado de orden');
  });
});
