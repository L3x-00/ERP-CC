import { describe, expect, it } from 'vitest';
import { nombreDescargaEfectivo } from '@/modulos/propuestas/acciones/firmar-archivo-propuesta';

describe('nombreDescargaEfectivo — nombre legible sin UUID técnico', () => {
  it('usa el nombre guardado cuando la acción no recibe uno explícito', () => {
    expect(nombreDescargaEfectivo(undefined, 'Propuesta CNC-1126_14-A.pdf'))
      .toBe('Propuesta_CNC-1126_14-A.pdf');
  });

  it('respeta el nombre explícito del botón Descargar', () => {
    expect(nombreDescargaEfectivo('Propuesta CNC-1126_14-A.pdf', 'otro.pdf'))
      .toBe('Propuesta_CNC-1126_14-A.pdf');
  });

  it('derive el nombre de nombre_original, no de la ruta con UUID', () => {
    // El UUID solo vive en ruta_storage; nombre_original ya es legible.
    const nombre = nombreDescargaEfectivo(undefined, 'Propuesta CNC-1126_14-A.pdf');
    expect(nombre).toBe('Propuesta_CNC-1126_14-A.pdf');
    expect(nombre).not.toMatch(/^[0-9a-f]{8}-/);
  });

  it('devuelve undefined si no hay ningún nombre', () => {
    expect(nombreDescargaEfectivo(undefined, null)).toBeUndefined();
  });
});
