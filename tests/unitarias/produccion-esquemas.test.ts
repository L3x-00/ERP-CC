import { describe, expect, it } from 'vitest';
import {
  filaANotaEntrega,
  filaAPartidaNotaEntrega,
  filaASesionTrabajo,
  type FilaNotaEntrega,
  type FilaPartidaNotaEntrega,
  type FilaSesionTrabajo,
} from '@/modulos/produccion/tipos/indice';
import {
  esquemaCerrarSesion,
  esquemaCrearNotaEntrega,
  esquemaIniciarSesion,
} from '@/modulos/produccion/validaciones/indice';

const uuidOrden = '11111111-1111-4111-8111-111111111111';
const uuidPartida = '22222222-2222-4222-8222-222222222222';
const uuidProgramacion = '33333333-3333-4333-8333-333333333333';
const uuidSesion = '44444444-4444-4444-8444-444444444444';
const uuidOperador = '55555555-5555-4555-8555-555555555555';
const uuidNota = '66666666-6666-4666-8666-666666666666';

describe('esquemas de Producción', () => {
  it('acepta el inicio vinculado a una programación concreta', () => {
    expect(esquemaIniciarSesion.safeParse({
      ordenId: uuidOrden,
      partidaId: uuidPartida,
      programacionId: uuidProgramacion,
    }).success).toBe(true);
  });

  it('rechaza un inicio con UUID inválido o datos no declarados', () => {
    expect(esquemaIniciarSesion.safeParse({
      ordenId: uuidOrden,
      partidaId: 'partida-invalida',
      programacionId: uuidProgramacion,
    }).success).toBe(false);
    expect(esquemaIniciarSesion.safeParse({
      ordenId: uuidOrden,
      partidaId: uuidPartida,
      programacionId: uuidProgramacion,
      operadorId: uuidOperador,
    }).success).toBe(false);
  });

  it('acepta un cierre final con PIN de confirmación válido', () => {
    const resultado = esquemaCerrarSesion.safeParse({
      sesionId: uuidSesion,
      piezasProducidas: 2.5,
      estadoDestino: 'finalizada',
      notas: 'Piezas inspeccionadas',
      pinConfirmacion: '4826',
    });

    expect(resultado.success).toBe(true);
  });

  it.each(['482', '4826789', '48a6'])('rechaza PIN de confirmación inválido: %s', (pin) => {
    expect(esquemaCerrarSesion.safeParse({
      sesionId: uuidSesion,
      piezasProducidas: 0,
      estadoDestino: 'finalizada',
      pinConfirmacion: pin,
    }).success).toBe(false);
  });

  it('requiere motivo al pausar y rechaza piezas negativas', () => {
    expect(esquemaCerrarSesion.safeParse({
      sesionId: uuidSesion,
      piezasProducidas: 0,
      estadoDestino: 'pausada',
      pinConfirmacion: '4826',
    }).success).toBe(false);
    expect(esquemaCerrarSesion.safeParse({
      sesionId: uuidSesion,
      piezasProducidas: -1,
      estadoDestino: 'pausada',
      motivoPausa: 'mantenimiento',
      pinConfirmacion: '4826',
    }).success).toBe(false);
  });

  it('acepta una nota parcial sin campos controlados por el servidor', () => {
    const resultado = esquemaCrearNotaEntrega.safeParse({
      ordenId: uuidOrden,
      recibidoPor: 'María López',
      firmaClienteUrl: 'https://ejemplo.test/firmas/nota.png',
      partidas: [{ partidaId: uuidPartida, cantidadEntregada: 1 }],
    });

    expect(resultado.success).toBe(true);
  });

  it('rechaza notas sin partidas, cantidades inválidas o campos de servidor', () => {
    expect(esquemaCrearNotaEntrega.safeParse({
      ordenId: uuidOrden,
      recibidoPor: 'María López',
      partidas: [],
    }).success).toBe(false);
    expect(esquemaCrearNotaEntrega.safeParse({
      ordenId: uuidOrden,
      recibidoPor: 'María López',
      partidas: [{ partidaId: uuidPartida, cantidadEntregada: -1 }],
    }).success).toBe(false);
    expect(esquemaCrearNotaEntrega.safeParse({
      ordenId: uuidOrden,
      recibidoPor: 'María López',
      partidas: [{ partidaId: uuidPartida, cantidadEntregada: 1 }],
      creadoPor: uuidOperador,
    }).success).toBe(false);
  });
});

describe('mappers de Producción', () => {
  const filaSesion: FilaSesionTrabajo = {
    id: uuidSesion,
    orden_id: uuidOrden,
    partida_id: uuidPartida,
    programacion_id: uuidProgramacion,
    operador_id: uuidOperador,
    fecha_inicio: '2026-08-14T15:00:00.000Z',
    fecha_fin: '2026-08-14T22:00:00.000Z',
    horas_brutas: 7,
    horas_netas: 6,
    piezas_producidas: 4,
    motivo_pausa: 'mantenimiento',
    notas: 'Cambio de herramienta',
    estado_sesion: 'pausada',
    creado_en: '2026-08-14T15:00:00.000Z',
    actualizado_en: '2026-08-14T22:00:00.000Z',
  };
  const filaNota: FilaNotaEntrega = {
    id: uuidNota,
    orden_id: uuidOrden,
    folio: 'NE-001001',
    recibido_por: 'María López',
    firma_cliente_url: null,
    es_parcial: true,
    creado_por: uuidOperador,
    creado_en: '2026-08-14T22:00:00.000Z',
  };
  const filaPartidaNota: FilaPartidaNotaEntrega = {
    id: uuidNota,
    nota_entrega_id: uuidNota,
    partida_id: uuidPartida,
    cantidad_solicitada: 10,
    cantidad_entregada: 4,
  };

  it('mapea sesiones y cantidades numéricas a camelCase', () => {
    expect(filaASesionTrabajo(filaSesion)).toMatchObject({
      programacionId: uuidProgramacion,
      estadoSesion: 'pausada',
      motivoPausa: 'mantenimiento',
      horasNetas: 6,
      piezasProducidas: 4,
    });
  });

  it('mapea una nota y sus renglones sin campos económicos', () => {
    expect(filaANotaEntrega(filaNota)).toMatchObject({
      folio: 'NE-001001',
      esParcial: true,
      recibidoPor: 'María López',
    });
    expect(filaAPartidaNotaEntrega(filaPartidaNota)).toMatchObject({
      cantidadSolicitada: 10,
      cantidadEntregada: 4,
    });
  });

  it('rechaza enumeraciones corruptas en la base', () => {
    expect(() => filaASesionTrabajo({ ...filaSesion, estado_sesion: 'abierta' })).toThrow(
      /estado de sesión: abierta/,
    );
    expect(() => filaASesionTrabajo({ ...filaSesion, motivo_pausa: 'sin_motivo' })).toThrow(
      /motivo de pausa: sin_motivo/,
    );
  });
});
