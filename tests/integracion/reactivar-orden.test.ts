import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// PRD-15: reactivación administrativa con CAS y bloqueos de entrega/cobro.
const { describir: suite, crearClienteServicio, crearClienteAnonimo } = prepararSuiteSupabaseLocal(
  'reactivación de orden PRD-15', { requiereClaveAnonima: true },
);

suite('PRD-15: reactivar una orden Lista conservando la ejecución previa', () => {
  let servicio: SupabaseClient<Database>;
  let operador: SupabaseClient<Database>;
  let administradorId = '';
  let operadorId = '';
  let clienteId = '';
  let recursoId = '';
  const usuarios: string[] = [];
  const ordenes: string[] = [];

  async function crearUsuario(rol: 'admin' | 'operador') {
    const correo = `prd15-${randomUUID()}@orca.local`;
    const clave = `Prd15!${randomUUID()}Aa`;
    const alta = await servicio.auth.admin.createUser({ email: correo, password: clave, email_confirm: true });
    if (alta.error || !alta.data.user) throw alta.error ?? new Error('No se creó usuario');
    usuarios.push(alta.data.user.id);
    const perfil = await servicio.from('usuarios').update({ rol, activo: true }).eq('id', alta.data.user.id);
    if (perfil.error) throw perfil.error;
    const cliente = crearClienteAnonimo();
    const ingreso = await cliente.auth.signInWithPassword({ email: correo, password: clave });
    if (ingreso.error) throw ingreso.error;
    return { id: alta.data.user.id, cliente };
  }

  /** Crea una orden completada con una sesión previa y un avance. */
  async function crearCompletada() {
    const { data: folio, error: errorFolio } = await servicio.rpc('generar_folio_orden', { p_prefijo: 'OP' });
    if (errorFolio || !folio) throw errorFolio ?? new Error('Sin folio');
    const { data: orden, error: errorOrden } = await servicio.from('ordenes_produccion')
      .insert({
        folio, cliente_id: clienteId, estado: 'en_proceso',
        fecha_compromiso: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select('id, actualizado_en').single();
    if (errorOrden || !orden) throw errorOrden ?? new Error('Sin orden');
    ordenes.push(orden.id);
    const { data: partida, error: errorPartida } = await servicio.from('partidas_orden_produccion')
      .insert({
        orden_id: orden.id, codigo_pieza: 'P15-INT', cantidad_solicitada: 4,
        unidad_medida: 'pza', operador_asignado_id: operadorId, procesos: ['Corte'],
      })
      .select('id').single();
    if (errorPartida || !partida) throw errorPartida ?? new Error('Sin partida');
    const { data: programacion } = await servicio.from('programacion_areas')
      .insert({
        orden_id: orden.id, partida_id: partida.id, recurso_id: recursoId,
        secuencia: 1, estado_planeacion: 'completada', fecha_programada: '2099-12-30',
        turno: 'matutino', horas_estimadas: 2,
      })
      .select('id').single();
    await servicio.from('sesiones_trabajo').insert({
      orden_id: orden.id, partida_id: partida.id, programacion_id: programacion!.id,
      operador_id: operadorId, estado_sesion: 'finalizada',
      fecha_inicio: new Date(Date.now() - 7_200_000).toISOString(),
      fecha_fin: new Date(Date.now() - 3_600_000).toISOString(),
      horas_brutas: 1, horas_netas: 1, piezas_producidas: 4,
    });
    await servicio.rpc('registrar_avance_partida_op', {
      p_partida_id: partida.id, p_operador_id: operadorId,
      p_cantidad_producida: 4, p_cantidad_scrap: 0,
    });
    const { data: actual } = await servicio.from('ordenes_produccion')
      .select('estado, actualizado_en').eq('id', orden.id).single();
    return { ordenId: orden.id, partidaId: partida.id, estado: actual?.estado, token: actual!.actualizado_en };
  }

  beforeAll(async () => {
    servicio = crearClienteServicio();
    administradorId = (await crearUsuario('admin')).id;
    const persona = await crearUsuario('operador');
    operadorId = persona.id;
    operador = persona.cliente;
    const { data: cliente, error } = await servicio.from('clientes')
      .insert({
        nombre_comercial: `PRD15 ${randomUUID().slice(0, 6)}`,
        razon_social: 'PRD15 SA',
        estado: 'activo',
      })
      .select('id').single();
    if (error || !cliente) throw error ?? new Error('Sin cliente');
    clienteId = cliente.id;
    const { data: recurso } = await servicio.from('recursos_planeacion')
      .insert({
        codigo: `PRD15-${randomUUID().slice(0, 6).toUpperCase()}`,
        nombre: 'Recurso PRD-15', area: 'taller', activo: true,
      })
      .select('id').single();
    recursoId = recurso!.id;
  });

  afterAll(async () => {
    if (!servicio) return;
    for (const ordenId of ordenes) {
      const { data: partidas } = await servicio.from('partidas_orden_produccion')
        .select('id').eq('orden_id', ordenId);
      const partidaIds = (partidas ?? []).map((fila) => fila.id);
      if (partidaIds.length > 0) {
        await servicio.from('registros_avance_partida').delete().in('partida_id', partidaIds);
      }
      await servicio.from('sesiones_trabajo').delete().eq('orden_id', ordenId);
      await servicio.from('programacion_areas').delete().eq('orden_id', ordenId);
      await servicio.from('partidas_orden_produccion').delete().eq('orden_id', ordenId);
      await servicio.from('cuentas_por_cobrar').delete().eq('orden_id', ordenId);
      await servicio.from('notas_entrega').delete().eq('orden_id', ordenId);
      await servicio.from('ordenes_produccion').delete().eq('id', ordenId);
    }
    await servicio.from('recursos_planeacion').delete().eq('id', recursoId);
    await servicio.from('clientes').delete().eq('id', clienteId);
    if (usuarios.length > 0) {
      await servicio.from('logs').delete().in('usuario_id', usuarios);
      await servicio.from('usuarios').delete().in('id', usuarios);
      for (const id of usuarios) await servicio.auth.admin.deleteUser(id);
    }
  });

  it('reactiva con CAS válido y conserva sesiones, avances y cantidades', async () => {
    const caso = await crearCompletada();
    expect(caso.estado).toBe('completada');
    const { data, error } = await servicio.rpc('reactivar_orden_op', {
      p_orden_id: caso.ordenId,
      p_actualizado_en: caso.token,
      p_actor_id: administradorId,
    });
    expect(error).toBeNull();
    expect(data?.[0]?.estado).toBe('en_proceso');
    expect(data?.[0]?.fecha_fin).toBeNull();

    const { data: sesiones } = await servicio.from('sesiones_trabajo')
      .select('id').eq('orden_id', caso.ordenId);
    expect(sesiones ?? []).toHaveLength(1);
    const { data: avances } = await servicio.from('registros_avance_partida')
      .select('id').eq('partida_id', caso.partidaId);
    expect(avances ?? []).toHaveLength(1);
    const { data: partida } = await servicio.from('partidas_orden_produccion')
      .select('cantidad_producida').eq('id', caso.partidaId).single();
    expect(Number(partida?.cantidad_producida)).toBe(4);
  });

  it('rechaza un token CAS vencido sin cambiar el estado', async () => {
    const caso = await crearCompletada();
    const respuesta = await servicio.rpc('reactivar_orden_op', {
      p_orden_id: caso.ordenId,
      p_actualizado_en: new Date(Date.now() - 86_400_000).toISOString(),
      p_actor_id: administradorId,
    });
    expect(respuesta.error?.message).toContain('orden_desactualizada');
    const { data: orden } = await servicio.from('ordenes_produccion')
      .select('estado').eq('id', caso.ordenId).single();
    expect(orden?.estado).toBe('completada');
  });

  it('no reactiva una orden entregada/archivada ni una con cuenta cobrable', async () => {
    const entregada = await crearCompletada();
    await servicio.from('ordenes_produccion')
      .update({ archivada_en: new Date().toISOString() }).eq('id', entregada.ordenId);
    const { data: tokenEntregada } = await servicio.from('ordenes_produccion')
      .select('actualizado_en').eq('id', entregada.ordenId).single();
    const rechazoEntrega = await servicio.rpc('reactivar_orden_op', {
      p_orden_id: entregada.ordenId,
      p_actualizado_en: tokenEntregada!.actualizado_en,
      p_actor_id: administradorId,
    });
    expect(rechazoEntrega.error?.message).toContain('orden_entregada_no_reactivable');

    const cobrable = await crearCompletada();
    await servicio.from('cuentas_por_cobrar').insert({
      orden_id: cobrable.ordenId, cliente_id: clienteId, monto_total: 100,
      saldo_pendiente: 100, moneda: 'MXN', tipo_cambio_origen: 1, estado: 'pendiente',
      cobrable_desde: new Date().toISOString(),
      fecha_vencimiento: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const { data: tokenCobrable } = await servicio.from('ordenes_produccion')
      .select('actualizado_en').eq('id', cobrable.ordenId).single();
    const rechazoCobro = await servicio.rpc('reactivar_orden_op', {
      p_orden_id: cobrable.ordenId,
      p_actualizado_en: tokenCobrable!.actualizado_en,
      p_actor_id: administradorId,
    });
    expect(rechazoCobro.error?.message).toContain('orden_entregada_no_reactivable');
  });

  it('solo una orden completada y solo con permiso administrativo', async () => {
    const activa = await servicio.from('ordenes_produccion').insert({
      folio: (await servicio.rpc('generar_folio_orden', { p_prefijo: 'OP' })).data!,
      cliente_id: clienteId, estado: 'programada',
      fecha_compromiso: new Date(Date.now() + 86_400_000).toISOString(),
    }).select('id, actualizado_en').single();
    ordenes.push(activa.data!.id);
    const noCompletada = await servicio.rpc('reactivar_orden_op', {
      p_orden_id: activa.data!.id,
      p_actualizado_en: activa.data!.actualizado_en,
      p_actor_id: administradorId,
    });
    expect(noCompletada.error?.message).toContain('orden_no_reactivable');

    const caso = await crearCompletada();
    const sinPermiso = await operador.rpc('reactivar_orden_op', {
      p_orden_id: caso.ordenId,
      p_actualizado_en: caso.token,
      p_actor_id: operadorId,
    });
    expect(sinPermiso.error).not.toBeNull();
  });
});
