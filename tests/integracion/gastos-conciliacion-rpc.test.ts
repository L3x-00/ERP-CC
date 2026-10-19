import { randomUUID } from 'node:crypto';

import { expect, it } from 'vitest';

import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// C10.2: contrato real de la RPC. No sustituye la prueba de acción con mocks:
// aquí el nombre p_orden_id viaja a PostgREST y la función debe existir.
const { describir: suite, crearClienteServicio } = prepararSuiteSupabaseLocal(
  'C10.2 conciliación de costos',
);

suite('C10.2: obtener_conciliacion_costos_orden', () => {
  it('acepta p_orden_id y responde orden_inexistente para un UUID sin Orden', async () => {
    const admin = crearClienteServicio();

    const { data, error } = await admin.rpc('obtener_conciliacion_costos_orden', {
      p_orden_id: randomUUID(),
    });

    expect(data).toBeNull();
    expect(error?.message ?? '').toContain('orden_inexistente');
  });
});
