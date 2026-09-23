import { randomUUID } from 'node:crypto';
import { type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// Nunca carga .env.local: el helper rechaza cualquier URL que no sea loopback.
const { describir: suite, crearClienteServicio } = prepararSuiteSupabaseLocal(
  'PIN de operadores bajo concurrencia',
);

suite('dos administradores compiten por el mismo PIN', () => {
  let clienteA: SupabaseClient<Database>;
  let clienteB: SupabaseClient<Database>;
  const usuarios: string[] = [];
  const actores: string[] = [];
  const operadores: string[] = [];

  beforeAll(async () => {
    clienteA = crearClienteServicio();
    clienteB = crearClienteServicio();
    for (const [indice, rol] of ['admin', 'admin', 'vendedor', 'vendedor'].entries()) {
      const creado = await clienteA.auth.admin.createUser({
        email: `a17-${randomUUID()}@orca.local`,
        password: `A17!${randomUUID()}`,
        email_confirm: true,
      });
      if (creado.error || !creado.data.user) throw new Error(creado.error?.message ?? 'Sin usuario');
      const id = creado.data.user.id;
      usuarios.push(id);
      if (indice < 2) {
        const { error } = await clienteA.from('usuarios').update({ rol }).eq('id', id);
        if (error) throw error;
        actores.push(id);
      } else {
        operadores.push(id);
      }
    }
  });

  afterAll(async () => {
    if (!clienteA) return;
    for (const id of usuarios) {
      await clienteA.from('logs').delete().eq('usuario_id', id);
      await clienteA.auth.admin.deleteUser(id);
    }
  });

  it('serializa dos conexiones: exactamente una escritura gana y la otra recibe duplicado', async () => {
    // PIN aleatorio local para evitar colisiones con fixtures históricos.
    const pin = String(100000 + Math.floor(Math.random() * 900000));
    const respuestas = await Promise.all([
      clienteA.rpc('guardar_operador_admin', {
        p_actor_id: actores[0], p_operador_id: operadores[0],
        p_nombre: 'Operador simultáneo A', p_pin: pin, p_activo: true,
      }),
      clienteB.rpc('guardar_operador_admin', {
        p_actor_id: actores[1], p_operador_id: operadores[1],
        p_nombre: 'Operador simultáneo B', p_pin: pin, p_activo: true,
      }),
    ]);
    expect(respuestas.filter((r) => r.error === null)).toHaveLength(1);
    expect(respuestas.filter((r) => r.error?.message.includes('pin_duplicado'))).toHaveLength(1);

    const { data, error } = await clienteA.from('usuarios')
      .select('id, rol, pin_operador').in('id', operadores);
    if (error) throw error;
    expect(data.filter((fila) => fila.rol === 'operador' && fila.pin_operador)).toHaveLength(1);
    expect(data.filter((fila) => fila.rol === 'vendedor' && !fila.pin_operador)).toHaveLength(1);
  });
});
