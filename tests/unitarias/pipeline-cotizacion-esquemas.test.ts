import { describe, expect, it } from 'vitest';
import {
  esquemaGuardarCotizacion,
  esquemaLineaCotizacion,
} from '@/modulos/pipeline/validaciones/esquemas-cotizacion';

const PIPELINE_ID = '11111111-1111-4111-8111-111111111111';

function lineaValida() {
  return { descripcion: 'Placa', cantidad: 2, precioUnitario: 150.5 };
}

describe('esquemaLineaCotizacion', () => {
  it('conserva los datos técnicos capturados', () => {
    const analisis = esquemaLineaCotizacion.safeParse({
      ...lineaValida(),
      material: 'Acero A36',
      espesor: '1/8"',
      area: 0.75,
      procesos: ['corte', 'doblez'],
    });

    expect(analisis.success).toBe(true);
    expect(analisis.success && analisis.data).toMatchObject({
      material: 'Acero A36',
      espesor: '1/8"',
      area: 0.75,
      procesos: ['corte', 'doblez'],
    });
  });

  it('normaliza texto técnico vacío a ausente (no guarda cadenas vacías)', () => {
    const analisis = esquemaLineaCotizacion.safeParse({
      ...lineaValida(),
      material: '   ',
      espesor: '',
    });

    expect(analisis.success).toBe(true);
    expect(analisis.success && analisis.data.material).toBeUndefined();
    expect(analisis.success && analisis.data.espesor).toBeUndefined();
  });

  it('rechaza cantidad no positiva, precio negativo y área negativa', () => {
    expect(esquemaLineaCotizacion.safeParse({ ...lineaValida(), cantidad: 0 }).success).toBe(false);
    expect(
      esquemaLineaCotizacion.safeParse({ ...lineaValida(), precioUnitario: -1 }).success,
    ).toBe(false);
    expect(esquemaLineaCotizacion.safeParse({ ...lineaValida(), area: -0.1 }).success).toBe(false);
  });

  it('rechaza campos desconocidos (no se filtran datos al servidor)', () => {
    expect(
      esquemaLineaCotizacion.safeParse({ ...lineaValida(), costoInterno: 99 }).success,
    ).toBe(false);
  });
});

describe('esquemaGuardarCotizacion', () => {
  it('acepta el token de concurrencia ISO con offset', () => {
    const analisis = esquemaGuardarCotizacion.safeParse({
      pipelineId: PIPELINE_ID,
      lineas: [lineaValida()],
      actualizadoEnEsperado: '2026-09-13T10:00:00.000Z',
    });

    expect(analisis.success).toBe(true);
    expect(analisis.success && analisis.data.actualizadoEnEsperado).toBe(
      '2026-09-13T10:00:00.000Z',
    );
  });

  it('el token es opcional (compatibilidad con llamadas anteriores)', () => {
    const analisis = esquemaGuardarCotizacion.safeParse({
      pipelineId: PIPELINE_ID,
      lineas: [lineaValida()],
    });

    expect(analisis.success).toBe(true);
    expect(analisis.success && analisis.data.actualizadoEnEsperado).toBeUndefined();
  });

  it('rechaza token con formato no ISO', () => {
    const analisis = esquemaGuardarCotizacion.safeParse({
      pipelineId: PIPELINE_ID,
      lineas: [lineaValida()],
      actualizadoEnEsperado: '13/09/2026 10:00',
    });

    expect(analisis.success).toBe(false);
  });

  it('exige al menos una línea y un pipelineId válido', () => {
    expect(
      esquemaGuardarCotizacion.safeParse({ pipelineId: PIPELINE_ID, lineas: [] }).success,
    ).toBe(false);
    expect(
      esquemaGuardarCotizacion.safeParse({ pipelineId: 'no-uuid', lineas: [lineaValida()] })
        .success,
    ).toBe(false);
  });

  it('rechaza más de 200 líneas (mismo tope que la RPC)', () => {
    const analisis = esquemaGuardarCotizacion.safeParse({
      pipelineId: PIPELINE_ID,
      lineas: Array.from({ length: 201 }, lineaValida),
    });

    expect(analisis.success).toBe(false);
  });
});
