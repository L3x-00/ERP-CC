import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// AR-08/09: reverso trazable y anticipo heredado bajo concurrencia y permisos.
const { describir: suite, crearClienteServicio, crearClienteAnonimo } = prepararSuiteSupabaseLocal(
  'movimientos AR-08/09', { requiereClaveAnonima: true },
);

suite('AR-08/09: reverso de pagos y anticipo heredado con RLS real', () => {
  let servicio: SupabaseClient<Database>;
  let segundo: SupabaseClient<Database>;
  let operador: SupabaseClient<Database>;
  let administradorId = '';
  let operadorId = '';
  let clienteId = '';
  let ordenId: string;
  let cuentaId: string;
  const usuarios: string[] = [];

  async function crearUsuario(rol: 'admin' | 'operador') {
    const correo = `ar08-${randomUUID()}@orca.local`;
    const clave = `Ar08!${randomUUID()}Aa`;
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

  async function crearCuenta(sufijo: string) {
    const { data: cliente } = await servicio.from('clientes')
      .insert({ nombre_comercial: `AR08 ${sufijo}`, razon_social: 'AR08 SA', estado: 'activo' })
      .select('id').single();
    const { data: folio } = await servicio.rpc('generar_folio_orden', { p_prefijo: 'OP' });
    const { data: orden } = await servicio.from('ordenes_produccion')
      .insert({ folio: folio!, cliente_id: cliente!.id, estado: 'en_proceso', fecha_compromiso: '2099-12-31T00:00:00Z' })
      .select('id').single();
    const { data: cuenta } = await servicio.from('cuentas_por_cobrar')
      .insert({
        orden_id: orden!.id, cliente_id: cliente!.id, monto_total: 1160,
        monto_subtotal: 1000, monto_iva: 160, saldo_pendiente: 1160,
        moneda: 'MXN', tipo_cambio_origen: 1, estado: 'pendiente',
      })
      .select('id').single();
    return { clienteId: cliente!.id, ordenId: orden!.id, cuentaId: cuenta!.id };
  }

  beforeAll(async () => {
    servicio = crearClienteServicio();
    segundo = crearClienteServicio();
    administradorId = (await crearUsuario('admin')).id;
    const persona = await crearUsuario('operador');
    operadorId = persona.id;
    operador = persona.cliente;
    const base = await crearCuenta(randomUUID().slice(0, 6));
    clienteId = base.clienteId;
    ordenId = base.ordenId;
    cuentaId = base.cuentaId;
  });

  afterAll(async () => {
    if (!servicio) return;
    await servicio.from('reversos_pago_ar').delete().eq('ar_id', cuentaId);
    await servicio.from('pagos_ar').delete().eq('ar_id', cuentaId);
    await servicio.from('movimientos_saldo_favor').delete().eq('cliente_id', clienteId);
    await servicio.from('cuentas_por_cobrar').delete().eq('id', cuentaId);
    await servicio.from('ordenes_produccion').delete().eq('id', ordenId);
    await servicio.from('clientes').delete().eq('id', clienteId);
    if (usuarios.length > 0) {
      await servicio.from('logs').delete().in('usuario_id', usuarios);
      await servicio.from('usuarios').delete().in('id', usuarios);
      for (const id of usuarios) await servicio.auth.admin.deleteUser(id);
    }
  });

  it('registra el anticipo heredado una sola vez y lo separa de los pagos', async () => {
    const primero = await servicio.rpc('registrar_abono_heredado_ar', {
      p_ar_id: cuentaId, p_monto: 580, p_notas: 'anticipo del sistema anterior', p_actor_id: administradorId,
    });
    expect(primero.error).toBeNull();
    const segundoIntento = await servicio.rpc('registrar_abono_heredado_ar', {
      p_ar_id: cuentaId, p_monto: 100, p_notas: '', p_actor_id: administradorId,
    });
    expect(segundoIntento.error?.message).toContain('abono_heredado_ya_registrado');
    const { data: cuenta } = await servicio.from('cuentas_por_cobrar')
      .select('saldo_pendiente, estado, abono_heredado').eq('id', cuentaId).single();
    expect(Number(cuenta?.abono_heredado)).toBe(580);
    expect(Number(cuenta?.saldo_pendiente)).toBe(580);
    expect(cuenta?.estado).toBe('parcial');
  });

  it('un JWT de operador no ejecuta el reverso ni registra reversos', async () => {
    const pago = await operador.rpc('reversar_pago_ar', {
      p_pago_id: randomUUID(), p_motivo: 'intento sin permiso', p_actor_id: operadorId,
    });
    expect(pago.error).not.toBeNull();
    const insercion = await operador.from('reversos_pago_ar').insert({
      pago_id: randomUUID(), ar_id: cuentaId, motivo: 'atajo', monto_aplicado_reverso: 1,
    });
    expect(insercion.error).not.toBeNull();
  });

  it('dos reversos simultáneos del mismo pago producen un solo reverso', async () => {
    const pago = await servicio.rpc('registrar_pago_ar_atomico', {
      p_ar_id: cuentaId, p_monto_pagado: 1000, p_moneda_pago: 'MXN', p_tipo_cambio_pago: 1,
      p_metodo_pago: 'transferencia', p_referencia: 'REF-AR08', p_usuario_id: administradorId,
      p_solicitud_id: randomUUID(),
    });
    expect(pago.error).toBeNull();
    const pagoId = pago.data![0]!.pago_id;
    const { data: cliente } = await servicio.from('clientes').select('saldo_a_favor').eq('id', clienteId).single();
    expect(Number(cliente?.saldo_a_favor)).toBe(420);

    const resultados = await Promise.allSettled([
      servicio.rpc('reversar_pago_ar', { p_pago_id: pagoId, p_motivo: 'corrección A', p_actor_id: administradorId }),
      segundo.rpc('reversar_pago_ar', { p_pago_id: pagoId, p_motivo: 'corrección B', p_actor_id: administradorId }),
    ]);
    const errores = resultados.map((resultado) => (
      resultado.status === 'fulfilled' ? resultado.value.error : { message: 'rechazado' }
    ));
    expect(errores.filter((error) => error === null)).toHaveLength(1);
    expect(errores.filter((error) => error !== null)).toHaveLength(1);
    expect(errores.find((error) => error !== null)?.message).toContain('pago_ya_reversado');

    const { data: reversos } = await servicio.from('reversos_pago_ar').select('id, motivo').eq('pago_id', pagoId);
    expect(reversos).toHaveLength(1);
    const { data: cuenta } = await servicio.from('cuentas_por_cobrar')
      .select('saldo_pendiente, estado').eq('id', cuentaId).single();
    expect(Number(cuenta?.saldo_pendiente)).toBe(580);
    expect(cuenta?.estado).toBe('parcial');
    const { data: clienteFinal } = await servicio.from('clientes').select('saldo_a_favor').eq('id', clienteId).single();
    expect(Number(clienteFinal?.saldo_a_favor)).toBe(0);
    const { data: pagoOriginal } = await servicio.from('pagos_ar').select('id, monto_aplicado_ar').eq('id', pagoId).single();
    expect(pagoOriginal?.id).toBe(pagoId);
    expect(Number(pagoOriginal?.monto_aplicado_ar)).toBe(580);
  });
});
