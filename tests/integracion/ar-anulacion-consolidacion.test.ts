import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// AR-16/CFG-12: anulación concurrente e idempotente y consolidación con RLS real.
const { describir: suite, crearClienteServicio, crearClienteAnonimo } = prepararSuiteSupabaseLocal(
  'anulación y consolidación AR', { requiereClaveAnonima: true },
);

suite('AR-16/CFG-12: anulación y consolidación heredada', () => {
  let servicio: SupabaseClient<Database>;
  let segundo: SupabaseClient<Database>;
  let operador: SupabaseClient<Database>;
  let administradorId = '';
  let operadorId = '';
  const usuarios: string[] = [];
  const ordenes: string[] = [];
  const clientes: string[] = [];
  let pipelineId = '';
  let ordenComercialId = '';
  let ordenInternaId = '';

  async function crearUsuario(rol: 'admin' | 'operador') {
    const correo = `ar16-${randomUUID()}@orca.local`;
    const clave = `Ar16!${randomUUID()}Aa`;
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

  async function crearCuentaConHistorial() {
    const sufijo = randomUUID().slice(0, 6);
    const { data: cliente } = await servicio.from('clientes')
      .insert({ nombre_comercial: `AR16 ${sufijo}`, razon_social: `AR16 ${sufijo} SA`, estado: 'activo' })
      .select('id').single();
    clientes.push(cliente!.id);
    const { data: folio } = await servicio.rpc('generar_folio_orden', { p_prefijo: 'OP' });
    const { data: orden } = await servicio.from('ordenes_produccion')
      .insert({ folio: folio!, cliente_id: cliente!.id, estado: 'en_proceso', fecha_compromiso: '2099-12-31T00:00:00Z' })
      .select('id').single();
    ordenes.push(orden!.id);
    const { data: cuenta } = await servicio.from('cuentas_por_cobrar')
      .insert({
        orden_id: orden!.id, cliente_id: cliente!.id, monto_total: 1160, monto_subtotal: 1000,
        monto_iva: 160, saldo_pendiente: 1160, moneda: 'MXN', tipo_cambio_origen: 1, estado: 'pendiente',
      })
      .select('id').single();
    return cuenta!.id;
  }

  async function pagarYCerrar(arId: string, monto: number): Promise<string> {
    const pago = await servicio.rpc('registrar_pago_ar_atomico', {
      p_ar_id: arId, p_monto_pagado: monto, p_moneda_pago: 'MXN', p_tipo_cambio_pago: 1,
      p_metodo_pago: 'transferencia', p_referencia: 'REF-AR16', p_usuario_id: administradorId,
      p_solicitud_id: randomUUID(),
    });
    if (pago.error) throw pago.error;
    return pago.data![0]!.pago_id;
  }

  beforeAll(async () => {
    servicio = crearClienteServicio();
    segundo = crearClienteServicio();
    administradorId = (await crearUsuario('admin')).id;
    const persona = await crearUsuario('operador');
    operadorId = persona.id;
    operador = persona.cliente;

    const { data: cliente } = await servicio.from('clientes')
      .insert({ nombre_comercial: `CFG12 ${randomUUID().slice(0, 6)}`, razon_social: 'CFG12 SA', estado: 'activo' })
      .select('id').single();
    clientes.push(cliente!.id);
    const { data: pipeline } = await servicio.from('pipeline').insert({
      folio_op: `RFQ-${randomUUID().slice(0, 6).toUpperCase()}`, etapa: 'negociacion',
      nombre_contacto: 'Contacto', empresa: 'Empresa CFG12', vendedor_id: administradorId,
      moneda: 'MXN', iva_porcentaje: 16,
    }).select('id').single();
    pipelineId = pipeline!.id;
    await servicio.from('cotizacion_lineas').insert({
      pipeline_id: pipelineId, descripcion: 'Pieza consolidable', cantidad: 10,
      procesos: [], precio_unitario: 100, orden: 1, es_externo: false, es_descuento: false,
    });
    const { data: folio } = await servicio.rpc('generar_folio_orden', { p_prefijo: 'OP' });
    const { data: comercial } = await servicio.from('ordenes_produccion').insert({
      folio: folio!, cliente_id: cliente!.id, cotizacion_id: pipelineId, estado: 'programada',
      fecha_compromiso: '2099-12-31T00:00:00Z',
    }).select('id').single();
    ordenComercialId = comercial!.id;
    ordenes.push(ordenComercialId);
    const { data: folioTi } = await servicio.rpc('generar_folio_orden', { p_prefijo: 'OP' });
    const { data: interna } = await servicio.from('ordenes_produccion').insert({
      folio: folioTi!, cliente_id: cliente!.id, estado: 'programada', es_interna: true,
      fecha_compromiso: '2099-12-31T00:00:00Z',
    }).select('id').single();
    ordenInternaId = interna!.id;
    ordenes.push(ordenInternaId);
  });

  afterAll(async () => {
    if (!servicio) return;
    for (const ordenId of ordenes) {
      await servicio.from('reversos_pago_ar').delete().in('ar_id', (
        await servicio.from('cuentas_por_cobrar').select('id').eq('orden_id', ordenId)
      ).data?.map((fila) => fila.id) ?? []);
      await servicio.from('pagos_ar').delete().in('ar_id', (
        await servicio.from('cuentas_por_cobrar').select('id').eq('orden_id', ordenId)
      ).data?.map((fila) => fila.id) ?? []);
      await servicio.from('cuentas_por_cobrar').delete().eq('orden_id', ordenId);
      await servicio.from('ordenes_produccion').delete().eq('id', ordenId);
    }
    for (const clienteId of clientes) {
      await servicio.from('movimientos_saldo_favor').delete().eq('cliente_id', clienteId);
      await servicio.from('clientes').delete().eq('id', clienteId);
    }
    if (pipelineId) {
      await servicio.from('cotizacion_lineas').delete().eq('pipeline_id', pipelineId);
      await servicio.from('pipeline').delete().eq('id', pipelineId);
    }
    if (usuarios.length > 0) {
      await servicio.from('logs').delete().in('usuario_id', usuarios);
      await servicio.from('usuarios').delete().in('id', usuarios);
      for (const id of usuarios) await servicio.auth.admin.deleteUser(id);
    }
  });

  it('un cobro vigente bloquea la anulación; un reverso la habilita y conserva evidencia', async () => {
    const arId = await crearCuentaConHistorial();
    const pagoId = await pagarYCerrar(arId, 200);
    const { data: token } = await servicio.from('cuentas_por_cobrar').select('actualizado_en').eq('id', arId).single();
    const bloqueo = await servicio.rpc('anular_cuenta_por_cobrar', {
      p_ar_id: arId, p_actualizado_en: token!.actualizado_en, p_motivo: 'prueba', p_actor_id: administradorId,
    });
    expect(bloqueo.error?.message).toContain('cuenta_con_cobros_vigentes');

    await servicio.rpc('reversar_pago_ar', { p_pago_id: pagoId, p_motivo: 'cobro mal capturado', p_actor_id: administradorId });
    const { data: token2 } = await servicio.from('cuentas_por_cobrar').select('actualizado_en').eq('id', arId).single();
    const anulada = await servicio.rpc('anular_cuenta_por_cobrar', {
      p_ar_id: arId, p_actualizado_en: token2!.actualizado_en, p_motivo: 'duplicado administrativo', p_actor_id: administradorId,
    });
    expect(anulada.error).toBeNull();
    const { data: cuenta } = await servicio.from('cuentas_por_cobrar')
      .select('estado, saldo_pendiente, motivo_anulacion, anulada_por, anulada_en').eq('id', arId).single();
    expect(cuenta?.estado).toBe('cancelado');
    expect(cuenta?.motivo_anulacion).toBe('duplicado administrativo');
    expect(cuenta?.anulada_por).toBe(administradorId);
    const { data: pagos } = await servicio.from('pagos_ar').select('id').eq('ar_id', arId);
    expect(pagos ?? []).toHaveLength(1);
    const { data: reversos } = await servicio.from('reversos_pago_ar').select('id').eq('ar_id', arId);
    expect(reversos ?? []).toHaveLength(1);
  });

  it('dos anulaciones simultáneas producen una sola y no borran historial', async () => {
    const arId = await crearCuentaConHistorial();
    const { data: token } = await servicio.from('cuentas_por_cobrar').select('actualizado_en').eq('id', arId).single();
    const resultados = await Promise.allSettled([
      servicio.rpc('anular_cuenta_por_cobrar', { p_ar_id: arId, p_actualizado_en: token!.actualizado_en, p_motivo: 'motivo A', p_actor_id: administradorId }),
      segundo.rpc('anular_cuenta_por_cobrar', { p_ar_id: arId, p_actualizado_en: token!.actualizado_en, p_motivo: 'motivo B', p_actor_id: administradorId }),
    ]);
    const errores = resultados.map((resultado) => (resultado.status === 'fulfilled' ? resultado.value.error : { message: 'x' }));
    expect(errores.filter((error) => error === null)).toHaveLength(1);
    const { data: cuenta } = await servicio.from('cuentas_por_cobrar').select('estado, motivo_anulacion').eq('id', arId).single();
    expect(cuenta?.estado).toBe('cancelado');
    expect(['motivo A', 'motivo B']).toContain(cuenta?.motivo_anulacion);
  });

  it('un JWT de operador no anula ni consolida cuentas', async () => {
    const arId = await crearCuentaConHistorial();
    const { data: token } = await servicio.from('cuentas_por_cobrar').select('actualizado_en').eq('id', arId).single();
    const anular = await operador.rpc('anular_cuenta_por_cobrar', {
      p_ar_id: arId, p_actualizado_en: token!.actualizado_en, p_motivo: 'intento', p_actor_id: operadorId,
    });
    expect(anular.error).not.toBeNull();
    const preview = await operador.rpc('previsualizar_consolidacion_ar_faltantes');
    expect(preview.error).not.toBeNull();
    const consolidar = await operador.rpc('consolidar_ar_faltantes', {
      p_orden_ids: [ordenComercialId], p_actor_id: operadorId,
    });
    expect(consolidar.error).not.toBeNull();
  });

  it('la vista previa marca elegibilidad y la consolidación es idempotente', async () => {
    const preview = await servicio.rpc('previsualizar_consolidacion_ar_faltantes');
    expect(preview.error).toBeNull();
    const comercial = preview.data?.find((fila) => fila.orden_id === ordenComercialId);
    const interna = preview.data?.find((fila) => fila.orden_id === ordenInternaId);
    expect(comercial?.elegible).toBe(true);
    expect(Number(comercial?.monto_total)).toBe(1160);
    expect(interna?.elegible).toBe(false);

    const primera = await servicio.rpc('consolidar_ar_faltantes', {
      p_orden_ids: [ordenComercialId, ordenInternaId], p_actor_id: administradorId,
    });
    expect(primera.error).toBeNull();
    expect(primera.data?.filter((fila) => fila.creada)).toHaveLength(1);
    const segunda = await servicio.rpc('consolidar_ar_faltantes', {
      p_orden_ids: [ordenComercialId], p_actor_id: administradorId,
    });
    expect(segunda.error).toBeNull();
    expect(segunda.data?.every((fila) => !fila.creada)).toBe(true);
    const { data: cuentas } = await servicio.from('cuentas_por_cobrar').select('id, estado, cobrable_desde').eq('orden_id', ordenComercialId);
    expect(cuentas ?? []).toHaveLength(1);
    expect(cuentas?.[0]?.estado).toBe('pendiente');
    expect(cuentas?.[0]?.cobrable_desde).toBeNull();
  });
});
