import { randomUUID } from 'node:crypto';
import { type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

const { describir: suite, crearClienteServicio } = prepararSuiteSupabaseLocal(
  'alta excepcional de AR bajo concurrencia',
);

suite('dos solicitudes de factura para la misma orden entregada', () => {
  let clienteA: SupabaseClient<Database>;
  let clienteB: SupabaseClient<Database>;
  let actorId: string | null = null;
  let clienteId: string | null = null;
  let ordenId: string | null = null;

  beforeAll(async () => {
    clienteA = crearClienteServicio();
    clienteB = crearClienteServicio();
    const { data: usuario, error: errorUsuario } = await clienteA.auth.admin.createUser({
      email: `a20-ar-${randomUUID()}@orca.local`, password: `A20!${randomUUID()}`,
      email_confirm: true,
    });
    if (errorUsuario || !usuario.user) throw new Error(errorUsuario?.message ?? 'Sin actor');
    actorId = usuario.user.id;
    const { error: errorPerfil } = await clienteA.from('usuarios').update({ rol: 'admin', activo: true }).eq('id', actorId);
    if (errorPerfil) throw errorPerfil;
    const { data: cliente, error: errorCliente } = await clienteA.from('clientes').insert({
      nombre_comercial: 'Cliente concurrencia AR', razon_social: 'Cliente concurrencia AR', estado: 'activo',
    }).select('id').single();
    if (errorCliente || !cliente) throw new Error(errorCliente?.message ?? 'Sin cliente');
    clienteId = cliente.id;
    const folio = `OP-${900000 + (Number.parseInt(randomUUID().slice(0, 8), 16) % 99999)}`;
    const { data: orden, error: errorOrden } = await clienteA.from('ordenes_produccion').insert({
      folio, cliente_id: clienteId, estado: 'completada', archivada_en: new Date().toISOString(),
      fecha_compromiso: new Date(Date.now() + 86400000).toISOString(),
    }).select('id').single();
    if (errorOrden || !orden) throw new Error(errorOrden?.message ?? 'Sin orden');
    ordenId = orden.id;
  });

  afterAll(async () => {
    if (!clienteA) return;
    if (ordenId) {
      await clienteA.from('cuentas_por_cobrar').delete().eq('orden_id', ordenId);
      await clienteA.from('ordenes_produccion').delete().eq('id', ordenId);
    }
    if (clienteId) await clienteA.from('clientes').delete().eq('id', clienteId);
    if (actorId) {
      await clienteA.from('usuarios').delete().eq('id', actorId);
      await clienteA.auth.admin.deleteUser(actorId);
    }
  });

  it('crea exactamente una AR y devuelve duplicado a la otra conexión', async () => {
    if (!actorId || !ordenId) throw new Error('Fixture incompleta');
    const entrada = {
      p_orden_id: ordenId, p_monto_total: 116, p_moneda: 'MXN', p_tipo_cambio_origen: 1,
      p_fecha_vencimiento: new Date(Date.now() + 30 * 86400000).toISOString(),
      p_folio_factura: 'FAC-CONCURRENCIA', p_actor_id: actorId,
    };
    const respuestas = await Promise.all([
      clienteA.rpc('abrir_ar_excepcion_entregada', entrada),
      clienteB.rpc('abrir_ar_excepcion_entregada', entrada),
    ]);
    expect(respuestas.filter((respuesta) => !respuesta.error)).toHaveLength(1);
    expect(respuestas.filter((respuesta) => respuesta.error?.message.includes('cuenta_por_cobrar_ya_existe'))).toHaveLength(1);
    const { data, error } = await clienteA.from('cuentas_por_cobrar').select('id, monto_total').eq('orden_id', ordenId);
    if (error) throw error;
    expect(data).toHaveLength(1);
    expect(data?.[0].monto_total).toBe(116);
  });
});
