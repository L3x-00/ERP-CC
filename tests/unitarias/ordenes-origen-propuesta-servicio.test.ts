import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import { obtenerOrigenPropuestaOrdenesServicio } from '@/modulos/ordenes/servicios/origen-propuesta-ordenes-servicio';

type Respuesta = { data: unknown[] | null; error: { message: string } | null };

/** Cadena mínima de PostgREST: registra tabla, select y el lote de `.in('id', …)`. */
function clienteFalso(responder: (lote: string[]) => Respuesta) {
  const llamadas: { tabla: string; seleccion: string; lote: string[] }[] = [];
  const from = vi.fn((tabla: string) => {
    const llamada = { tabla, seleccion: '', lote: [] as string[] };
    llamadas.push(llamada);
    const cadena = {
      select: vi.fn((seleccion: string) => {
        llamada.seleccion = seleccion;
        return cadena;
      }),
      in: vi.fn((_columna: string, lote: string[]) => {
        llamada.lote = lote;
        return Promise.resolve(responder(lote));
      }),
    };
    return cadena;
  });
  return { admin: { from } as unknown as SupabaseClient<Database>, llamadas };
}

const ID_PROPUESTA = '00000000-0000-4000-8000-0000000d1001';

function filaConOrigen(
  ordenId: string,
  propuestas: { id: string; folio_cnc: string } | null,
  letra = 'B',
) {
  return { id: ordenId, propuesta_revisiones: propuestas ? { letra, propuestas } : null };
}

describe('obtenerOrigenPropuestaOrdenesServicio', () => {
  it('devuelve folio, id y letra de la revisión aceptada por orden', async () => {
    const { admin } = clienteFalso(() => ({
      data: [filaConOrigen('orden-1', { id: ID_PROPUESTA, folio_cnc: 'CNC-1026_07' })],
      error: null,
    }));

    const origenes = await obtenerOrigenPropuestaOrdenesServicio(admin, ['orden-1']);

    expect(origenes).toEqual({
      'orden-1': { propuestaId: ID_PROPUESTA, propuestaFolio: 'CNC-1026_07', revisionLetra: 'B' },
    });
  });

  it('lee por la relación congelada de la orden: sin cotización legacy, snapshot ni revisión vigente', async () => {
    const { admin, llamadas } = clienteFalso(() => ({ data: [], error: null }));

    await obtenerOrigenPropuestaOrdenesServicio(admin, ['orden-1']);

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].tabla).toBe('ordenes_produccion');
    expect(llamadas[0].seleccion).toContain('ordenes_produccion_propuesta_revision_id_fkey');
    expect(llamadas[0].seleccion).toContain('propuesta_revisiones_propuesta_id_fkey');
    for (const prohibido of ['pipeline', 'cotizacion', 'snapshot', 'revision_vigente', 'accepted_revision']) {
      expect(llamadas[0].seleccion).not.toContain(prohibido);
    }
  });

  it('no inventa origen: sin revisión (interna manual o histórica) la orden no aparece', async () => {
    const { admin } = clienteFalso(() => ({
      data: [
        filaConOrigen('orden-interna', null),
        filaConOrigen('orden-historica', null),
        filaConOrigen('orden-comercial', { id: ID_PROPUESTA, folio_cnc: 'CNC-1026_08' }, 'A'),
      ],
      error: null,
    }));

    const origenes = await obtenerOrigenPropuestaOrdenesServicio(
      admin, ['orden-interna', 'orden-historica', 'orden-comercial'],
    );

    expect(Object.keys(origenes)).toEqual(['orden-comercial']);
  });

  it('ignora una propuesta sin folio legible y deja la letra en null si viene vacía', async () => {
    const { admin } = clienteFalso(() => ({
      data: [
        filaConOrigen('orden-sin-folio', { id: ID_PROPUESTA, folio_cnc: '   ' }),
        filaConOrigen('orden-sin-letra', { id: ID_PROPUESTA, folio_cnc: 'CNC-1026_09' }, ' '),
      ],
      error: null,
    }));

    const origenes = await obtenerOrigenPropuestaOrdenesServicio(admin, ['orden-sin-folio', 'orden-sin-letra']);

    expect(origenes['orden-sin-folio']).toBeUndefined();
    expect(origenes['orden-sin-letra']).toEqual({
      propuestaId: ID_PROPUESTA, propuestaFolio: 'CNC-1026_09', revisionLetra: null,
    });
  });

  it('consulta en lotes de máximo 100 ids (sin N+1 ni URL de miles de ids)', async () => {
    const ids = Array.from({ length: 250 }, (_, indice) => `orden-${indice}`);
    const { admin, llamadas } = clienteFalso((lote) => ({
      data: lote.map((id) => filaConOrigen(id, { id: ID_PROPUESTA, folio_cnc: `CNC-${id}` })),
      error: null,
    }));

    const origenes = await obtenerOrigenPropuestaOrdenesServicio(admin, ids);

    expect(Object.keys(origenes)).toHaveLength(250);
    expect(llamadas.map((llamada) => llamada.lote.length)).toEqual([100, 100, 50]);
    expect(origenes['orden-249'].propuestaFolio).toBe('CNC-orden-249');
  });

  it('sin órdenes no consulta nada', async () => {
    const { admin, llamadas } = clienteFalso(() => ({ data: [], error: null }));

    await expect(obtenerOrigenPropuestaOrdenesServicio(admin, [])).resolves.toEqual({});
    expect(llamadas).toHaveLength(0);
  });

  it('propaga el error de lectura en vez de mostrarlo como «sin origen»', async () => {
    const { admin } = clienteFalso(() => ({ data: null, error: { message: 'URI too long' } }));

    await expect(obtenerOrigenPropuestaOrdenesServicio(admin, ['orden-1'])).rejects.toThrow('URI too long');
  });
});
