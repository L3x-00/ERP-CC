import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// AUD-15: la idempotencia vive en Postgres, no en el botón de la interfaz.
// Se prueba el contrato real de la RPC: reintento y concurrencia con la misma
// clave, y pagos parciales legítimos con claves distintas.
const { describir: suite, crearClienteServicio } = prepararSuiteSupabaseLocal(
  'B5 pagos a proveedor idempotentes',
);

suite('B5: pagar_compra idempotente', () => {
  let admin: ReturnType<typeof crearClienteServicio>;
  let adminId = '';
  let proveedorId = '';
  const compras: string[] = [];
  const usuarios: string[] = [];

  async function crearUsuario(): Promise<string> {
    const correo = `b5-${randomUUID()}@orca.local`;
    const clave = `B5!${randomUUID()}Aa`;
    const alta = await admin.auth.admin.createUser({ email: correo, password: clave, email_confirm: true });
    if (alta.error || !alta.data.user) throw alta.error ?? new Error('No se creó usuario');
    usuarios.push(alta.data.user.id);
    const perfil = await admin.from('usuarios').update({ rol: 'admin', activo: true }).eq('id', alta.data.user.id);
    if (perfil.error) throw perfil.error;
    return alta.data.user.id;
  }

  async function crearCompra(monto: number): Promise<string> {
    const folio = `CG-2099_${String(Date.now()).slice(-6)}${compras.length}`;
    const { data, error } = await admin.from('compras').insert({
      folio_sii: folio,
      proveedor_id: proveedorId,
      estado: 'CONFIRMADA',
      monto_subtotal: monto,
      monto_iva: 0,
      monto_total: monto,
      saldo_pendiente: monto,
      creado_por: adminId,
    }).select('id').single();
    if (error || !data) throw error ?? new Error('No se creó la compra');
    compras.push(data.id);
    return data.id;
  }

  beforeAll(async () => {
    admin = crearClienteServicio();
    adminId = await crearUsuario();
    const { data: proveedor, error } = await admin.from('proveedores').insert({
      nombre_comercial: `Proveedor B5 ${randomUUID().slice(0, 6)}`,
      contacto_nombre: 'Contacto B5',
      correo: 'b5@proveedor.local',
      telefono: '5550000000',
    }).select('id').single();
    if (error || !proveedor) throw error ?? new Error('No se creó el proveedor');
    proveedorId = proveedor.id;
  });

  afterAll(async () => {
    if (!admin) return;
    if (compras.length > 0) {
      await admin.from('pagos_compra').delete().in('compra_id', compras);
      await admin.from('compras').delete().in('id', compras);
    }
    if (proveedorId) await admin.from('proveedores').delete().eq('id', proveedorId);
    if (usuarios.length > 0) {
      await admin.from('logs').delete().in('usuario_id', usuarios);
      await admin.from('usuarios').delete().in('id', usuarios);
      for (const id of usuarios) await admin.auth.admin.deleteUser(id);
    }
  });

  it('un reintento con la misma clave devuelve el pago original sin duplicar saldo', async () => {
    const compraId = await crearCompra(1000);
    const solicitudId = randomUUID();
    const args = {
      p_compra_id: compraId,
      p_monto: 100,
      p_metodo_pago: 'transferencia',
      p_referencia: 'B5-RETRY',
      p_cuenta_bancaria_id: null,
      p_notas: null,
      p_actor_id: adminId,
      p_solicitud_id: solicitudId,
    };

    const primero = await admin.rpc('pagar_compra', args);
    expect(primero.error).toBeNull();
    expect(primero.data?.[0]?.idempotente).toBe(false);
    expect(Number(primero.data?.[0]?.saldo_pendiente)).toBe(900);

    const reintento = await admin.rpc('pagar_compra', args);
    expect(reintento.error).toBeNull();
    expect(reintento.data?.[0]?.idempotente).toBe(true);
    expect(reintento.data?.[0]?.pago_id).toBe(primero.data?.[0]?.pago_id);
    expect(Number(reintento.data?.[0]?.saldo_pendiente)).toBe(900);

    const pagos = await admin.from('pagos_compra').select('id').eq('compra_id', compraId);
    expect(pagos.data).toHaveLength(1);
  });

  it('dos pagos concurrentes con la misma clave insertan un solo pago', async () => {
    const compraId = await crearCompra(1000);
    const solicitudId = randomUUID();
    const args = {
      p_compra_id: compraId,
      p_monto: 250,
      p_metodo_pago: 'efectivo',
      p_referencia: null,
      p_cuenta_bancaria_id: null,
      p_notas: null,
      p_actor_id: adminId,
      p_solicitud_id: solicitudId,
    };

    const [a, b] = await Promise.all([
      crearClienteServicio().rpc('pagar_compra', args),
      crearClienteServicio().rpc('pagar_compra', args),
    ]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect([a.data?.[0]?.idempotente, b.data?.[0]?.idempotente].sort()).toEqual([false, true]);
    expect(a.data?.[0]?.pago_id).toBe(b.data?.[0]?.pago_id);

    const pagos = await admin.from('pagos_compra').select('id').eq('compra_id', compraId);
    expect(pagos.data).toHaveLength(1);
    const compra = await admin.from('compras').select('saldo_pendiente').eq('id', compraId).single();
    expect(Number(compra.data?.saldo_pendiente)).toBe(750);
  });

  it('dos pagos parciales con claves distintas sí se registran', async () => {
    const compraId = await crearCompra(500);
    const base = {
      p_compra_id: compraId,
      p_metodo_pago: 'transferencia' as const,
      p_referencia: null,
      p_cuenta_bancaria_id: null,
      p_notas: null,
      p_actor_id: adminId,
    };

    const primero = await admin.rpc('pagar_compra', { ...base, p_monto: 200, p_solicitud_id: randomUUID() });
    const segundo = await admin.rpc('pagar_compra', { ...base, p_monto: 300, p_solicitud_id: randomUUID() });
    expect(primero.error).toBeNull();
    expect(segundo.error).toBeNull();

    const pagos = await admin.from('pagos_compra').select('id').eq('compra_id', compraId);
    expect(pagos.data).toHaveLength(2);
    const compra = await admin.from('compras').select('saldo_pendiente, estado').eq('id', compraId).single();
    expect(Number(compra.data?.saldo_pendiente)).toBe(0);
    expect(compra.data?.estado).toBe('PAGADA');
  });
});
