import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

const { describir: suite, crearClienteServicio, crearClienteAnonimo } = prepararSuiteSupabaseLocal(
  'Bitácora A18 y RLS', { requiereClaveAnonima: true },
);

suite('A18: bitácora durable con roles reales', () => {
  let servicio: SupabaseClient<Database>;
  let administrador: SupabaseClient<Database>;
  let gerente: SupabaseClient<Database>;
  const usuarios: string[] = [];
  const recurso = randomUUID();
  let gerenteId = '';

  async function crearUsuario(rol: 'admin' | 'gerente') {
    const email = `a18-${randomUUID()}@orca.local`;
    const password = `A18!${randomUUID()}`;
    const alta = await servicio.auth.admin.createUser({ email, password, email_confirm: true });
    if (alta.error || !alta.data.user) throw new Error(alta.error?.message ?? 'No se creó usuario');
    usuarios.push(alta.data.user.id);
    const perfil = await servicio.from('usuarios').update({ rol, activo: true }).eq('id', alta.data.user.id);
    if (perfil.error) throw perfil.error;
    const cliente = crearClienteAnonimo();
    const ingreso = await cliente.auth.signInWithPassword({ email, password });
    if (ingreso.error) throw ingreso.error;
    return { id: alta.data.user.id, cliente };
  }

  beforeAll(async () => {
    servicio = crearClienteServicio();
    const admin = await crearUsuario('admin');
    const manager = await crearUsuario('gerente');
    administrador = admin.cliente;
    gerente = manager.cliente;
    gerenteId = manager.id;
    const insercion = await servicio.from('logs').insert([
      { usuario_id: admin.id, nombre_usuario: 'A18 Admin', rol: 'admin', accion: 'prueba', modulo: 'auditoria', recurso_id: recurso, detalles: { secreto: 'oculto' } },
      { usuario_id: manager.id, nombre_usuario: 'A18 Gerente', rol: 'gerente', accion: 'prueba', modulo: 'auditoria', recurso_id: recurso, detalles: { secreto: 'oculto' } },
    ]);
    if (insercion.error) throw insercion.error;
  });

  afterAll(async () => {
    if (!servicio) return;
    await servicio.from('logs').delete().eq('recurso_id', recurso);
    for (const id of usuarios) await servicio.auth.admin.deleteUser(id);
  });

  it('administrador ve el historial y gerente solo sus eventos, sin columna sensible', async () => {
    const [todo, propio, anonimo] = await Promise.all([
      administrador.from('logs').select('id, usuario_id').eq('recurso_id', recurso),
      gerente.from('logs').select('id, usuario_id').eq('recurso_id', recurso),
      crearClienteAnonimo().from('logs').select('id').eq('recurso_id', recurso),
    ]);
    expect(todo.error).toBeNull();
    expect(todo.data).toHaveLength(2);
    expect(propio.error).toBeNull();
    expect(propio.data?.map((fila) => fila.usuario_id)).toEqual([gerenteId]);
    expect(anonimo.data ?? []).toHaveLength(0);
    const detalles = await gerente.from('logs').select('detalles').eq('recurso_id', recurso);
    expect(detalles.error).not.toBeNull();
  });

  it('revoca también la lectura directa con JWT previo al desactivar al gerente', async () => {
    const baja = await servicio.from('usuarios').update({ activo: false }).eq('id', gerenteId);
    if (baja.error) throw baja.error;
    const anterior = await gerente.from('logs').select('id').eq('recurso_id', recurso);
    expect(anterior.error).toBeNull();
    expect(anterior.data).toHaveLength(0);
    const historico = await administrador.from('logs').select('id').eq('recurso_id', recurso);
    expect(historico.data).toHaveLength(2);
  });
});
