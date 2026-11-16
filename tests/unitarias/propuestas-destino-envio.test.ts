import { describe, expect, it } from 'vitest';

import { evaluarDestinoEnvio } from '@/modulos/propuestas/utilidades/indice';

describe('evaluarDestinoEnvio', () => {
  it('acepta un correo válido sin mostrar mensaje (regresión QA)', () => {
    expect(evaluarDestinoEnvio('CORREO', 'alex@clientedemo.com')).toEqual({
      valido: true,
      error: null,
    });
  });

  it('rechaza un correo sin arroba o con espacios', () => {
    expect(evaluarDestinoEnvio('CORREO', 'alex.clientedemo.com').valido).toBe(false);
    expect(evaluarDestinoEnvio('CORREO', 'alex@cliente demo.com').valido).toBe(false);
  });

  it('no muestra mensaje mientras el campo está vacío', () => {
    expect(evaluarDestinoEnvio('CORREO', '   ')).toEqual({ valido: false, error: null });
  });

  it('acepta el canal en minúsculas (fallback sin catálogo)', () => {
    expect(evaluarDestinoEnvio('correo', 'alex@clientedemo.com').valido).toBe(true);
  });

  it('valida teléfonos con al menos 9 dígitos', () => {
    expect(evaluarDestinoEnvio('WHATSAPP', '+52 664 123 4567').valido).toBe(true);
    expect(evaluarDestinoEnvio('TELEFONO', '664-12-34').valido).toBe(false);
    expect(evaluarDestinoEnvio('TELEFONO', 'abc').error).toContain('9 números');
  });

  it('acepta cualquier destino para canales libres', () => {
    expect(evaluarDestinoEnvio('VISITA', 'Planta del cliente').valido).toBe(true);
  });
});
