import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// C31/A1: dos conexiones reales sobre la misma pausa/reclamo.Una sola debe
// escribir; la otra recibe idempotencia o error tipado, nunca dos efectos.
const { describir: suite, crearClienteServicio } = prepararSuiteSupabaseLocal(
  'C31 A1 concurrencia de liberación',
);

interface Escenario {
  recursoId: string;
  sesionId: string;
  partidaId: string;
  reclamoId: string;
  operadorId: string;
  correlationId: string;
}

type Cliente = SupabaseClient<Database>;

suite('C31/A1: doble pulsación y dos administradores sobre la misma liberación', () => {
  let servicio: Cliente;
  let segundoServicio: Cliente;
  let gerenteId = '';
  let gerente2Id = '';
  let operadorId = '';
  const authIds: string[] = [];
  const clientes: string[] = [];
  const materiales: string[] = [];
  const recursos: string[] = [];
  const ordenes: string[] = [];
  const partidas: string[] = [];
  const programaciones: string[] = [];
  const sesiones: string[] = [];
  const reclamos: string[] = [];

  async function crearActor(rol: 'gerente' | 'operador', nombre: string): Promise<string> {
    const correo = `c31a1-${randomUUID()}@orca.local`;
    const alta = await servicio.auth.admin.createUser({
      email: correo, password: `C31a1!${randomUUID()}Aa`, email_confirm: true,
    });
    if (alta.error || !alta.data.user) throw alta.error ?? new Error('No se creó el actor');
    const id = alta.data.user.id;
    authIds.push(id);
    const perfil = await servicio.from('usuarios')
      .update({ rol, activo: true, nombre_completo: nombre })
      .eq('id', id);
    if (perfil.error) throw perfil.error;
    return id;
  }

  async function crearEscenario( prefijo: string): Promise<Escenario> {
    const sufi = randomUUID().slice(0, 8).toUpperCase();

    const { data: cliente, error: errorCliente } = await servicio.from('clientes')
      .insert({ razon_social: `C31A1 ${sufi} SA`, nombre_comercial: `C31A1 ${sufi}`, estado: 'activo' })
      .select('id').single();
    if (errorCliente || !cliente) throw errorCliente ?? new Error('Sin cliente');
    clientes.push(cliente.id);

    const { data: material, error: errorMaterial } = await servicio.from('catalogo_materiales')
      .insert({ codigo: `A1${sufi}`, nombre: `Material ${sufi}` })
      .select('id').single();
    if (errorMaterial || !material) throw errorMaterial ?? new Error('Sin material');
    materiales.push(material.id);

    const { data: recurso, error: errorRecurso } = await servicio.from('recursos_planeacion')
      .insert({ codigo: `A1-${sufi}`, nombre: `Láser ${sufi}`, area: 'taller', activo: true })
      .select('id').single();
    if (errorRecurso || !recurso) throw errorRecurso ?? new Error('Sin recurso');
    recursos.push(recurso.id);
    const capacidad = await servicio.from('capacidades_recurso_turno')
      .insert({ recurso_id: recurso.id, turno: 'matutino', horas_capacidad: 8 });
    if (capacidad.error) throw capacidad.error;

    const folioRpc = await servicio.rpc('generar_folio_orden', { p_prefijo: 'OP' });
    if (folioRpc.error || !folioRpc.data) throw folioRpc.error ?? new Error('Sin folio');
    const { data: orden, error: errorOrden } = await servicio.from('ordenes_produccion')
      .insert({
        folio: folioRpc.data as string, cliente_id: cliente.id,
        estado: 'pausada', fecha_compromiso: '2099-12-31T00:00:00Z',
      })
      .select('id').single();
    if (errorOrden || !orden) throw errorOrden ?? new Error('Sin orden');
    ordenes.push(orden.id);

    const { data: partida, error: errorPartida } = await servicio.from('partidas_orden_produccion')
      .insert({
        orden_id: orden.id, codigo_pieza: `${prefijo}-${sufi}`, descripcion: 'Pieza C31A1',
        cantidad_solicitada: 5, unidad_medida: 'pieza', procesos: ['LASER_FIBRA'],
        catalogo_material_id: material.id, operador_asignado_id: operadorId,
      })
      .select('id').single();
    if (errorPartida || !partida) throw errorPartida ?? new Error('Sin partida');
    partidas.push(partida.id);

    const metas = await servicio.from('metas_proceso_partida')
      .select('id').eq('partida_id', partida.id).order('secuencia');
    if (metas.error || !metas.data?.[0]) throw metas.error ?? new Error('Sin metas');

    const { data: programacion, error: errorProgramacion } = await servicio.from('programacion_areas')
      .insert({
        orden_id: orden.id, partida_id: partida.id, recurso_id: recurso.id,
        secuencia: 1, estado_planeacion: 'bloqueada',
        fecha_programada: new Date().toISOString().slice(0, 10),
        turno: 'matutino', horas_estimadas: 4, meta_proceso_id: metas.data[0].id,
      })
      .select('id').single();
    if (errorProgramacion || !programacion) throw errorProgramacion ?? new Error('Sin programación');
    programaciones.push(programacion.id);

    const { data: sesion, error: errorSesion } = await servicio.from('sesiones_trabajo')
      .insert({
        orden_id: orden.id, partida_id: partida.id, programacion_id: programacion.id,
        operador_id: operadorId, fecha_inicio: new Date(Date.now() - 7_200_000).toISOString(),
        fecha_fin: new Date(Date.now() - 3_660_000).toISOString(),
        estado_sesion: 'pausada', motivo_pausa: 'material_pendiente',
        motivo_pausa_codigo: 'MATERIAL', piezas_producidas: 1, horas_netas: 1,
      })
      .select('id').single();
    if (errorSesion || !sesion) throw errorSesion ?? new Error('Sin sesión');
    sesiones.push(sesion.id);

    const { data: reclamo, error: errorReclamo } = await servicio.from('reclamos_proceso_operador')
      .insert({
        orden_id: orden.id, partida_id: partida.id, meta_proceso_id: metas.data[0].id,
        programacion_id: programacion.id, operador_id: operadorId,
        fecha: new Date().toISOString().slice(0, 10), turno: 'matutino',
        horas_estimadas: 4, estado: 'activo',
      })
      .select('id').single();
    if (errorReclamo || !reclamo) throw errorReclamo ?? new Error('Sin reclamo');
    reclamos.push(reclamo.id);

    return {
      recursoId: recurso.id, sesionId: sesion.id, partidaId: partida.id,
      reclamoId: reclamo.id, operadorId, correlationId: randomUUID(),
    };
  }

  beforeAll(async () => {
    servicio = crearClienteServicio();
    segundoServicio = crearClienteServicio();
    gerenteId = await crearActor('gerente', 'Gerente A1 concurrente');
    gerente2Id = await crearActor('gerente', 'Gerente A1 segundo');
    operadorId = await crearActor('operador', 'Operador A1 concurrente');
  });

  afterAll(async () => {
    if (reclamos.length) await servicio.from('reclamos_proceso_operador').delete().in('id', reclamos);
    if (sesiones.length) await servicio.from('sesiones_trabajo').delete().in('id', sesiones);
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

  it('dos clics con el mismo correlation producen una sola liberación', async () => {
    const escenario = await crearEscenario('A1Doble');
    const argumentos = {
      p_recurso_id: escenario.recursoId,
      p_actor_id: gerenteId,
      p_correlation_id: escenario.correlationId,
      p_sesion_id: escenario.sesionId,
    };
    const [primero, segundo] = await Promise.all([
      servicio.rpc('reclamar_recurso_liberado', argumentos),
      segundoServicio.rpc('reclamar_recurso_liberado', argumentos),
    ]);
    expect(primero.error).toBeNull();
    expect(segundo.error).toBeNull();
    const valores = [primero.data, segundo.data].map((dato) => (dato as { ya_aplicado?: boolean }).ya_aplicado);
    expect(valores.filter((valor) => valor === false)).toHaveLength(1);
    expect(valores.filter((valor) => valor === true)).toHaveLength(1);

    const eventos = await servicio.from('registros_tiempo_operador')
      .select('id').eq('partida_id', escenario.partidaId)
      .eq('notas', 'Recurso liberado por administración');
    expect(eventos.data).toHaveLength(1);

    const reclamo = await servicio.from('reclamos_proceso_operador')
      .select('estado').eq('id', escenario.reclamoId).single();
    expect(reclamo.data?.estado).toBe('liberado');
  });

  it('dos administradores con correlations distintos no duplican la liberación', async () => {
    const escenario = await crearEscenario('A1DosAdmins');
    const resultados = await Promise.allSettled([
      servicio.rpc('reclamar_recurso_liberado', {
        p_recurso_id: escenario.recursoId, p_actor_id: gerenteId,
        p_correlation_id: randomUUID(), p_sesion_id: escenario.sesionId,
      }),
      segundoServicio.rpc('reclamar_recurso_liberado', {
        p_recurso_id: escenario.recursoId, p_actor_id: gerente2Id,
        p_correlation_id: randomUUID(), p_sesion_id: escenario.sesionId,
      }),
    ]);
    const exitosos = resultados.filter(
      (resultado) => resultado.status === 'fulfilled' && !resultado.value.error,
    );
    expect(exitosos).toHaveLength(1);

    const eventos = await servicio.from('registros_tiempo_operador')
      .select('id').eq('partida_id', escenario.partidaId)
      .eq('notas', 'Recurso liberado por administración');
    expect(eventos.data).toHaveLength(1);
  });

  it('liberación administrativa y liberación del operador no interbloquean', async () => {
    const escenario = await crearEscenario('A1Locks');
    const [administrativa, operador] = await Promise.allSettled([
      servicio.rpc('reclamar_recurso_liberado', {
        p_recurso_id: escenario.recursoId, p_actor_id: gerenteId,
        p_correlation_id: randomUUID(), p_sesion_id: escenario.sesionId,
      }),
      segundoServicio.rpc('liberar_reclamo_operador', {
        p_reclamo_id: escenario.reclamoId, p_operador_id: operadorId,
      }),
    ]);
    expect(administrativa.status).toBe('fulfilled');
    if (administrativa.status === 'fulfilled') {
      expect(administrativa.value.error).toBeNull();
    }
    expect(operador.status).toBe('fulfilled');
    if (operador.status === 'fulfilled') {
      // El perdedor debe recibir un código tipado de C10 (reclamo ya cerrado
      // u operación aún bloqueada), nunca un timeout por espera circular.
      const mensaje = operador.value.error?.message ?? '';
      expect([
        'reclamo_no_activo',
        'proceso_pausado_no_liberable',
      ].some((codigo) => mensaje.includes(codigo))).toBe(true);
    }
  });
});
