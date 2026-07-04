import { describe, expect, it } from 'vitest';
import { bloqueoVigente } from '@/nucleo/autenticacion/limitar-intentos';

// Solo se prueba `bloqueoVigente` (función pura). El resto de
// limitar-intentos.ts (estaBloqueado/registrarIntentoFallido/limpiarIntentos)
// requiere Supabase real — no se mockea, siguiendo la convención del
// proyecto de no simular la base de datos en pruebas unitarias.
describe('bloqueoVigente', () => {
  it('sin bloqueado_hasta → no vigente', () => {
    expect(bloqueoVigente(null)).toBe(false);
  });

  it('bloqueado_hasta en el futuro → vigente', () => {
    const ahora = new Date('2026-07-03T10:00:00.000Z');
    expect(bloqueoVigente('2026-07-03T10:05:00.000Z', ahora)).toBe(true);
  });

  it('bloqueado_hasta en el pasado → no vigente', () => {
    const ahora = new Date('2026-07-03T10:00:00.000Z');
    expect(bloqueoVigente('2026-07-03T09:59:00.000Z', ahora)).toBe(false);
  });

  it('bloqueado_hasta exactamente ahora → no vigente (borde estricto)', () => {
    const ahora = new Date('2026-07-03T10:00:00.000Z');
    expect(bloqueoVigente('2026-07-03T10:00:00.000Z', ahora)).toBe(false);
  });
});
