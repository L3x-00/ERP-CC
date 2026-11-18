import { describe, expect, it } from 'vitest';

import {
  ErrorComentarios,
  marcarNotificacionesComoLeidas,
  type ClienteComentarios,
} from '@/modulos/comentarios/servicios/comentarios-servicio';

type FilaActualizada = { id: string };

function clienteFalso(resultado: { data: FilaActualizada[] | null; error: { message: string } | null }) {
  const filtros: Array<{ columna: string; valor: unknown }> = [];
  let valores: Record<string, unknown> | null = null;

  const cadena = {
    update(valoresActualizados: Record<string, unknown>) {
      valores = valoresActualizados;
      return cadena;
    },
    eq(columna: string, valor: unknown) {
      filtros.push({ columna, valor });
      return cadena;
    },
    select() {
      return Promise.resolve(resultado);
    },
  };

  return {
    cliente: { from: () => cadena } as unknown as ClienteComentarios,
    filtros,
    valores: () => valores,
  };
}

describe('marcar todas las notificaciones como leídas', () => {
  it('marca solo las pendientes del usuario y devuelve cuántas cambió', async () => {
    const falso = clienteFalso({
      data: [{ id: 'a' }, { id: 'b' }],
      error: null,
    });

    const actualizadas = await marcarNotificacionesComoLeidas(falso.cliente, 'usuario-1');

    expect(actualizadas).toBe(2);
    expect(falso.valores()).toEqual({ leida: true });
    expect(falso.filtros).toEqual([
      { columna: 'usuario_id', valor: 'usuario-1' },
      { columna: 'leida', valor: false },
    ]);
  });

  it('devuelve cero cuando no había notificaciones pendientes', async () => {
    const falso = clienteFalso({ data: [], error: null });

    await expect(marcarNotificacionesComoLeidas(falso.cliente, 'usuario-1')).resolves.toBe(0);
  });

  it('traduce el fallo de Supabase en un error de comentarios', async () => {
    const falso = clienteFalso({ data: null, error: { message: 'boom' } });

    await expect(marcarNotificacionesComoLeidas(falso.cliente, 'usuario-1'))
      .rejects.toBeInstanceOf(ErrorComentarios);
  });
});
