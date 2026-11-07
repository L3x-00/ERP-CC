import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// B2: contratos reales de PostgREST para AUD-01, AUD-02 y AUD-04.
const { describir: suite, crearClienteServicio } = prepararSuiteSupabaseLocal(
  'B2 producción y calidad',
);

suite('B2: producción, retrabajo y calidad', () => {
  let admin: ReturnType<typeof crearClienteServicio>;
  let adminId = '';
  let operadorId = '';
  let clienteId = '';
  let ordenId = '';
  let partidaConMaterial = '';
  let partidaSinMaterial = '';
  let materialId = '';
  let recursoUno = '';
  let recursoDos = '';
  let programacionUno = '';
  let programacionDos = '';
  let sesionUno = '';
  let sesionDos = '';

  async function crearUsuario(rol: 'admin' | 'operador'): Promise<string> {
    const correo = `b2-${randomUUID()}@orca.local`;
    const clave = `B2!${randomUUID()}Aa`;
    const alta = await admin.auth.admin.createUser({ email: correo, password: clave, email_confirm: true });
    if (alta.error || !alta.data.user) throw alta.error ?? new Error('No se creó usuario');
    const perfil = await admin.from('usuarios').update({ rol, activo: true }).eq('id', alta.data.user.id);
    if (perfil.error) throw perfil.error;
    return alta.data.user.id;
  }

  beforeAll(async () => {
    admin = crearClienteServicio();
    adminId = await crearUsuario('admin');
    operadorId = await crearUsuario('operador');

    const cliente = await admin.from('clientes').insert({
      nombre_comercial: `Cliente B2 ${randomUUID().slice(0, 6)}`,
      razon_social: 'Cliente B2 SA',
      estado: 'activo',
    }).select('id').single();
    if (cliente.error || !cliente.data) throw cliente.error ?? new Error('No se creó el cliente');
    clienteId = cliente.data.id;

    const material = await admin.from('catalogo_materiales').insert({
      codigo: `B2MAT${randomUUID().slice(0, 6).toUpperCase()}`,
      nombre: 'Lámina B2',
      unidad_base: 'kg',
      moneda_costo: 'MXN',
      costo_vigente: 10,
      fecha_vigencia_costo: new Date().toISOString().slice(0, 10),
      costo_confirmado_en: new Date().toISOString(),
      costo_confirmado_por: adminId,
    }).select('id').single();
    if (material.error || !material.data) throw material.error ?? new Error('No se creó el material');
    materialId = material.data.id;

    const orden = await admin.from('ordenes_produccion').insert({
      folio: `OP-${String(Date.now()).slice(-6)}`,
      cliente_id: clienteId,
      estado: 'en_proceso',
      estado_sii: 'EN_PRODUCCION',
      fecha_compromiso: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
    }).select('id').single();
    if (orden.error || !orden.data) throw orden.error ?? new Error('No se creó la orden');
    ordenId = orden.data.id;

    const partidas = await admin.from('partidas_orden_produccion').insert([
      {
        orden_id: ordenId,
        codigo_pieza: 'IT01',
        codigo_item: 'IT01',
        cantidad_solicitada: 10,
        unidad_medida: 'pieza',
        operador_asignado_id: operadorId,
        catalogo_material_id: materialId,
      },
      {
        orden_id: ordenId,
        codigo_pieza: 'IT02',
        codigo_item: 'IT02',
        cantidad_solicitada: 5,
        unidad_medida: 'pieza',
        operador_asignado_id: operadorId,
      },
    ]).select('id, codigo_item');
    if (partidas.error || !partidas.data) throw partidas.error ?? new Error('No se crearon las partidas');
    partidaConMaterial = partidas.data.find((fila) => fila.codigo_item === 'IT01')!.id;
    partidaSinMaterial = partidas.data.find((fila) => fila.codigo_item === 'IT02')!.id;

    const recursos = await admin.from('recursos_planeacion').insert([
      { codigo: `B2R1`, nombre: 'Recurso B2 uno', area: 'taller', activo: true, costo_hora_interno: 50 },
      { codigo: `B2R2`, nombre: 'Recurso B2 dos', area: 'taller', activo: true, costo_hora_interno: 50 },
    ]).select('id, codigo');
    if (recursos.error || !recursos.data) throw recursos.error ?? new Error('No se crearon recursos');
    recursoUno = recursos.data[0]!.id;
    recursoDos = recursos.data[1]!.id;

    const programaciones = await admin.from('programacion_areas').insert([
      {
        orden_id: ordenId, partida_id: partidaConMaterial, recurso_id: recursoUno,
        fecha_programada: new Date().toISOString().slice(0, 10), turno: 'matutino',
        horas_estimadas: 2, secuencia: 1, estado_planeacion: 'en_proceso',
      },
      {
        orden_id: ordenId, partida_id: partidaSinMaterial, recurso_id: recursoDos,
        fecha_programada: new Date().toISOString().slice(0, 10), turno: 'matutino',
        horas_estimadas: 2, secuencia: 1, estado_planeacion: 'en_proceso',
      },
    ]).select('id, partida_id');
    if (programaciones.error || !programaciones.data) throw programaciones.error ?? new Error('No se programó');
    programacionUno = programaciones.data.find((fila) => fila.partida_id === partidaConMaterial)!.id;
    programacionDos = programaciones.data.find((fila) => fila.partida_id === partidaSinMaterial)!.id;

    const sesiones = await admin.from('sesiones_trabajo').insert([
      {
        orden_id: ordenId, partida_id: partidaConMaterial, programacion_id: programacionUno,
        operador_id: operadorId, fecha_inicio: new Date(Date.now() - 3_600_000).toISOString(),
        estado_sesion: 'activa',
      },
      {
        orden_id: ordenId, partida_id: partidaSinMaterial, programacion_id: programacionDos,
        operador_id: operadorId, fecha_inicio: new Date(Date.now() - 3_600_000).toISOString(),
        estado_sesion: 'activa',
      },
    ]).select('id, partida_id');
    if (sesiones.error || !sesiones.data) throw sesiones.error ?? new Error('No se crearon sesiones');
    sesionUno = sesiones.data.find((fila) => fila.partida_id === partidaConMaterial)!.id;
    sesionDos = sesiones.data.find((fila) => fila.partida_id === partidaSinMaterial)!.id;
  });

  afterAll(async () => {
    if (!admin) return;
    const notas = await admin.from('notas_entrega').select('id').eq('orden_id', ordenId);
    const notaIds = (notas.data ?? []).map((nota) => nota.id);
    if (notaIds.length > 0) {
      await admin.from('partidas_nota_entrega').delete().in('nota_entrega_id', notaIds);
      await admin.from('notas_entrega').delete().in('id', notaIds);
    }
    await admin.from('inspecciones_calidad').delete().eq('orden_id', ordenId);
    await admin.from('retrabajos_produccion').delete().eq('orden_id', ordenId);
    await admin.from('registros_consumo_material').delete().in('partida_id', [partidaConMaterial, partidaSinMaterial]);
    await admin.from('registros_avance_partida').delete().in('partida_id', [partidaConMaterial, partidaSinMaterial]);
    await admin.from('sesiones_trabajo').delete().eq('orden_id', ordenId);
    await admin.from('programacion_areas').delete().eq('orden_id', ordenId);
    await admin.from('partidas_orden_produccion').delete().eq('orden_id', ordenId);
    await admin.from('ordenes_produccion').delete().eq('id', ordenId);
    await admin.from('recursos_planeacion').delete().in('id', [recursoUno, recursoDos]);
    await admin.from('catalogo_materiales').delete().eq('id', materialId);
    await admin.from('clientes').delete().eq('id', clienteId);
    for (const id of [adminId, operadorId]) {
      if (!id) continue;
      await admin.from('logs').delete().eq('usuario_id', id);
      await admin.from('usuarios').delete().eq('id', id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it('AUD-02: cierra sin material propio y exige consumo cuando hay material', async () => {
    const sinMaterial = await admin.rpc('cerrar_sesion_trabajo_operador', {
      p_sesion_id: sesionDos,
      p_operador_id: operadorId,
      p_piezas_producidas: 5,
      p_estado_destino: 'finalizada',
    });
    expect(sinMaterial.error).toBeNull();

    const sinConsumo = await admin.rpc('cerrar_sesion_trabajo_operador', {
      p_sesion_id: sesionUno,
      p_operador_id: operadorId,
      p_piezas_producidas: 3,
      p_estado_destino: 'finalizada',
    });
    expect(sinConsumo.error?.message ?? '').toContain('consumo_material_requerido');

    const conConsumo = await admin.rpc('cerrar_sesion_con_consumo_operador', {
      p_sesion_id: sesionUno,
      p_operador_id: operadorId,
      p_piezas_producidas: 3,
      p_material_id: materialId,
      p_cantidad_usada: 2,
      p_cantidad_scrap: 0,
      p_motivo_consumo: 'Consumo de producción',
    });
    expect(conConsumo.error).toBeNull();

    const partida = await admin.from('partidas_orden_produccion')
      .select('cantidad_producida, cantidad_conforme, cantidad_nok_pendiente, cantidad_scrap_definitivo')
      .eq('id', partidaConMaterial).single();
    expect(Number(partida.data?.cantidad_producida)).toBe(3);
    expect(Number(partida.data?.cantidad_conforme)).toBe(3);
    expect(Number(partida.data?.cantidad_nok_pendiente)).toBe(0);
    expect(Number(partida.data?.cantidad_scrap_definitivo)).toBe(0);

    const consumo = await admin.from('registros_consumo_material')
      .select('catalogo_material_id, costo_unitario_momento')
      .eq('partida_id', partidaConMaterial).single();
    expect(consumo.data?.catalogo_material_id).toBe(materialId);
    expect(Number(consumo.data?.costo_unitario_momento)).toBe(10);
  });

  it('AUD-01: registra retrabajo con catálogo y no toca inventario legado', async () => {
    const solicitudId = randomUUID();
    const args = {
      p_sesion_id: sesionUno,
      p_material_id: materialId,
      p_cantidad_usada: 1,
      p_cantidad_scrap: 0,
      p_minutos: 30,
      p_causa: 'operador',
      p_motivo: 'Corrección de doblez',
      p_notas: '',
      p_actor_id: adminId,
      p_solicitud_id: solicitudId,
      p_resultado: 'RECUPERADO',
    };

    const primero = await admin.rpc('registrar_retrabajo_sesion', args);
    expect(primero.error).toBeNull();
    const reintento = await admin.rpc('registrar_retrabajo_sesion', args);
    expect(reintento.error).toBeNull();
    expect(reintento.data?.[0]?.id).toBe(primero.data?.[0]?.id);

    const retrabajos = await admin.from('retrabajos_produccion')
      .select('id, catalogo_material_id, resultado, costo_unitario_momento')
      .eq('solicitud_id', solicitudId);
    expect(retrabajos.data).toHaveLength(1);
    expect(retrabajos.data?.[0]?.catalogo_material_id).toBe(materialId);
    expect(retrabajos.data?.[0]?.resultado).toBe('RECUPERADO');
    expect(Number(retrabajos.data?.[0]?.costo_unitario_momento)).toBe(10);

    const movimientos = await admin.from('movimientos_inventario')
      .select('id').eq('orden_id', ordenId).eq('referencia_externa', 'RETRABAJO-OP');
    expect(movimientos.data).toHaveLength(0);
  });

  it('AUD-04: NOK recuperable y scrap no son entregables hasta revalidar', async () => {
    const cierre = await admin.rpc('registrar_inspeccion_b2', {
      p_orden_id: ordenId,
      p_corrida_id: null,
      p_partida_id: partidaConMaterial,
      p_codigo_item: 'IT01',
      p_tipo: 'CIERRE',
      p_referencia: null,
      p_resultado: 'RECHAZADA',
      p_tolerancias: {},
      p_cantidad_inspeccionada: 3,
      p_cantidad_ok: 2,
      p_cantidad_nok: 1,
      p_cantidad_retrabajo: 1,
      p_cantidad_scrap: 0,
      p_material_usado: {},
      p_observaciones: 'NOK recuperable',
      p_actor_id: adminId,
      p_sesion_id: sesionUno,
    });
    expect(cierre.error).toBeNull();

    const trasCierre = await admin.from('partidas_orden_produccion')
      .select('cantidad_conforme, cantidad_nok_pendiente, cantidad_scrap_definitivo')
      .eq('id', partidaConMaterial).single();
    expect(Number(trasCierre.data?.cantidad_conforme)).toBe(2);
    expect(Number(trasCierre.data?.cantidad_nok_pendiente)).toBe(1);

    const revalidacion = await admin.rpc('registrar_inspeccion_b2', {
      p_orden_id: ordenId,
      p_corrida_id: null,
      p_partida_id: partidaConMaterial,
      p_codigo_item: 'IT01',
      p_tipo: 'REVALIDACION',
      p_referencia: null,
      p_resultado: 'APROBADA',
      p_tolerancias: {},
      p_cantidad_inspeccionada: 1,
      p_cantidad_ok: 1,
      p_cantidad_nok: 0,
      p_cantidad_retrabajo: 0,
      p_cantidad_scrap: 0,
      p_material_usado: {},
      p_observaciones: 'Revalidación aprobada',
      p_actor_id: adminId,
    });
    expect(revalidacion.error).toBeNull();

    const trasRevalidar = await admin.from('partidas_orden_produccion')
      .select('cantidad_conforme, cantidad_nok_pendiente')
      .eq('id', partidaConMaterial).single();
    expect(Number(trasRevalidar.data?.cantidad_conforme)).toBe(3);
    expect(Number(trasRevalidar.data?.cantidad_nok_pendiente)).toBe(0);
  });
});
