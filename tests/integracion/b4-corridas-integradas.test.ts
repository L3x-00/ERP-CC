import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// B4: contratos reales de corridas integradas y material del cliente.
const { describir: suite, crearClienteServicio } = prepararSuiteSupabaseLocal(
  'B4 corridas integradas y material del cliente',
);

suite('B4: corridas integradas y material del cliente', () => {
  let admin!: ReturnType<typeof crearClienteServicio>;
  let adminId = '';
  let operadorA = '';
  let operadorB = '';
  let clienteId = '';
  const ordenes: string[] = [];
  const materiales: string[] = [];
  const recursos: string[] = [];
  const pipelines: string[] = [];
  const usuarios: string[] = [];

  async function crearUsuario(rol: 'admin' | 'operador'): Promise<string> {
    const correo = `b4-${randomUUID()}@orca.local`;
    const clave = `B4!${randomUUID()}Aa`;
    const alta = await admin.auth.admin.createUser({ email: correo, password: clave, email_confirm: true });
    if (alta.error || !alta.data.user) throw alta.error ?? new Error('No se creó usuario');
    usuarios.push(alta.data.user.id);
    const perfil = await admin.from('usuarios').update({ rol, activo: true }).eq('id', alta.data.user.id);
    if (perfil.error) throw perfil.error;
    return alta.data.user.id;
  }

  async function crearMaterial(codigo: string, costo = 10): Promise<string> {
    const material = await admin.from('catalogo_materiales').insert({
      codigo,
      nombre: `Material ${codigo}`,
      unidad_base: 'kg',
      moneda_costo: 'MXN',
      costo_vigente: costo,
      fecha_vigencia_costo: new Date().toISOString().slice(0, 10),
      costo_confirmado_en: new Date().toISOString(),
      costo_confirmado_por: adminId,
    }).select('id').single();
    if (material.error || !material.data) throw material.error ?? new Error('No se creó material');
    materiales.push(material.data.id);
    return material.data.id;
  }

  async function crearRecurso(): Promise<string> {
    const recurso = await admin.from('recursos_planeacion').insert({
      codigo: `B4R${randomUUID().slice(0, 4).toUpperCase()}`,
      nombre: 'Recurso B4',
      area: 'taller',
      activo: true,
    }).select('id').single();
    if (recurso.error || !recurso.data) throw recurso.error ?? new Error('No se creó recurso');
    recursos.push(recurso.data.id);
    return recurso.data.id;
  }

  async function crearCliente(): Promise<string> {
    const cliente = await admin.from('clientes').insert({
      nombre_comercial: `Cliente B4 ${randomUUID().slice(0, 6)}`,
      razon_social: 'Cliente B4 SA',
      estado: 'activo',
    }).select('id').single();
    if (cliente.error || !cliente.data) throw cliente.error ?? new Error('No se creó cliente');
    return cliente.data.id;
  }

  async function crearOrden(propuestaRevisionId?: string): Promise<string> {
    const orden = await admin.from('ordenes_produccion').insert({
      folio: `OP-${String(Date.now()).slice(-5)}${ordenes.length}`,
      cliente_id: clienteId,
      estado: 'en_proceso',
      fecha_compromiso: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      ...(propuestaRevisionId ? { propuesta_revision_id: propuestaRevisionId } : {}),
    }).select('id').single();
    if (orden.error || !orden.data) throw orden.error ?? new Error('No se creó orden');
    ordenes.push(orden.data.id);
    return orden.data.id;
  }

  beforeAll(async () => {
    admin = crearClienteServicio();
    adminId = await crearUsuario('admin');
    operadorA = await crearUsuario('operador');
    operadorB = await crearUsuario('operador');
  });

  afterAll(async () => {
    if (!admin) return;
    for (const ordenId of ordenes) {
      await admin.from('inspecciones_calidad').delete().eq('orden_id', ordenId);
      await admin.from('retrabajos_produccion').delete().eq('orden_id', ordenId);
      await admin.from('consumos_material_cliente').delete().eq('orden_id', ordenId);
      const partidas = await admin.from('partidas_orden_produccion').select('id').eq('orden_id', ordenId);
      const partidaIds = (partidas.data ?? []).map((fila) => fila.id);
      if (partidaIds.length > 0) {
        await admin.from('registros_consumo_material').delete().in('partida_id', partidaIds);
        await admin.from('registros_avance_partida').delete().in('partida_id', partidaIds);
      }
      const sesiones = await admin.from('sesiones_trabajo').select('id').eq('orden_id', ordenId);
      const sesionIds = (sesiones.data ?? []).map((fila) => fila.id);
      if (sesionIds.length > 0) await admin.from('sesion_item_tiempos').delete().in('sesion_id', sesionIds);
      await admin.from('sesiones_trabajo').delete().eq('orden_id', ordenId);
      await admin.from('programacion_areas').delete().eq('orden_id', ordenId);
      const corridas = await admin.from('corridas').select('id').eq('orden_id', ordenId);
      const corridaIds = (corridas.data ?? []).map((fila) => fila.id);
      if (corridaIds.length > 0) await admin.from('corrida_items').delete().in('corrida_id', corridaIds);
      await admin.from('corridas').delete().eq('orden_id', ordenId);
      await admin.from('partidas_orden_produccion').delete().eq('orden_id', ordenId);
      await admin.from('ordenes_produccion').delete().eq('id', ordenId);
    }
    for (const pipelineId of pipelines) {
      await admin.from('propuestas').delete().eq('rfq_id', pipelineId);
      await admin.from('rfq_items').delete().eq('rfq_id', pipelineId);
      await admin.from('pipeline').delete().eq('id', pipelineId);
    }
    if (materiales.length > 0) await admin.from('catalogo_materiales').delete().in('id', materiales);
    if (recursos.length > 0) await admin.from('recursos_planeacion').delete().in('id', recursos);
    if (clienteId) await admin.from('clientes').delete().eq('id', clienteId);
    for (const id of usuarios) {
      await admin.from('logs').delete().eq('usuario_id', id);
      await admin.from('usuarios').delete().eq('id', id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it('AUD-09/AUD-10: avanza cada ítem en su operación y costea el tiempo una vez', async () => {
    clienteId = await crearCliente();
    const materialId = await crearMaterial(`B4MAT${randomUUID().slice(0, 5).toUpperCase()}`);
    const proceso = await admin.from('catalogo_procesos').insert({
      codigo: `CORTEB4${randomUUID().slice(0, 3).toUpperCase()}`,
      nombre: 'Corte B4 IT',
      prefijo_corrida: 'CORT',
      activo: true,
      requiere_primera_pieza: false,
    }).select('id').single();
    if (proceso.error || !proceso.data) throw proceso.error ?? new Error('No se creó proceso');

    const ordenId = await crearOrden();
    const partidas = await admin.from('partidas_orden_produccion').insert([
      {
        orden_id: ordenId, codigo_pieza: 'IT01', codigo_item: 'IT01', cantidad_solicitada: 10,
        unidad_medida: 'pieza', operador_asignado_id: operadorA, catalogo_material_id: materialId,
        procesos: ['Corte B4 IT', 'Doblado B4 IT'],
      },
      {
        orden_id: ordenId, codigo_pieza: 'IT02', codigo_item: 'IT02', cantidad_solicitada: 10,
        unidad_medida: 'pieza', operador_asignado_id: operadorB, catalogo_material_id: materialId,
        procesos: ['Corte B4 IT', 'Doblado B4 IT'],
      },
    ]).select('id, codigo_item');
    if (partidas.error || !partidas.data) throw partidas.error ?? new Error('No se crearon partidas');
    const it01 = partidas.data.find((fila) => fila.codigo_item === 'IT01')!.id;
    const it02 = partidas.data.find((fila) => fila.codigo_item === 'IT02')!.id;

    const metas = await admin.from('metas_proceso_partida')
      .select('id, partida_id, nombre').in('partida_id', [it01, it02]);
    const corteIt01 = metas.data?.find((meta) => meta.partida_id === it01 && meta.nombre === 'Corte B4 IT')?.id;
    const corteIt02 = metas.data?.find((meta) => meta.partida_id === it02 && meta.nombre === 'Corte B4 IT')?.id;
    const dobladoIt02 = metas.data?.find((meta) => meta.partida_id === it02 && meta.nombre === 'Doblado B4 IT')?.id;
    expect(corteIt02).toBeTruthy();

    const recursoId = await crearRecurso();
    const programacion = await admin.from('programacion_areas').insert({
      orden_id: ordenId, partida_id: it01, recurso_id: recursoId,
      fecha_programada: new Date().toISOString().slice(0, 10), turno: 'matutino',
      horas_estimadas: 2, secuencia: 1, estado_planeacion: 'en_proceso',
      meta_proceso_id: corteIt01,
    }).select('id').single();
    if (programacion.error || !programacion.data) throw programacion.error ?? new Error('No se programó');

    const corrida = await admin.from('corridas').insert({
      orden_id: ordenId, codigo: 'CORT01', proceso_id: proceso.data.id,
      estado: 'EN_PROCESO', cantidad_planificada: 20, creado_por: adminId,
    }).select('id').single();
    if (corrida.error || !corrida.data) throw corrida.error ?? new Error('No se creó corrida');
    await admin.from('corrida_items').insert([
      { corrida_id: corrida.data.id, partida_id: it01, codigo_item: 'IT01', cantidad: 10 },
      { corrida_id: corrida.data.id, partida_id: it02, codigo_item: 'IT02', cantidad: 10 },
    ]);

    const sesion = await admin.from('sesiones_trabajo').insert({
      orden_id: ordenId, partida_id: it01, programacion_id: programacion.data.id,
      operador_id: operadorA, corrida_id: corrida.data.id,
      fecha_inicio: new Date(Date.now() - 90 * 60_000).toISOString(),
    }).select('id').single();
    if (sesion.error || !sesion.data) throw sesion.error ?? new Error('No se creó sesión');

    const items = await admin.rpc('obtener_items_corrida', {
      p_corrida_id: corrida.data.id,
      p_actor_id: adminId,
    });
    expect(items.error).toBeNull();
    expect(items.data).toHaveLength(2);
    expect(items.data?.find((fila) => fila.partida_id === it02)?.meta_proceso_id).toBe(corteIt02);

    const cierre = await admin.rpc('cerrar_sesion_integrada', {
      p_sesion_id: sesion.data.id,
      p_items: [
        { partida_id: it01, piezas: 3 },
        { partida_id: it02, piezas: 2 },
      ],
      p_material_id: materialId,
      p_cantidad_usada: 1,
      p_cantidad_scrap: 0,
      p_notas: 'Corte compartido B4',
      p_actor_id: operadorA,
    });
    expect(cierre.error).toBeNull();

    const avanceIt02 = await admin.from('registros_avance_partida')
      .select('cantidad_producida, meta_proceso_id').eq('partida_id', it02);
    expect(avanceIt02.data).toHaveLength(1);
    expect(avanceIt02.data?.[0]?.meta_proceso_id).toBe(corteIt02);
    expect(avanceIt02.data?.[0]?.meta_proceso_id).not.toBe(dobladoIt02);

    const tiempos = await admin.from('sesion_item_tiempos')
      .select('partida_id, minutos').eq('sesion_id', sesion.data.id);
    expect(tiempos.data).toHaveLength(2);
    expect(tiempos.data?.every((fila) => fila.minutos === null)).toBe(true);

    const consumo = await admin.from('registros_consumo_material')
      .select('corrida_id, cantidad_usada').eq('partida_id', it01).eq('corrida_id', corrida.data.id);
    expect(consumo.data).toHaveLength(1);
    expect(Number(consumo.data?.[0]?.cantidad_usada)).toBe(1);

    const reintento = await admin.rpc('cerrar_sesion_integrada', {
      p_sesion_id: sesion.data.id,
      p_items: [{ partida_id: it01, piezas: 3 }, { partida_id: it02, piezas: 2 }],
      p_material_id: materialId,
      p_cantidad_usada: 1,
      p_cantidad_scrap: 0,
      p_notas: '',
      p_actor_id: operadorA,
    });
    expect(reintento.error?.message ?? '').toContain('sesion_no_activa');
  });

  it('AUD-11: dos consumos concurrentes del cliente no exceden el saldo', async () => {
    clienteId = clienteId || await crearCliente();
    const materialId = await crearMaterial(`B4MC${randomUUID().slice(0, 5).toUpperCase()}`);

    // Propuesta con material del cliente declarado (3 unidades).
    const pipeline = await admin.from('pipeline').insert({
      folio_op: `OP-B4MC-${randomUUID().slice(0, 6)}`,
      etapa: 'negociacion',
      estado_rfq: 'READY_FOR_PROPOSAL',
      nombre_contacto: 'Contacto B4 MC',
      empresa: 'Empresa B4 MC',
      cliente_id: clienteId,
      vendedor_id: adminId,
      moneda: 'MXN',
      iva_porcentaje: 16,
      descripcion_general: 'Solicitud B4 MC',
      canal: 'correo',
      fecha_solicitud: new Date().toISOString().slice(0, 10),
    }).select('id').single();
    if (pipeline.error || !pipeline.data) throw pipeline.error ?? new Error('No se creó pipeline');
    pipelines.push(pipeline.data.id);
    await admin.from('rfq_items').insert({
      rfq_id: pipeline.data.id, numero: 1, codigo: 'IT01', descripcion: 'Pieza B4 MC', cantidad: 10,
    });
    const propuesta = await admin.rpc('crear_propuesta', { p_rfq_id: pipeline.data.id, p_actor: adminId });
    if (propuesta.error) throw propuesta.error;
    const propuestaRow = await admin.from('propuestas').select('id').eq('rfq_id', pipeline.data.id).single();
    if (propuestaRow.error || !propuestaRow.data) throw propuestaRow.error ?? new Error('No se creó propuesta');
    const revision = await admin.from('propuesta_revisiones')
      .select('id').eq('propuesta_id', propuestaRow.data.id).eq('letra', 'A').single();
    if (revision.error || !revision.data) throw revision.error ?? new Error('No se creó revisión');
    const decl = await admin.rpc('reemplazar_material_cliente_item', {
      p_revision_id: revision.data.id,
      p_codigo_item: 'IT01',
      p_materiales: [{ material_id: materialId, cantidad: 3 }],
      p_actor_id: adminId,
    });
    if (decl.error) throw decl.error;

    const ordenId = await crearOrden(revision.data.id);
    const partida = await admin.from('partidas_orden_produccion').insert({
      orden_id: ordenId, codigo_pieza: 'IT01', codigo_item: 'IT01', cantidad_solicitada: 10,
      unidad_medida: 'pieza', operador_asignado_id: operadorA,
    }).select('id').single();
    if (partida.error || !partida.data) throw partida.error ?? new Error('No se creó partida');
    const partidaId = partida.data.id;

    const programaciones = await admin.from('programacion_areas').insert([
      {
        orden_id: ordenId, partida_id: partidaId, recurso_id: await crearRecurso(),
        fecha_programada: new Date().toISOString().slice(0, 10), turno: 'matutino',
        horas_estimadas: 2, secuencia: 1, estado_planeacion: 'en_proceso',
      },
      {
        orden_id: ordenId, partida_id: partidaId, recurso_id: await crearRecurso(),
        fecha_programada: new Date().toISOString().slice(0, 10), turno: 'matutino',
        horas_estimadas: 2, secuencia: 2, estado_planeacion: 'en_proceso',
      },
    ]).select('id');
    if (programaciones.error || !programaciones.data) throw programaciones.error ?? new Error('No se programó');

    const sesiones = await admin.from('sesiones_trabajo').insert([
      {
        orden_id: ordenId, partida_id: partidaId, programacion_id: programaciones.data[0]!.id,
        operador_id: operadorA, fecha_inicio: new Date().toISOString(),
      },
      {
        orden_id: ordenId, partida_id: partidaId, programacion_id: programaciones.data[1]!.id,
        operador_id: operadorA, fecha_inicio: new Date().toISOString(),
      },
    ]).select('id');
    if (sesiones.error || !sesiones.data) throw sesiones.error ?? new Error('No se crearon sesiones');

    const [a, b] = await Promise.all([
      admin.rpc('registrar_consumo_material_cliente', {
        p_sesion_id: sesiones.data[0]!.id, p_material_id: materialId,
        p_cantidad_usada: 2, p_cantidad_scrap: 0, p_actor_id: operadorA,
        p_solicitud_id: randomUUID(),
      }),
      admin.rpc('registrar_consumo_material_cliente', {
        p_sesion_id: sesiones.data[1]!.id, p_material_id: materialId,
        p_cantidad_usada: 2, p_cantidad_scrap: 0, p_actor_id: operadorA,
        p_solicitud_id: randomUUID(),
      }),
    ]);

    const exitosos = [a, b].filter((resultado) => resultado.error === null);
    expect(exitosos).toHaveLength(1);
    const fallido = [a, b].find((resultado) => resultado.error !== null);
    expect(fallido?.error?.message ?? '').toContain('material_cliente_insuficiente');

    const saldoTrasCarrera = await admin.rpc('obtener_material_cliente_orden', {
      p_orden_id: ordenId,
      p_actor_id: adminId,
    });
    expect(saldoTrasCarrera.error).toBeNull();
    expect(Number(saldoTrasCarrera.data?.find((fila) => fila.material_id === materialId)?.consumido)).toBe(2);

    const solicitud = randomUUID();
    const [c, d] = await Promise.all([
      admin.rpc('registrar_consumo_material_cliente', {
        p_sesion_id: sesiones.data[0]!.id, p_material_id: materialId,
        p_cantidad_usada: 1, p_cantidad_scrap: 0, p_actor_id: operadorA,
        p_solicitud_id: solicitud,
      }),
      admin.rpc('registrar_consumo_material_cliente', {
        p_sesion_id: sesiones.data[0]!.id, p_material_id: materialId,
        p_cantidad_usada: 1, p_cantidad_scrap: 0, p_actor_id: operadorA,
        p_solicitud_id: solicitud,
      }),
    ]);
    expect([c.error, d.error].filter(Boolean)).toHaveLength(0);

    const saldoTrasReintento = await admin.rpc('obtener_material_cliente_orden', {
      p_orden_id: ordenId,
      p_actor_id: adminId,
    });
    expect(saldoTrasReintento.error).toBeNull();
    expect(Number(saldoTrasReintento.data?.find((fila) => fila.material_id === materialId)?.consumido)).toBe(3);
  });
});