import { describe, expect, it } from 'vitest';

import type { ValidacionRfqListo } from '@/modulos/rfq/tipos/indice';
import {
  pasoSugeridoCaptura,
  pasosConFaltantesCaptura,
  pestanaPorPasoCaptura,
} from '@/modulos/rfq/utilidades/pasos-captura';

function validacion(
  secciones: Partial<ValidacionRfqListo['secciones']> = {},
): ValidacionRfqListo {
  const completas = {
    cliente: [],
    general: [],
    items: [],
    archivos: [],
    seguimiento: [],
    ...secciones,
  };
  return { listo: Object.values(completas).every((faltantes) => faltantes.length === 0), secciones: completas };
}

describe('pasos del flujo durable RFQ (C1.2b)', () => {
  it('reanuda en el primer paso incompleto según el orden del cliente', () => {
    expect(
      pasoSugeridoCaptura(
        validacion({
          cliente: ['Falta cliente'],
          items: ['Falta un ítem'],
          archivos: ['Falta archivo'],
        }),
      ),
    ).toBe('cliente');
    expect(
      pasoSugeridoCaptura(
        validacion({ seguimiento: ['Falta próxima acción'], items: ['Falta un ítem'] }),
      ),
    ).toBe('solicitud');
    expect(pasoSugeridoCaptura(validacion({ items: ['Falta un ítem'] }))).toBe('items');
    expect(pasoSugeridoCaptura(validacion({ archivos: ['Falta archivo'] }))).toBe('archivos');
  });

  it('lleva a Revisar cuando ya no hay faltantes', () => {
    expect(pasoSugeridoCaptura(validacion())).toBe('revisar');
  });

  it('marca todos los pasos relacionados con faltantes sin duplicarlos', () => {
    expect(
      pasosConFaltantesCaptura(
        validacion({
          general: ['Falta descripción'],
          seguimiento: ['Falta próxima acción'],
          items: ['Falta un ítem'],
        }),
      ),
    ).toEqual(['solicitud', 'items']);
  });

  it('mapea Cliente/Solicitud al Resumen y conserva los pasos operables', () => {
    expect(pestanaPorPasoCaptura('cliente')).toBe('resumen');
    expect(pestanaPorPasoCaptura('solicitud')).toBe('resumen');
    expect(pestanaPorPasoCaptura('items')).toBe('items');
    expect(pestanaPorPasoCaptura('archivos')).toBe('archivos');
    expect(pestanaPorPasoCaptura('revisar')).toBe('revisar');
  });
});
