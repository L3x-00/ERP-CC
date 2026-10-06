import { describe, expect, it } from 'vitest';
import {
  archivosReferenciados,
  esSnapshotOrdenSii,
  ESTADO_LEGACY_A_SII,
  ESTADO_SII_A_LEGACY,
  ESTADOS_LEGACY_ORDEN,
  ESTADOS_SII_ORDEN,
} from '@/modulos/ordenes/tipos/orden-sii';
import {
  esquemaAjustarOrdenPostAceptacion,
  esquemaCrearOrdenDesdeRevision,
  esquemaCrearOrdenInterna,
  esquemaCerrarOrdenAdministrativa,
  esquemaLiberarOrden,
} from '@/modulos/ordenes/validaciones/orden-sii';

const ORDEN_ID = '00000000-0000-4000-8000-0000000b5001';
const CLIENTE_ID = '00000000-0000-4000-8000-0000000b5002';
const REVISION_ID = '00000000-0000-4000-8000-0000000b5003';
const PARTIDA_ID = '00000000-0000-4000-8000-0000000b5004';
const FECHA = '2026-10-06T12:00:00.000Z';

describe('estados SII de la orden (B5)', () => {
  it('mapea estado_sii → legacy como el puente SQL', () => {
    expect(ESTADOS_SII_ORDEN).toEqual([
      'CONFIRMADA', 'PLANIFICADA', 'LISTA', 'EN_PRODUCCION',
      'PRODUCCION_COMPLETADA', 'CERRADA', 'CANCELADA',
    ]);
    expect(ESTADO_SII_A_LEGACY.CONFIRMADA).toBe('borrador');
    expect(ESTADO_SII_A_LEGACY.PLANIFICADA).toBe('programada');
    expect(ESTADO_SII_A_LEGACY.LISTA).toBe('programada');
    expect(ESTADO_SII_A_LEGACY.EN_PRODUCCION).toBe('en_proceso');
    expect(ESTADO_SII_A_LEGACY.PRODUCCION_COMPLETADA).toBe('completada');
    expect(ESTADO_SII_A_LEGACY.CERRADA).toBe('completada');
    expect(ESTADO_SII_A_LEGACY.CANCELADA).toBe('cancelada');
  });

  it('mapea legacy → estado_sii y cubre todos los estados legacy', () => {
    for (const estado of ESTADOS_LEGACY_ORDEN) {
      expect(ESTADO_LEGACY_A_SII[estado]).toBeTruthy();
    }
    expect(ESTADO_LEGACY_A_SII.pausada).toBe('EN_PRODUCCION');
    expect(ESTADO_LEGACY_A_SII.completada).toBe('PRODUCCION_COMPLETADA');
    expect(ESTADO_LEGACY_A_SII.cancelada).toBe('CANCELADA');
  });
});

describe('forma del snapshot de orden', () => {
  const snapshotValido = {
    version: 1,
    orden_id: ORDEN_ID,
    origen: { rfq_id: 'rfq-1' },
    cabecera: { moneda: 'MXN' },
    items: [
      {
        codigo: 'IT01',
        cantidad: 2,
        archivos: [
          { archivo_id: 'a1' },
          { archivo_id: 'a2' },
        ],
      },
    ],
    archivos: [{ archivo_id: 'a1' }, { archivo_id: 'a3' }],
  };

  it('acepta el snapshot completo y rechaza formas incompletas', () => {
    expect(esSnapshotOrdenSii(snapshotValido)).toBe(true);
    expect(esSnapshotOrdenSii(undefined)).toBe(false);
    expect(esSnapshotOrdenSii([])).toBe(false);
    expect(esSnapshotOrdenSii({ ...snapshotValido, version: '1' })).toBe(false);
    expect(esSnapshotOrdenSii({ ...snapshotValido, orden_id: undefined })).toBe(false);
    expect(esSnapshotOrdenSii({ ...snapshotValido, items: 'no-array' })).toBe(false);
    expect(esSnapshotOrdenSii({ ...snapshotValido, archivos: null })).toBe(false);
  });

  it('deduplica los archivos referenciados (revisión + ítems)', () => {
    expect(archivosReferenciados(snapshotValido).sort()).toEqual(['a1', 'a2', 'a3']);
  });
});

describe('esquemas de acciones B5', () => {
  it('valida crear desde revisión', () => {
    expect(esquemaCrearOrdenDesdeRevision.safeParse({ revisionId: REVISION_ID }).success).toBe(true);
    expect(esquemaCrearOrdenDesdeRevision.safeParse({ revisionId: 'x' }).success).toBe(false);
    expect(esquemaCrearOrdenDesdeRevision.safeParse({}).success).toBe(false);
  });

  const internaValida = {
    clienteId: CLIENTE_ID,
    fechaCompromiso: FECHA,
    prioridad: 'normal' as const,
    motivoAutorizacion: 'Trabajo interno de mantenimiento',
    items: [
      {
        descripcion: 'Base para prensa',
        cantidad: 2,
        material: 'ACERO_CARBON',
        espesor: '6 mm',
        procesos: ['Corte', 'Doblado'],
        tiempoEstimadoMinutos: 45,
      },
    ],
  };

  it('valida la orden interna y rechaza autorización/ítems inválidos', () => {
    const valido = esquemaCrearOrdenInterna.safeParse(internaValida);
    expect(valido.success).toBe(true);
    if (valido.success) {
      expect(valido.data.items[0].tiempoEstimadoMinutos).toBe(45);
      expect(valido.data.prioridad).toBe('normal');
    }
    expect(esquemaCrearOrdenInterna.safeParse({ ...internaValida, motivoAutorizacion: 'no' }).success).toBe(false);
    expect(esquemaCrearOrdenInterna.safeParse({ ...internaValida, items: [] }).success).toBe(false);
    expect(esquemaCrearOrdenInterna.safeParse({
      ...internaValida,
      items: [{ ...internaValida.items[0], cantidad: 0 }],
    }).success).toBe(false);
    expect(esquemaCrearOrdenInterna.safeParse({ ...internaValida, fechaCompromiso: 'ayer' }).success).toBe(false);
    expect(esquemaCrearOrdenInterna.safeParse({
      ...internaValida,
      items: [{ ...internaValida.items[0], codigoItem: 'XX01' }],
    }).success).toBe(false);
  });

  it('valida liberar y cerrar con CAS obligatorio', () => {
    expect(esquemaLiberarOrden.safeParse({ ordenId: ORDEN_ID, actualizadoEn: FECHA }).success).toBe(true);
    expect(esquemaLiberarOrden.safeParse({ ordenId: ORDEN_ID }).success).toBe(false);
    expect(esquemaLiberarOrden.safeParse({ ordenId: ORDEN_ID, actualizadoEn: 'hoy' }).success).toBe(false);
    expect(esquemaCerrarOrdenAdministrativa.safeParse({ ordenId: ORDEN_ID, actualizadoEn: FECHA }).success).toBe(true);
    expect(esquemaCerrarOrdenAdministrativa.safeParse({ ordenId: 'no-uuid', actualizadoEn: FECHA }).success).toBe(false);
  });

  it('valida el ajuste post-aceptación (motivo, cambios y partidas)', () => {
    const base = {
      ordenId: ORDEN_ID,
      actualizadoEn: FECHA,
      motivo: 'El cliente ajustó cantidades',
      cambios: { prioridad: 'alta' as const },
    };
    expect(esquemaAjustarOrdenPostAceptacion.safeParse(base).success).toBe(true);
    expect(esquemaAjustarOrdenPostAceptacion.safeParse({ ...base, motivo: 'no' }).success).toBe(false);
    expect(esquemaAjustarOrdenPostAceptacion.safeParse({ ...base, cambios: {} }).success).toBe(false);
    expect(esquemaAjustarOrdenPostAceptacion.safeParse({ ...base, cambios: { forzar: true } }).success).toBe(false);
    expect(esquemaAjustarOrdenPostAceptacion.safeParse({
      ...base,
      cambios: { partidas: [{ partidaId: PARTIDA_ID, cantidadSolicitada: 3 }] },
    }).success).toBe(true);
    expect(esquemaAjustarOrdenPostAceptacion.safeParse({
      ...base,
      cambios: { partidas: [{ partidaId: PARTIDA_ID }] },
    }).success).toBe(false);
    expect(esquemaAjustarOrdenPostAceptacion.safeParse({
      ...base,
      cambios: { partidas: [{ partidaId: PARTIDA_ID, cantidadSolicitada: 0 }] },
    }).success).toBe(false);
  });
});
