import { randomUUID } from 'node:crypto';
import { type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// Un JWT emitido antes de la baja permanece válido hasta expirar. Esta prueba
// solo escribe fixtures contra el Supabase local y jamás lee .env.local.
const { describir: suite, crearClienteServicio, crearClienteAnonimo } = prepararSuiteSupabaseLocal(
  'RLS de usuario inactivo',
  { requiereClaveAnonima: true },
);

suite('A09: revocación efectiva con JWT anterior a la desactivación', () => {
  let admin: SupabaseClient<Database>;
  let vendedor: SupabaseClient<Database>;
  let otroVendedor: SupabaseClient<Database>;
  let gerente: SupabaseClient<Database>;
  let administrador: SupabaseClient<Database>;
  const usuarios: string[] = [];
  let vendedorId = '';
  let oportunidadId = '';
  let lineaId = '';
  let rutaAdjunto = '';

  async function crearUsuario(rol: 'vendedor' | 'gerente' | 'admin') {
    const email = `a09-${randomUUID()}@orca.local`;
    const password = `A09!${randomUUID()}`;
    const alta = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (alta.error || !alta.data.user) throw new Error(alta.error?.message ?? 'No se creó usuario');
    const id = alta.data.user.id;
    usuarios.push(id);
    const actualizacion = await admin.from('usuarios').update({ rol, activo: true }).eq('id', id);
    if (actualizacion.error) throw actualizacion.error;
    const cliente = crearClienteAnonimo();
    const ingreso = await cliente.auth.signInWithPassword({ email, password });
    if (ingreso.error || !ingreso.data.session) throw new Error(ingreso.error?.message ?? 'No se emitió JWT');
    return { id, cliente };
  }

  beforeAll(async () => {
    admin = crearClienteServicio();
    const primero = await crearUsuario('vendedor');
    vendedorId = primero.id;
    vendedor = primero.cliente;
    otroVendedor = (await crearUsuario('vendedor')).cliente;
    gerente = (await crearUsuario('gerente')).cliente;
    administrador = (await crearUsuario('admin')).cliente;
    const folio = await admin.rpc('generar_folio_op');
    if (folio.error || !folio.data) throw new Error(folio.error?.message ?? 'Sin folio');
    const oportunidad = await admin.from('pipeline').insert({
      folio_op: folio.data, vendedor_id: vendedorId,
      empresa: 'A09 QA local', nombre_contacto: 'QA', etapa: 'prospecto',
    }).select('id').single();
    if (oportunidad.error || !oportunidad.data) throw new Error(oportunidad.error?.message ?? 'Sin oportunidad');
    oportunidadId = oportunidad.data.id;
    const linea = await admin.from('cotizacion_lineas').insert({
      pipeline_id: oportunidadId, descripcion: 'A09 QA', cantidad: 1, precio_unitario: 1,
    }).select('id').single();
    if (linea.error || !linea.data) throw new Error(linea.error?.message ?? 'Sin línea');
    lineaId = linea.data.id;
    rutaAdjunto = `${oportunidadId}/a09-${randomUUID()}.txt`;
    const adjunto = await admin.storage.from('adjuntos-cotizacion').upload(
      rutaAdjunto, new TextEncoder().encode('Solo fixture local A09'), { contentType: 'text/plain' },
    );
    if (adjunto.error) throw adjunto.error;
  });

  afterAll(async () => {
    if (!admin) return;
    if (rutaAdjunto) await admin.storage.from('adjuntos-cotizacion').remove([rutaAdjunto]);
    if (lineaId) await admin.from('cotizacion_lineas').delete().eq('id', lineaId);
    if (oportunidadId) await admin.from('pipeline').delete().eq('id', oportunidadId);
    for (const id of usuarios) {
      await admin.from('logs').delete().eq('usuario_id', id);
      await admin.from('usuarios').delete().eq('id', id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it('mantiene acceso legítimo y aísla al otro vendedor antes de la baja', async () => {
    const [propia, linea, adjunto, ajena, gerenteVista, adminVista] = await Promise.all([
      vendedor.from('pipeline').select('id').eq('id', oportunidadId),
      vendedor.from('cotizacion_lineas').select('id').eq('id', lineaId),
      vendedor.storage.from('adjuntos-cotizacion').download(rutaAdjunto),
      otroVendedor.from('pipeline').select('id').eq('id', oportunidadId),
      gerente.from('pipeline').select('id').eq('id', oportunidadId),
      administrador.from('pipeline').select('id').eq('id', oportunidadId),
    ]);
    expect(propia.error).toBeNull();
    expect(propia.data).toHaveLength(1);
    expect(linea.error).toBeNull();
    expect(linea.data).toHaveLength(1);
    expect(adjunto.error).toBeNull();
    expect(ajena.data).toHaveLength(0);
    expect(gerenteVista.data).toHaveLength(1);
    expect(adminVista.data).toHaveLength(1);
  });

  it('corta pipeline, líneas y adjuntos con el mismo JWT después de la baja', async () => {
    const baja = await admin.from('usuarios').update({ activo: false }).eq('id', vendedorId);
    if (baja.error) throw baja.error;
    const [propia, linea, adjunto, adminVista] = await Promise.all([
      vendedor.from('pipeline').select('id').eq('id', oportunidadId),
      vendedor.from('cotizacion_lineas').select('id').eq('id', lineaId),
      vendedor.storage.from('adjuntos-cotizacion').download(rutaAdjunto),
      administrador.from('pipeline').select('id').eq('id', oportunidadId),
    ]);
    expect.soft(propia.data, 'pipeline con JWT anterior').toHaveLength(0);
    expect.soft(linea.data, 'líneas con JWT anterior').toHaveLength(0);
    expect.soft(adjunto.error, 'adjunto con JWT anterior').not.toBeNull();
    expect(adminVista.data).toHaveLength(1);
  });
});
