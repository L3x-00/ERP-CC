import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';

import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

const { describir: suite, crearClienteServicio } = prepararSuiteSupabaseLocal(
  'C3.1 numeración concurrente de ítems por revisión',
);

suite('agregar_item_propuesta bajo dos conexiones', () => {
  let admin: SupabaseClient<Database>;
  let usuarioId = '';
  let clienteId = '';
  let rfqId = '';
  let propuestaId = '';
  let revisionId = '';

  beforeAll(async () => {
    admin = crearClienteServicio();
    const sufijo = randomUUID().slice(0, 8);
    const usuario = await admin.auth.admin.createUser({
      email: `c31-concurrencia-${sufijo}@orca.local`,
      password: `E2e!${randomUUID()}C31`,
      email_confirm: true,
      user_metadata: { nombre_completo: `Admin C3.1 ${sufijo}` },
    });
    if (usuario.error || !usuario.data.user) throw usuario.error ?? new Error('Sin usuario C3.1');
    usuarioId = usuario.data.user.id;
    const perfil = await admin
      .from('usuarios')
      .update({ rol: 'admin', activo: true, nombre_completo: `Admin C3.1 ${sufijo}` })
      .eq('id', usuarioId);
    if (perfil.error) throw perfil.error;

    const cliente = await admin
      .from('clientes')
      .insert({
        nombre_comercial: `Cliente C3.1 ${sufijo}`,
        razon_social: `Cliente C3.1 ${sufijo} SA de CV`,
        estado: 'activo',
      })
      .select('id')
      .single();
    if (cliente.error || !cliente.data) throw cliente.error ?? new Error('Sin cliente C3.1');
    clienteId = cliente.data.id;

    const rfq = await admin
      .from('pipeline')
      .insert({
        folio_op: `OP-C31-${sufijo}`,
        etapa: 'negociacion',
        estado_rfq: 'CONVERTED',
        nombre_contacto: 'Contacto C3.1',
        empresa: `Empresa C3.1 ${sufijo}`,
        cliente_id: clienteId,
        vendedor_id: usuarioId,
        moneda: 'MXN',
        iva_porcentaje: 16,
        descripcion_general: 'Concurrencia C3.1',
        canal: 'correo',
        fecha_solicitud: '2026-10-08',
      })
      .select('id')
      .single();
    if (rfq.error || !rfq.data) throw rfq.error ?? new Error('Sin RFQ C3.1');
    rfqId = rfq.data.id;

    const folio = await admin.rpc('generar_folio_periodico', { p_tipo: 'CNC' });
    if (folio.error || !folio.data) throw folio.error ?? new Error('Sin folio C3.1');
    const propuesta = await admin
      .from('propuestas')
      .insert({
        rfq_id: rfqId,
        cliente_id: clienteId,
        folio_cnc: folio.data,
        estado: 'DRAFT',
        responsable_id: usuarioId,
        creado_por: usuarioId,
      })
      .select('id')
      .single();
    if (propuesta.error || !propuesta.data) throw propuesta.error ?? new Error('Sin Propuesta C3.1');
    propuestaId = propuesta.data.id;

    const revision = await admin
      .from('propuesta_revisiones')
      .insert({
        propuesta_id: propuestaId,
        letra: 'B',
        folio_revision: `${folio.data}-B`,
        estado: 'DRAFT',
        motivo_creacion: 'Fixture concurrente C3.1',
        snapshot_cabecera: {},
        creado_por: usuarioId,
      })
      .select('id')
      .single();
    if (revision.error || !revision.data) throw revision.error ?? new Error('Sin revisión C3.1');
    revisionId = revision.data.id;

    const base = await admin.from('propuesta_items').insert([
      { revision_id: revisionId, codigo: 'IT01', descripcion: 'Base uno', cantidad: 1 },
      { revision_id: revisionId, codigo: 'IT02', descripcion: 'Base dos', cantidad: 1 },
    ]);
    if (base.error) throw base.error;
  });

  afterAll(async () => {
    if (!admin) return;
    if (propuestaId) await admin.from('propuestas').delete().eq('id', propuestaId);
    if (rfqId) await admin.from('pipeline').delete().eq('id', rfqId);
    if (clienteId) await admin.from('clientes').delete().eq('id', clienteId);
    if (usuarioId) {
      await admin.from('logs').delete().eq('usuario_id', usuarioId);
      await admin.from('usuarios').delete().eq('id', usuarioId);
      await admin.auth.admin.deleteUser(usuarioId);
    }
  });

  it('serializa dos altas y asigna IT03/IT04 sin duplicar ni tocar RFQ', async () => {
    const clienteA = crearClienteServicio();
    const clienteB = crearClienteServicio();
    const [respuestaA, respuestaB] = await Promise.all([
      clienteA.rpc('agregar_item_propuesta', {
        p_revision_id: revisionId,
        p_datos: { descripcion: 'Concurrente A', cantidad: 1 },
        p_actor: usuarioId,
      }),
      clienteB.rpc('agregar_item_propuesta', {
        p_revision_id: revisionId,
        p_datos: { descripcion: 'Concurrente B', cantidad: 1 },
        p_actor: usuarioId,
      }),
    ]);

    expect(respuestaA.error).toBeNull();
    expect(respuestaB.error).toBeNull();
    const codigos = [respuestaA.data, respuestaB.data]
      .map((fila) => (fila && typeof fila === 'object' && !Array.isArray(fila) ? fila.codigo : null))
      .sort();
    expect(codigos).toEqual(['IT03', 'IT04']);

    const items = await admin
      .from('propuesta_items')
      .select('codigo, revision_origen_id')
      .eq('revision_id', revisionId)
      .order('codigo');
    expect(items.error).toBeNull();
    expect(items.data?.map((item) => item.codigo)).toEqual(['IT01', 'IT02', 'IT03', 'IT04']);
    expect(items.data?.every((item) => item.revision_origen_id === revisionId)).toBe(true);

    const rfqItems = await admin
      .from('rfq_items')
      .select('id', { count: 'exact', head: true })
      .eq('rfq_id', rfqId);
    expect(rfqItems.error).toBeNull();
    expect(rfqItems.count).toBe(0);
  });
});
