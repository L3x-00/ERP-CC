import { describe, expect, it } from 'vitest';

import {
  ahoraHoraInput,
  fechaHoraNegocioDesdeHora,
} from '@/modulos/produccion/utilidades/horas-extra';

describe('C31/A13 — hora de cierre sin fecha', () => {
  it('el valor prellenado es solo hora', () => {
    expect(ahoraHoraInput(new Date('2026-11-20T18:55:00Z'))).toMatch(/^\d{2}:\d{2}$/);
  });

  it('la fecha se deriva del día de negocio y no la teclea el operador', () => {
    expect(fechaHoraNegocioDesdeHora('10:55', '2026-11-20')).toBe('2026-11-20T10:55');
  });

  it('acepta el valor con segundos que puede devolver el navegador', () => {
    expect(fechaHoraNegocioDesdeHora('10:55:00', '2026-11-20')).toBe('2026-11-20T10:55');
  });
});
