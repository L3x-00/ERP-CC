// Obs. cliente 2026-10-20: la cola de propuestas muestra la revisión más reciente
// (B sobre A) y la próxima acción en español, con el detalle de «Otro».
import { describe, expect, it } from 'vitest';

import {
  elegirProximaAccion,
  elegirUltimaRevision,
  textoProximaAccion,
} from '@/modulos/propuestas/utilidades/cola-propuestas';

describe('elegirUltimaRevision', () => {
  it('devuelve la letra mayor sin importar el orden de llegada', () => {
    const revisiones = [{ letra: 'B' }, { letra: 'A' }, { letra: 'C' }];
    expect(elegirUltimaRevision(revisiones)?.letra).toBe('C');
    expect(elegirUltimaRevision([{ letra: 'B' }, { letra: 'A' }])?.letra).toBe('B');
  });

  it('prefiere la revisión enviada más nueva aunque la anterior siga en borrador', () => {
    const revisiones = [
      { letra: 'A', estado: 'DRAFT' },
      { letra: 'B', estado: 'SENT' },
    ];
    expect(elegirUltimaRevision(revisiones)?.estado).toBe('SENT');
  });

  it('devuelve null sin revisiones', () => {
    expect(elegirUltimaRevision([])).toBeNull();
  });
});

describe('elegirProximaAccion', () => {
  it('toma la última registrada, no la de fecha más cercana', () => {
    const acciones = [
      { codigo: 'FOLLOW_UP', fecha: '2026-10-01', creado_en: '2026-09-28T10:00:00+00:00' },
      { codigo: 'WAIT_CUSTOMER_RESPONSE', fecha: '2026-10-25', creado_en: '2026-10-19T10:00:00+00:00' },
    ];
    expect(elegirProximaAccion(acciones)?.codigo).toBe('WAIT_CUSTOMER_RESPONSE');
  });

  it('devuelve null sin acciones', () => {
    expect(elegirProximaAccion([])).toBeNull();
  });
});

describe('textoProximaAccion', () => {
  it('traduce los códigos del catálogo', () => {
    expect(textoProximaAccion('WAIT_CUSTOMER_RESPONSE', null)).toBe('Esperar respuesta del cliente');
    expect(textoProximaAccion('FOLLOW_UP', null)).toBe('Seguimiento');
  });

  it('para «Otro» muestra el detalle capturado', () => {
    expect(textoProximaAccion('OTHER', '  Llamar al comprador  ')).toBe('Llamar al comprador');
  });

  it('para «Otro» sin detalle cae a la etiqueta del catálogo', () => {
    expect(textoProximaAccion('OTHER', null)).toBe('Otro');
    expect(textoProximaAccion('OTHER', '   ')).toBe('Otro');
  });
});
