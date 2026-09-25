import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// CLI-08: la repetición reutiliza datos comerciales/técnicos sin copiar la
// ejecución anterior. Escribe fixtures solo en el Supabase local.
const { describir: suite, crearClienteServicio, crearClienteAnonimo } = prepararSuiteSupabaseLocal(
  'repetición de trabajo CLI-08', { requiereClaveAnonima: true },
);

suite('CLI-08: repetir trabajo con folio nuevo y aislamiento de ejecución', () => {
  let servicio: SupabaseClient<Database>;
  let operador: SupabaseClient<Database>;
  let administradorId = '';
  let operadorId = '';
  let clienteId = '';
  const usuarios: string[] = [];
  const ordenes: string[] = [];

  async function crearUsuario(rol: 'admin' | 'operador') {
    const correo = `cli08-${randomUUID()}@orca.local`;
    const clave = `Cli08!${randomUUID()}Aa`;
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

  async function crearHistorica(sufijo: string) {
    const { data, error } = await servicio.rpc('crear_orden_historica', {
      p_cliente_id: clienteId,
      p_actor_id: administradorId,
      p_id_historico: `cli08-${sufijo}`,
      p_fecha_trabajo: '2026-06-01',
      p_fecha_compromiso: new Date(Date.now() + 86_400_000).toISOString(),
      p_condicion_pago: 'credito',
      p_referencia_externa: `EXT-${sufijo}`,
      p_monto_sin_iva: 1200,
      p_monto_iva: 192,
      p_horas_estimadas: 7,
      p_notas: 'ejecución anterior que no debe repetirse',
      p_partidas: [{
        codigo_pieza: `C8-${sufijo}`,
        descripcion: 'Pieza repetible',
        cantidad_solicitada: 6,
        unidad_medida: 'pza',
        tiempo_estimado_minutos: 120,
        procesos: ['Corte', 'Doblez'],
        maquina_asignada: 'CNC-9',
      }],
    });
    if (error || !data?.[0]) throw error ?? new Error('Sin orden histórica');
    ordenes.push(data[0].id);
    return data[0].id;
  }

  beforeAll(async () => {
    servicio = crearClienteServicio();
    administradorId = (await crearUsuario('admin')).id;
    const persona = await crearUsuario('operador');
    operadorId = persona.id;
    operador = persona.cliente;
    const { data: cliente, error } = await servicio.from('clientes')
      .insert({
        nombre_comercial: `CLI08 ${randomUUID().slice(0, 6)}`,
        razon_social: 'CLI08 SA',
        estado: 'activo',
      })
      .select('id').single();
    if (error || !cliente) throw error ?? new Error('Sin cliente');
    clienteId = cliente.id;
  });

  afterAll(async () => {
    if (!servicio) return;
    for (const ordenId of ordenes) {
      await servicio.from('archivos_orden').delete().eq('orden_id', ordenId);
      const { data: partidas } = await servicio.from('partidas_orden_produccion')
        .select('id').eq('orden_id', ordenId);
      const partidaIds = (partidas ?? []).map((fila) => fila.id);
      if (partidaIds.length > 0) {
        await servicio.from('registros_avance_partida').delete().in('partida_id', partidaIds);
        await servicio.from('registros_tiempo_operador').delete().in('partida_id', partidaIds);
      }
      await servicio.from('sesiones_trabajo').delete().eq('orden_id', ordenId);
      await servicio.from('programacion_areas').delete().eq('orden_id', ordenId);
      await servicio.from('partidas_orden_produccion').delete().eq('orden_id', ordenId);
      await servicio.from('cuentas_por_cobrar').delete().eq('orden_id', ordenId);
      await servicio.from('ordenes_produccion').delete().eq('id', ordenId);
    }
    await servicio.from('clientes').delete().eq('id', clienteId);
    if (usuarios.length > 0) {
      await servicio.from('logs').delete().in('usuario_id', usuarios);
      await servicio.from('usuarios').delete().in('id', usuarios);
      for (const id of usuarios) await servicio.auth.admin.deleteUser(id);
    }
  });

  it('clona datos comerciales/técnicos y no copia avances, sesiones ni archivos', async () => {
    const origenId = await crearHistorica(randomUUID().slice(0, 8));
    // Huellas de la ejecución anterior.
    await servicio.from('archivos_orden').insert({
      orden_id: origenId, ruta: `cli08/${origenId}/plano.pdf`, nombre: 'plano.pdf',
      mime: 'application/pdf', tamano: 120, creado_por: administradorId,
    });
    const { data: partidaOrigen } = await servicio.from('partidas_orden_produccion')
      .select('id').eq('orden_id', origenId).single();
    await servicio.from('registros_avance_partida').insert({
      partida_id: partidaOrigen!.id, operador_id: operadorId, cantidad_producida: 3,
    });
    await servicio.from('partidas_orden_produccion').update({ cantidad_producida: 3 })
      .eq('id', partidaOrigen!.id);

    const { data, error } = await servicio.rpc('repetir_orden_op', {
      p_orden_origen_id: origenId,
      p_actor_id: administradorId,
      p_fecha_compromiso: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    expect(error).toBeNull();
    const repetida = data?.[0];
    expect(repetida?.id).toBeTruthy();
    expect(repetida?.folio).not.toBe((await servicio.from('ordenes_produccion')
      .select('folio').eq('id', origenId).single()).data?.folio);
    ordenes.push(repetida!.id);

    const { data: orden } = await servicio.from('ordenes_produccion')
      .select('estado, orden_origen_id, id_historico, notas, referencia_externa, condicion_pago, horas_estimadas')
      .eq('id', repetida!.id).single();
    expect(orden?.estado).toBe('programada');
    expect(orden?.orden_origen_id).toBe(origenId);
    expect(orden?.id_historico).toBeNull();
    expect(orden?.notas).toBeNull();
    expect(orden?.referencia_externa).toMatch(/^EXT-/);
    expect(orden?.condicion_pago).toBe('credito');
    expect(Number(orden?.horas_estimadas)).toBe(7);

    const { data: partidas } = await servicio.from('partidas_orden_produccion')
      .select('cantidad_producida, procesos, maquina_asignada').eq('orden_id', repetida!.id);
    expect(partidas).toHaveLength(1);
    expect(Number(partidas?.[0]?.cantidad_producida)).toBe(0);
    expect(partidas?.[0]?.procesos).toEqual(['Corte', 'Doblez']);
    expect(partidas?.[0]?.maquina_asignada).toBe('CNC-9');

    const { data: metas } = await servicio.from('metas_proceso_partida')
      .select('id').eq('partida_id', (await servicio.from('partidas_orden_produccion')
        .select('id').eq('orden_id', repetida!.id).single()).data!.id);
    expect(metas).toHaveLength(2);

    const { data: avances } = await servicio.from('registros_avance_partida')
      .select('id').in('partida_id', (await servicio.from('partidas_orden_produccion')
        .select('id').eq('orden_id', repetida!.id)).data?.map((fila) => fila.id) ?? []);
    expect(avances ?? []).toHaveLength(0);
    const { data: sesiones } = await servicio.from('sesiones_trabajo')
      .select('id').eq('orden_id', repetida!.id);
    expect(sesiones ?? []).toHaveLength(0);
    const { data: archivos } = await servicio.from('archivos_orden')
      .select('id').eq('orden_id', repetida!.id);
    expect(archivos ?? []).toHaveLength(0);
    const { data: cuenta } = await servicio.from('cuentas_por_cobrar')
      .select('estado, cobrable_desde, monto_total').eq('orden_id', repetida!.id).single();
    expect(cuenta?.estado).toBe('pendiente');
    expect(cuenta?.cobrable_desde).toBeNull();
    expect(Number(cuenta?.monto_total)).toBe(1392);
  });

  it('repite una orden completada sin historial y rechaza una activa', async () => {
    const { data: folio, error: errorFolio } = await servicio.rpc('generar_folio_orden', { p_prefijo: 'OP' });
    if (errorFolio || !folio) throw errorFolio ?? new Error('Sin folio');
    const { data: orden, error: errorOrden } = await servicio.from('ordenes_produccion')
      .insert({
        folio, cliente_id: clienteId, estado: 'en_proceso', prioridad: 'normal',
        fecha_compromiso: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select('id').single();
    if (errorOrden || !orden) throw errorOrden ?? new Error('Sin orden');
    ordenes.push(orden.id);
    const { data: partida } = await servicio.from('partidas_orden_produccion')
      .insert({
        orden_id: orden.id, codigo_pieza: 'COMPL-1', cantidad_solicitada: 5,
        unidad_medida: 'pza', operador_asignado_id: operadorId, procesos: ['Corte'],
      })
      .select('id').single();
    await servicio.rpc('registrar_avance_partida_op', {
      p_partida_id: partida!.id, p_operador_id: operadorId,
      p_cantidad_producida: 5, p_cantidad_scrap: 0,
    });
    const { data: completada } = await servicio.from('ordenes_produccion')
      .select('estado').eq('id', orden.id).single();
    expect(completada?.estado).toBe('completada');

    const { data: repetida, error } = await servicio.rpc('repetir_orden_op', {
      p_orden_origen_id: orden.id,
      p_actor_id: administradorId,
      p_fecha_compromiso: new Date(Date.now() + 40 * 86_400_000).toISOString(),
    });
    expect(error).toBeNull();
    ordenes.push(repetida![0]!.id);
    const { data: partidaNueva } = await servicio.from('partidas_orden_produccion')
      .select('cantidad_producida').eq('orden_id', repetida![0]!.id).single();
    expect(Number(partidaNueva?.cantidad_producida)).toBe(0);

    const { data: folioActiva, error: errorFolioActiva } = await servicio.rpc(
      'generar_folio_orden', { p_prefijo: 'OP' },
    );
    if (errorFolioActiva || !folioActiva) throw errorFolioActiva ?? new Error('Sin folio activo');
    const { data: activa, error: errorActiva } = await servicio.from('ordenes_produccion')
      .insert({
        folio: folioActiva, cliente_id: clienteId, estado: 'programada',
        fecha_compromiso: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select('id').single();
    if (errorActiva || !activa) throw errorActiva ?? new Error('Sin orden activa');
    ordenes.push(activa.id);
    const rechazo = await servicio.rpc('repetir_orden_op', {
      p_orden_origen_id: activa.id,
      p_actor_id: administradorId,
      p_fecha_compromiso: new Date(Date.now() + 40 * 86_400_000).toISOString(),
    });
    expect(rechazo.error?.message).toContain('orden_no_repetible');
  });

  it('un JWT de operador no ejecuta la repetición', async () => {
    const origenId = await crearHistorica(randomUUID().slice(0, 8));
    const respuesta = await operador.rpc('repetir_orden_op', {
      p_orden_origen_id: origenId,
      p_actor_id: administradorId,
      p_fecha_compromiso: new Date(Date.now() + 40 * 86_400_000).toISOString(),
    });
    expect(respuesta.error).not.toBeNull();
  });
});
