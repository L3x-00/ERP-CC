import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// C31/A2: dos conexiones reales reabriendo la misma operación bloqueada.
const { describir: suite, crearClienteServicio } = prepararSuiteSupabaseLocal(
  'C31 A2 concurrencia de reapertura',
);

type Cliente = SupabaseClient<Database>;

suite('C31/A2: doble clic y dos administradores reabriendo la misma operación', () => {
  let servicio: Cliente;
  let segundoServicio: Cliente;
  let adminId = '';
  let admin2Id = '';
  const authIds: string[] = [];
  const clientes: string[] = [];
  const materiales: string[] = [];
  const recursos: string[] = [];
  const ordenes: string[] = [];
  const partidas: string[] = [];
  const programaciones: string[] = [];

  async function crearAdmin(nombre: string): Promise<string> {
    const correo = `c31a2-${randomUUID()}@orca.local`;
    const alta = await servicio.auth.admin.createUser({
      email: correo, password: `C31a2!${randomUUID()}Aa`, email_confirm: true,
    });
    if (alta.error || !alta.data.user) throw alta.error ?? new Error('No se creó el administrador');
    const id = alta.data.user.id;
    authIds.push(id);
    const perfil = await servicio.from('usuarios')
      .update({ rol: 'admin', activo: true, nombre_completo: nombre })
      .eq('id', id);
    if (perfil.error) throw perfil.error;
    return id;
  }

  async function crearOperacionBloqueada(): Promise<{ programacionId: string; ordenId: string }> {
    const sufi = randomUUID().slice(0, 8).toUpperCase();
    const cliente = await servicio.from('clientes')
      .insert({ razon_social: `C31A2 ${sufi} SA`, nombre_comercial: `C31A2 ${sufi}`, estado: 'activo' })
      .select('id').single();
    if (cliente.error || !cliente.data) throw cliente.error ?? new Error('Sin cliente');
    clientes.push(cliente.data.id);

    const material = await servicio.from('catalogo_materiales')
      .insert({ codigo: `A2${sufi}`, nombre: `Material ${sufi}` })
      .select('id').single();
    if (material.error || !material.data) throw material.error ?? new Error('Sin material');
    materiales.push(material.data.id);

    const recurso = await servicio.from('recursos_planeacion')
      .insert({ codigo: `A2-${sufi}`, nombre: `Láser ${sufi}`, area: 'taller', activo: true })
      .select('id').single();
    if (recurso.error || !recurso.data) throw recurso.error ?? new Error('Sin recurso');
    recursos.push(recurso.data.id);
    const capacidad = await servicio.from('capacidades_recurso_turno')
      .insert({ recurso_id: recurso.data.id, turno: 'matutino', horas_capacidad: 8 });
    if (capacidad.error) throw capacidad.error;

    const folio = await servicio.rpc('generar_folio_orden', { p_prefijo: 'OP' });
    if (folio.error || !folio.data) throw folio.error ?? new Error('Sin folio');
    const orden = await servicio.from('ordenes_produccion')
      .insert({
        folio: folio.data as string, cliente_id: cliente.data.id,
        estado: 'pausada', fecha_compromiso: '2099-12-31T00:00:00Z',
      })
      .select('id').single();
    if (orden.error || !orden.data) throw orden.error ?? new Error('Sin orden');
    ordenes.push(orden.data.id);

    const partida = await servicio.from('partidas_orden_produccion')
      .insert({
        orden_id: orden.data.id, codigo_pieza: `A2-${sufi}`, descripcion: 'Pieza A2',
        cantidad_solicitada: 5, unidad_medida: 'pieza', procesos: ['LASER_FIBRA'],
        catalogo_material_id: material.data.id,
      })
      .select('id').single();
    if (partida.error || !partida.data) throw partida.error ?? new Error('Sin partida');
    partidas.push(partida.data.id);

    const metas = await servicio.from('metas_proceso_partida')
      .select('id').eq('partida_id', partida.data.id).order('secuencia');
    if (metas.error || !metas.data?.[0]) throw metas.error ?? new Error('Sin metas');

    const programacion = await servicio.from('programacion_areas')
      .insert({
        orden_id: orden.data.id, partida_id: partida.data.id, recurso_id: recurso.data.id,
        secuencia: 1, estado_planeacion: 'bloqueada',
        fecha_programada: new Date().toISOString().slice(0, 10),
        turno: 'matutino', horas_estimadas: 4, meta_proceso_id: metas.data[0].id,
      })
      .select('id').single();
    if (programacion.error || !programacion.data) throw programacion.error ?? new Error('Sin programación');
    programaciones.push(programacion.data.id);
    return { programacionId: programacion.data.id, ordenId: orden.data.id };
  }

  beforeAll(async () => {
    servicio = crearClienteServicio();
    segundoServicio = crearClienteServicio();
    adminId = await crearAdmin('Admin A2 concurrente');
    admin2Id = await crearAdmin('Admin A2 segundo');
  });

  afterAll(async () => {
    if (programaciones.length) await servicio.from('programacion_areas').delete().in('id', programaciones);
    if (partidas.length) await servicio.from('partidas_orden_produccion').delete().in('id', partidas);
    if (ordenes.length) await servicio.from('ordenes_produccion').delete().in('id', ordenes);
    if (recursos.length) await servicio.from('recursos_planeacion').delete().in('id', recursos);
    if (materiales.length) await servicio.from('catalogo_materiales').delete().in('id', materiales);
    if (clientes.length) await servicio.from('clientes').delete().in('id', clientes);
    for (const id of authIds) {
      await servicio.from('usuarios').delete().eq('id', id);
      await servicio.auth.admin.deleteUser(id);
    }
  });

  it('dos clics con el mismo correlation reabren una sola vez', async () => {
    const { programacionId, ordenId } = await crearOperacionBloqueada();
    const correlationId = randomUUID();
    const argumentos = { p_programacion_id: programacionId, p_actor_id: adminId, p_correlation_id: correlationId };
    const [primero, segundo] = await Promise.all([
      servicio.rpc('reabrir_operacion_bloqueada', argumentos),
      segundoServicio.rpc('reabrir_operacion_bloqueada', argumentos),
    ]);
    expect(primero.error).toBeNull();
    expect(segundo.error).toBeNull();
    const valores = [primero.data, segundo.data].map((dato) => (dato as { ya_aplicado?: boolean }).ya_aplicado);
    expect(valores.filter((valor) => valor === false)).toHaveLength(1);
    expect(valores.filter((valor) => valor === true)).toHaveLength(1);

    const eventos = await servicio.from('orden_eventos_cambio')
      .select('id')
      .eq('orden_id', ordenId)
      .eq('tipo', 'reapertura_operacion_bloqueada');
    expect(eventos.error).toBeNull();
    expect(eventos.data).toHaveLength(1);
  });

  it('dos administradores con correlations distintos no duplican la reapertura', async () => {
    const { programacionId } = await crearOperacionBloqueada();
    const resultados = await Promise.allSettled([
      servicio.rpc('reabrir_operacion_bloqueada', {
        p_programacion_id: programacionId, p_actor_id: adminId, p_correlation_id: randomUUID(),
      }),
      segundoServicio.rpc('reabrir_operacion_bloqueada', {
        p_programacion_id: programacionId, p_actor_id: admin2Id, p_correlation_id: randomUUID(),
      }),
    ]);
    const exitosos = resultados.filter((resultado) => resultado.status === 'fulfilled' && !resultado.value.error);
    expect(exitosos).toHaveLength(1);
  });
});
