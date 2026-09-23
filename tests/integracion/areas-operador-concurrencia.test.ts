import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { actualizarAreasOperadorServicio } from '@/modulos/configuracion/servicios/configuracion-servicio';

// Estos casos escriben fixtures únicamente en el stack local, sin leer .env.local.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
  throw new Error('Áreas de operador: solo se permite Supabase local');
}
const suite = url && clave ? describe : describe.skip;

suite('restricciones de área: atomicidad y dos ediciones simultáneas', () => {
  let admin: SupabaseClient<Database>;
  let segundo: SupabaseClient<Database>;
  let actorId: string;
  let operadorId: string;
  const usuarios: string[] = [];

  beforeAll(async () => {
    const opciones = { auth: { persistSession: false, autoRefreshToken: false } };
    admin = createClient<Database>(url!, clave!, opciones);
    segundo = createClient<Database>(url!, clave!, opciones);
    for (const rol of ['admin', 'operador'] as const) {
      const creada = await admin.auth.admin.createUser({
        email: `a05-${randomUUID()}@orca.local`, password: `A05!${randomUUID()}`, email_confirm: true,
      });
      if (creada.error || !creada.data.user) throw new Error(creada.error?.message ?? 'Sin usuario');
      const id = creada.data.user.id;
      usuarios.push(id);
      const { error } = await admin.from('usuarios').update({ rol, activo: true }).eq('id', id);
      if (error) throw error;
      if (rol === 'admin') actorId = id;
      else operadorId = id;
    }
  });

  afterAll(async () => {
    if (!admin) return;
    if (operadorId) await admin.from('operadores_areas').delete().eq('operador_id', operadorId);
    if (usuarios.length) {
      await admin.from('logs').delete().in('usuario_id', usuarios);
      await admin.from('usuarios').delete().in('id', usuarios);
      for (const id of usuarios) await admin.auth.admin.deleteUser(id);
    }
  });

  async function consultarAreas(): Promise<string[]> {
    const { data, error } = await admin.from('operadores_areas').select('area_codigo')
      .eq('operador_id', operadorId).order('area_codigo');
    if (error) throw error;
    return data.map((fila) => fila.area_codigo);
  }

  for (const areas of [['ACABADOS', 'acabados'], ['ACABADOS', 'A05_INEXISTENTE']]) {
    it(`rechaza ${areas.join('/')} sin eliminar las restricciones anteriores`, async () => {
      await actualizarAreasOperadorServicio(admin, { operadorId, areas: ['ACABADOS'] }, actorId);
      await expect(actualizarAreasOperadorServicio(admin, { operadorId, areas }, actorId)).rejects.toBeTruthy();
      expect(await consultarAreas()).toEqual(['ACABADOS']);
    });
  }

  it('dos clientes guardan conjuntos completos y nunca una mezcla ni restricciones vacías', async () => {
    const primera = ['ACABADOS', 'METAL_MECANICA'];
    const segunda = ['EXTERNO', 'FABRICACION_DIGITAL'];
    // Repite la contención sobre el mismo operador para detectar intercalados
    // DELETE/INSERT; se conserva exactamente uno de los dos conjuntos completos.
    for (let intento = 0; intento < 12; intento++) {
      const resultados = await Promise.allSettled([
        actualizarAreasOperadorServicio(admin, { operadorId, areas: primera }, actorId),
        actualizarAreasOperadorServicio(segundo, { operadorId, areas: segunda }, actorId),
      ]);
      expect(resultados.map((resultado) => resultado.status)).toEqual(['fulfilled', 'fulfilled']);
      expect([primera.join(','), segunda.join(',')]).toContain((await consultarAreas()).join(','));
    }
  });
});
