import { type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// Consume secuencias de folio reales: solo puede correr contra el stack local.
const { describir, crearClienteServicio } = prepararSuiteSupabaseLocal(
  'folios de pipeline bajo concurrencia',
);

describir('folios de pipeline bajo concurrencia (integración)', () => {
  let cliente: SupabaseClient<Database>;

  beforeAll(() => {
    // El cliente se abre dentro de beforeAll (no en el cuerpo del describe)
    // porque el factory de un describe.skip igual se ejecuta al recolectar.
    cliente = crearClienteServicio();
  });

  it('10 llamadas concurrentes a generar_folio_op producen 10 folios distintos', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 10 }, () => cliente.rpc('generar_folio_op')),
    );

    const folios: string[] = [];
    for (const resultado of resultados) {
      expect(resultado.error).toBeNull();
      expect(resultado.data).toBeTruthy();
      folios.push(resultado.data ?? '');
    }

    expect(new Set(folios).size).toBe(10);
    for (const folio of folios) {
      expect(folio).toMatch(/^OP-\d{4,}$/);
    }
  });

  it('10 llamadas concurrentes a generar_folio_cnc producen 10 folios distintos', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 10 }, () => cliente.rpc('generar_folio_cnc')),
    );

    const folios: string[] = [];
    for (const resultado of resultados) {
      expect(resultado.error).toBeNull();
      expect(resultado.data).toBeTruthy();
      folios.push(resultado.data ?? '');
    }

    expect(new Set(folios).size).toBe(10);
    for (const folio of folios) {
      expect(folio).toMatch(/^CNC-\d{4}-\d{4,}$/);
    }
  });
});
