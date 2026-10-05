import { describe, expect, it } from 'vitest';

import {
  construirFiltrosActividad,
  parametrosActividadRpc,
} from '@/modulos/auditoria/utilidades/actividad';
import { esquemaFiltrosActividad } from '@/modulos/auditoria/validaciones/esquemas-actividad';

const UUID_RECURSO = '10000000-0000-4000-8000-000000000001';
const UUID_CURSOR = '10000000-0000-4000-8000-000000000002';

describe('filtros de la vista Actividad', () => {
  it('aplica defaults y acepta filtros completos', () => {
    const resultado = esquemaFiltrosActividad.safeParse({
      modulo: 'clientes',
      accion: 'crear',
      recursoId: UUID_RECURSO,
      desde: '2026-10-01T00:00:00-05:00',
      hasta: '2026-10-02T00:00:00Z',
      limite: 60,
      cursorCreado: '2026-10-01T23:00:00+00:00',
      cursorId: UUID_CURSOR,
    });

    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data.limite).toBe(60);

    const filtros = construirFiltrosActividad(resultado.data);
    expect(filtros).toMatchObject({
      modulo: 'clientes',
      accion: 'crear',
      recursoId: UUID_RECURSO,
      limite: 60,
      cursor: { creadoEn: '2026-10-01T23:00:00+00:00', id: UUID_CURSOR },
    });
  });

  it('usa límite 30 por defecto y no inventa cursor', () => {
    const resultado = esquemaFiltrosActividad.parse({});
    expect(resultado.limite).toBe(30);
    expect(construirFiltrosActividad(resultado).cursor).toBeUndefined();
  });

  it.each([
    [{ limite: 0 }],
    [{ limite: 101 }],
    [{ limite: 30.5 }],
    [{ desde: '2026-10-02T00:00:00Z', hasta: '2026-10-01T00:00:00Z' }],
    [{ cursorCreado: '2026-10-01T23:00:00+00:00' }],
    [{ cursorId: UUID_CURSOR }],
    [{ columna: 'detalles' }],
  ])('rechaza entrada inválida %#', (entrada) => {
    expect(esquemaFiltrosActividad.safeParse(entrada).success).toBe(false);
  });

  it('construye argumentos de RPC omitiendo lo vacío y agregando el cursor', () => {
    const filtros = construirFiltrosActividad(
      esquemaFiltrosActividad.parse({
        actorTexto: 'Ana',
        modulo: 'pipeline',
        desde: '2026-10-01T00:00:00Z',
        limite: 30,
        cursorCreado: '2026-10-01T23:00:00+00:00',
        cursorId: UUID_CURSOR,
      }),
    );

    expect(parametrosActividadRpc(filtros, UUID_RECURSO)).toEqual({
      p_actor_id: UUID_RECURSO,
      p_actor_texto: 'Ana',
      p_modulo: 'pipeline',
      p_desde: '2026-10-01T00:00:00Z',
      p_limite: 30,
      p_cursor_creado: '2026-10-01T23:00:00+00:00',
      p_cursor_id: UUID_CURSOR,
    });
  });

  it('recorta espacios de los textos antes de consultar', () => {
    const resultado = esquemaFiltrosActividad.safeParse({
      modulo: '  clientes  ',
      actorTexto: '  Ana  ',
    });
    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data.modulo).toBe('clientes');
    expect(resultado.data.actorTexto).toBe('Ana');
  });
});
