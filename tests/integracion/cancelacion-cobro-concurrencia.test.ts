import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';

// Nunca leer .env.local: estas pruebas mutan exclusivamente fixtures locales.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
  throw new Error('Cancelación/cobro: solo se permite Supabase local');
}
const suite = url && clave ? describe : describe.skip;
function datos<T>(r: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (r.error || r.data === null) throw new Error(r.error?.message ?? 'Sin datos');
  return r.data as NonNullable<T>;
}

suite('cancelación y cobro concurrentes, dos clientes PostgreSQL reales', () => {
  let admin: SupabaseClient<Database>;
  let otro: SupabaseClient<Database>;
  let usuarioId: string;
  const clientes: string[] = [];
  const ordenes: string[] = [];
  const cuentas: string[] = [];

  beforeAll(async () => {
    const opciones = { auth: { persistSession: false, autoRefreshToken: false } };
    admin = createClient<Database>(url!, clave!, opciones);
    otro = createClient<Database>(url!, clave!, opciones);
    const creada = await admin.auth.admin.createUser({
      email: `a02-${randomUUID()}@orca.local`,
      password: `A02!${randomUUID()}`,
      email_confirm: true,
    });
    if (creada.error || !creada.data.user) throw new Error(creada.error?.message ?? 'Sin usuario');
    usuarioId = creada.data.user.id;
    const { error } = await admin.from('usuarios').update({ rol: 'admin', activo: true }).eq('id', usuarioId);
    if (error) throw error;
  });

  afterAll(async () => {
    if (!admin) return;
    if (clientes.length) await admin.from('movimientos_saldo_favor').delete().in('cliente_id', clientes);
    if (cuentas.length) {
      await admin.from('pagos_ar').delete().in('ar_id', cuentas);
      await admin.from('cuentas_por_cobrar').delete().in('id', cuentas);
    }
    if (ordenes.length) await admin.from('ordenes_produccion').delete().in('id', ordenes);
    if (clientes.length) await admin.from('clientes').delete().in('id', clientes);
    if (usuarioId) {
      await admin.from('logs').delete().eq('usuario_id', usuarioId);
      await admin.from('usuarios').delete().eq('id', usuarioId);
      await admin.auth.admin.deleteUser(usuarioId);
    }
  });

  for (const medio of ['efectivo', 'saldo_a_favor'] as const) {
    it(`cancelar frente a ${medio}: solo una operación gana y el saldo concilia`, async () => {
      const cliente = datos(await admin.from('clientes').insert({
        razon_social: `A02-${randomUUID()}`, nombre_comercial: 'Fixture A02',
        estado: 'activo', saldo_a_favor: 100,
      }).select('id').single());
      clientes.push(cliente.id);
      const { error: errorMovimiento } = await admin.from('movimientos_saldo_favor').insert({
        cliente_id: cliente.id, monto: 100, moneda: 'MXN', tipo: 'ajuste_manual',
        descripcion: 'Saldo inicial del fixture local A02', creado_por: usuarioId,
      });
      if (errorMovimiento) throw errorMovimiento;
      const folio = datos(await admin.rpc('generar_folio_orden', { p_prefijo: 'OP' }));
      const orden = datos(await admin.from('ordenes_produccion').insert({
        folio, cliente_id: cliente.id, estado: 'borrador', prioridad: 'normal',
        fecha_compromiso: '2099-12-31T18:00:00Z',
      }).select('id').single());
      ordenes.push(orden.id);
      const ar = datos(await admin.from('cuentas_por_cobrar').insert({
        orden_id: orden.id, cliente_id: cliente.id, monto_total: 100, saldo_pendiente: 100,
        moneda: 'MXN', tipo_cambio_origen: 1, estado: 'pendiente',
        cobrable_desde: '2026-09-01T00:00:00Z', fecha_vencimiento: '2099-12-31T00:00:00Z',
      }).select('id').single());
      cuentas.push(ar.id);
      const pago = medio === 'efectivo'
        ? otro.rpc('registrar_pago_ar_atomico', {
          p_ar_id: ar.id, p_monto_pagado: 25, p_moneda_pago: 'MXN', p_tipo_cambio_pago: 1,
          p_metodo_pago: 'efectivo', p_referencia: 'A02 local', p_usuario_id: usuarioId,
          p_solicitud_id: randomUUID(),
        })
        : otro.rpc('aplicar_saldo_favor_ar', {
          p_cliente_id: cliente.id, p_ar_id: ar.id, p_monto_mxn: 25,
          p_usuario_id: usuarioId, p_solicitud_id: randomUUID(),
        });
      const [cancelacion, cobro] = await Promise.all([
        admin.rpc('cambiar_estado_orden', {
          p_orden_id: orden.id, p_estado_actual: 'borrador',
          p_estado_nuevo: 'cancelada', p_motivo_cancelacion: 'Prueba concurrente A02',
        }),
        pago,
      ]);
      expect([cancelacion.error, cobro.error].filter((e) => e === null)).toHaveLength(1);
      expect(cancelacion.error?.code).not.toBe('40P01');
      expect(cobro.error?.code).not.toBe('40P01');
      const actual = datos(await admin.from('cuentas_por_cobrar').select('estado,saldo_pendiente').eq('id', ar.id).single());
      const op = datos(await admin.from('ordenes_produccion').select('estado').eq('id', orden.id).single());
      const pagos = datos(await admin.from('pagos_ar').select('id,monto_aplicado_ar').eq('ar_id', ar.id));
      const cartera = datos(await admin.from('clientes').select('saldo_a_favor').eq('id', cliente.id).single());
      if (!cancelacion.error) {
        expect(op.estado).toBe('cancelada');
        expect(actual).toMatchObject({ estado: 'cancelado', saldo_pendiente: 0 });
        expect(pagos).toHaveLength(0);
        expect(Number(cartera.saldo_a_favor)).toBe(100);
      } else {
        expect(op.estado).toBe('borrador');
        expect(actual).toMatchObject({ estado: 'parcial', saldo_pendiente: 75 });
        expect(pagos).toHaveLength(1);
        expect(Number(pagos[0].monto_aplicado_ar)).toBe(25);
        expect(Number(cartera.saldo_a_favor)).toBe(medio === 'saldo_a_favor' ? 75 : 100);
      }
    });
  }
});
