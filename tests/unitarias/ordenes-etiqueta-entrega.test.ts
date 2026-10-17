import { describe, expect, it } from 'vitest';

import { etiquetaEntrega } from '@/modulos/ordenes/utilidades/entrega-orden';

describe('etiquetaEntrega (R13, D4=A)', () => {
  it('producción completada con 50 solicitado y 30 entregados → parcial 30/50', () => {
    expect(etiquetaEntrega({ estadoSii: 'PRODUCCION_COMPLETADA', solicitado: 50, entregado: 30 }))
      .toBe('Entrega parcial 30/50');
  });

  it('producción completada sin entregas → pendiente de entrega', () => {
    expect(etiquetaEntrega({ estadoSii: 'PRODUCCION_COMPLETADA', solicitado: 50, entregado: 0 }))
      .toBe('Pendiente de entrega');
  });

  it('cerrada con entrega completa → sin etiqueta', () => {
    expect(etiquetaEntrega({ estadoSii: 'CERRADA', solicitado: 50, entregado: 50 })).toBeNull();
  });

  it('en producción con parcial histórico → Entrega parcial 20/50', () => {
    expect(etiquetaEntrega({ estadoSii: 'EN_PRODUCCION', solicitado: 50, entregado: 20 }))
      .toBe('Entrega parcial 20/50');
  });

  it('estados previos a la producción → sin etiqueta', () => {
    expect(etiquetaEntrega({ estadoSii: 'CONFIRMADA', solicitado: 50, entregado: 10 })).toBeNull();
    expect(etiquetaEntrega({ estadoSii: 'PLANIFICADA', solicitado: 50, entregado: 0 })).toBeNull();
    expect(etiquetaEntrega({ estadoSii: 'CANCELADA', solicitado: 50, entregado: 10 })).toBeNull();
  });

  it('con solicitado cero no hay base de comparación → sin etiqueta', () => {
    expect(etiquetaEntrega({ estadoSii: 'PRODUCCION_COMPLETADA', solicitado: 0, entregado: 0 })).toBeNull();
  });
});
