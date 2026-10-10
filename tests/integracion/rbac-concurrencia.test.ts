import { randomUUID } from 'node:crypto';
import { type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// Auditoría B1 (H-B1-05, H-B1-06). Escribe fixtures únicamente en el stack
// local, sin leer .env.local, y restaura el estado que toca al terminar.
const { describir: suite, crearClienteServicio } = prepararSuiteSupabaseLocal(
  'RBAC bajo concurrencia (auditoría B1)',
);

suite('guarda de último admin y matriz con control optimista', () => {
  let servicio: SupabaseClient<Database>;
  let segundo: SupabaseClient<Database>;
  const creados: string[] = [];
  let adminA = '';
  let adminB = '';
  let adminsAjenos: string[] = [];
  let matrizContadorOriginal: string[] | null = null;

  async function actualizarActividadPorLotes(ids: string[], activo: boolean): Promise<void> {
    for (let inicio = 0; inicio < ids.length; inicio += 100) {
      const lote = ids.slice(inicio, inicio + 100);
      const { error } = await servicio.from('usuarios').update({ activo }).in('id', lote);
      if (error) throw error;
    }
  }

  async function crearAdmin(): Promise<string> {
    const creada = await servicio.auth.admin.createUser({
      email: `rbac-${randomUUID()}@orca.local`, password: `Rbac!${randomUUID()}`, email_confirm: true,
    });
    if (creada.error || !creada.data.user) throw new Error(creada.error?.message ?? 'Sin usuario');
    const id = creada.data.user.id;
    creados.push(id);
    const { error } = await servicio.from('usuarios').update({ rol: 'admin', activo: true }).eq('id', id);
    if (error) throw error;
    return id;
  }

  async function adminsActivos(): Promise<number> {
    const { count, error } = await servicio.from('usuarios')
      .select('id', { count: 'exact', head: true }).eq('rol', 'admin').eq('activo', true);
    if (error) throw error;
    return count ?? 0;
  }

  async function matrizContador(): Promise<string[]> {
    const { data, error } = await servicio.from('permisos_rol').select('permiso').eq('rol', 'contador');
    if (error) throw error;
    return data.map((fila) => fila.permiso).sort();
  }

  beforeAll(async () => {
    servicio = crearClienteServicio();
    segundo = crearClienteServicio();
    adminA = await crearAdmin();
    adminB = await crearAdmin();
  });

  afterAll(async () => {
    if (!servicio) return;
    if (adminsAjenos.length) {
      await actualizarActividadPorLotes(adminsAjenos, true);
    }
    if (matrizContadorOriginal) {
      await servicio.from('permisos_rol').delete().eq('rol', 'contador');
      await servicio.from('permisos_rol')
        .insert(matrizContadorOriginal.map((permiso) => ({ rol: 'contador', permiso })));
    }
    if (creados.length) {
      await servicio.from('logs').delete().in('usuario_id', creados);
      await servicio.from('usuarios').delete().in('id', creados);
      for (const id of creados) await servicio.auth.admin.deleteUser(id);
    }
  });

  it('dos admins que se degradan mutuamente a la vez nunca dejan el sistema sin admin activo', async () => {
    // La carrera solo existe con exactamente dos admins activos: se desactivan
    // temporalmente los demás y se restauran en afterAll.
    const { data: otros, error } = await servicio.from('usuarios').select('id')
      .eq('rol', 'admin').eq('activo', true).not('id', 'in', `(${adminA},${adminB})`);
    if (error) throw error;
    adminsAjenos = otros.map((fila) => fila.id);
    if (adminsAjenos.length) {
      await actualizarActividadPorLotes(adminsAjenos, false);
    }

    for (let intento = 0; intento < 8; intento++) {
      const { error: errorReinicio } = await servicio.from('usuarios')
        .update({ rol: 'admin', activo: true }).in('id', [adminA, adminB]);
      if (errorReinicio) throw errorReinicio;

      const [primero, segundoResultado] = await Promise.all([
        servicio.rpc('cambiar_rol_usuario', {
          p_usuario_id: adminB, p_rol: 'vendedor', p_actor_id: adminA, p_motivo: 'Prueba de carrera',
        }),
        segundo.rpc('cambiar_rol_usuario', {
          p_usuario_id: adminA, p_rol: 'vendedor', p_actor_id: adminB, p_motivo: 'Prueba de carrera',
        }),
      ]);

      expect(await adminsActivos()).toBe(1);
      expect([primero.error, segundoResultado.error].filter(Boolean)).toHaveLength(1);
    }

    const { error: errorFinal } = await servicio.from('usuarios')
      .update({ rol: 'admin', activo: true }).in('id', [adminA, adminB]);
    if (errorFinal) throw errorFinal;
  });

  it('dos ediciones simultáneas de la matriz: gana una y la otra recibe matriz_desactualizada', async () => {
    matrizContadorOriginal = await matrizContador();
    // Estado inicial conocido: contador sin los dos permisos que cada edición agrega.
    const { error: errorLimpieza } = await servicio.from('permisos_rol').delete()
      .eq('rol', 'contador').in('permiso', ['catalogo_ver', 'actividad_vista']);
    if (errorLimpieza) throw errorLimpieza;
    const esperados = await matrizContador();

    const [edicionA, edicionB] = await Promise.all([
      servicio.rpc('actualizar_permisos_rol', {
        p_rol: 'contador', p_permisos: [...esperados, 'catalogo_ver'],
        p_actor_id: adminA, p_permisos_esperados: esperados,
      }),
      segundo.rpc('actualizar_permisos_rol', {
        p_rol: 'contador', p_permisos: [...esperados, 'actividad_vista'],
        p_actor_id: adminA, p_permisos_esperados: esperados,
      }),
    ]);

    const errores = [edicionA.error, edicionB.error].filter(Boolean);
    expect(errores).toHaveLength(1);
    expect(errores[0]?.message).toContain('matriz_desactualizada');

    const final = await matrizContador();
    const agregados = ['catalogo_ver', 'actividad_vista'].filter((permiso) => final.includes(permiso));
    expect(agregados).toHaveLength(1);
  });
});
