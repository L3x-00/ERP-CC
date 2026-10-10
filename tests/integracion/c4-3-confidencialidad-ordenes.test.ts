import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';

import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// C4.3: prueba con JWT real. El rol gerente representa una cuenta operativa
// con acceso a Ordenes y Planeacion, pero sin permiso financiero. Los fixtures
// y su limpieza se ejecutan exclusivamente contra el Supabase local.
const { describir: suite, crearClienteServicio, crearClienteAnonimo } = prepararSuiteSupabaseLocal(
  'C4.3 confidencialidad de Ordenes',
  { requiereClaveAnonima: true },
);

suite('C4.3: proyecciones positivas para roles operativos', () => {
  let admin: SupabaseClient<Database>;
  let gerente: SupabaseClient<Database>;
  let usuarioId = '';
  let clienteId = '';
  let ordenId = '';
  let recursoId = '';

  beforeAll(async () => {
    admin = crearClienteServicio();
    const sufijo = randomUUID().slice(0, 8).toUpperCase();
    const correo = `c4-3-${randomUUID()}@orca.local`;
    const clave = `C4.3!${randomUUID()}Aa`;

    const alta = await admin.auth.admin.createUser({
      email: correo,
      password: clave,
      email_confirm: true,
    });
    if (alta.error || !alta.data.user) throw alta.error ?? new Error('No se creo usuario C4.3');
    usuarioId = alta.data.user.id;

    const perfil = await admin.from('usuarios').update({ rol: 'gerente', activo: true }).eq('id', usuarioId);
    if (perfil.error) throw perfil.error;

    gerente = crearClienteAnonimo();
    const ingreso = await gerente.auth.signInWithPassword({ email: correo, password: clave });
    if (ingreso.error || !ingreso.data.session) throw ingreso.error ?? new Error('No se emitio JWT C4.3');

    const cliente = await admin.from('clientes').insert({
      nombre_comercial: `C4.3 ${sufijo}`,
      razon_social: `C4.3 ${sufijo} SA`,
    }).select('id').single();
    if (cliente.error || !cliente.data) throw cliente.error ?? new Error('No se creo cliente C4.3');
    clienteId = cliente.data.id;

    const folio = await admin.rpc('generar_folio_orden', { p_prefijo: 'OP' });
    if (folio.error || !folio.data) throw folio.error ?? new Error('No se genero folio C4.3');

    const orden = await admin.from('ordenes_produccion').insert({
      folio: folio.data,
      cliente_id: clienteId,
      estado: 'programada',
      prioridad: 'normal',
      fecha_compromiso: '2099-12-31T18:00:00.000Z',
      fecha_operativa: '2099-12-30T18:00:00.000Z',
      condicion_pago: 'credito',
      monto_sin_iva: 75000,
      monto_iva: 12000,
      snapshot_json: {
        totales: { subtotal: 75000, iva: 12000, total: 87000, moneda: 'MXN' },
      },
    }).select('id').single();
    if (orden.error || !orden.data) throw orden.error ?? new Error('No se creo orden C4.3');
    ordenId = orden.data.id;

    const recurso = await admin.from('recursos_planeacion').insert({
      codigo: `C43-${sufijo}`,
      nombre: `Recurso C4.3 ${sufijo}`,
      area: 'taller',
      activo: true,
      costo_hora_interno: 987.65,
      tarifa_override_activa: true,
      tarifa_override_hora: 1234.56,
      tarifa_override_moneda: 'MXN',
    }).select('id').single();
    if (recurso.error || !recurso.data) throw recurso.error ?? new Error('No se creo recurso C4.3');
    recursoId = recurso.data.id;
  });

  afterAll(async () => {
    if (!admin) return;
    if (ordenId) await admin.from('ordenes_produccion').delete().eq('id', ordenId);
    if (recursoId) await admin.from('recursos_planeacion').delete().eq('id', recursoId);
    if (clienteId) await admin.from('clientes').delete().eq('id', clienteId);
    if (usuarioId) {
      await admin.from('logs').delete().eq('usuario_id', usuarioId);
      await admin.from('usuarios').delete().eq('id', usuarioId);
      await admin.auth.admin.deleteUser(usuarioId);
    }
  });

  it('permite consultar la Orden operativa y rechaza finanzas o select total', async () => {
    const [operativa, financiera, completa] = await Promise.all([
      gerente.from('ordenes_produccion')
        .select('id, folio, estado, prioridad, fecha_operativa')
        .eq('id', ordenId)
        .single(),
      gerente.from('ordenes_produccion')
        .select('id, monto_sin_iva, monto_iva, snapshot_json')
        .eq('id', ordenId),
      gerente.from('ordenes_produccion').select('*').eq('id', ordenId),
    ]);

    expect(operativa.error).toBeNull();
    expect(operativa.data).toMatchObject({ id: ordenId, estado: 'programada' });
    expect(financiera.error?.code).toBe('42501');
    expect(financiera.data).toBeNull();
    expect(completa.error?.code).toBe('42501');
    expect(completa.data).toBeNull();
  });

  it('permite consultar el recurso operativo y rechaza costos y tarifas', async () => {
    const [operativo, confidencial, lecturaPrivilegiada] = await Promise.all([
      gerente.from('recursos_planeacion')
        .select('id, codigo, nombre, area, activo, grupo_equipo_id')
        .eq('id', recursoId)
        .single(),
      gerente.from('recursos_planeacion')
        .select('id, costo_hora_interno, tarifa_override_hora, tarifa_override_moneda')
        .eq('id', recursoId),
      admin.from('recursos_planeacion')
        .select('costo_hora_interno, tarifa_override_hora, tarifa_override_moneda')
        .eq('id', recursoId)
        .single(),
    ]);

    expect(operativo.error).toBeNull();
    expect(operativo.data?.id).toBe(recursoId);
    expect(confidencial.error?.code).toBe('42501');
    expect(confidencial.data).toBeNull();
    expect(lecturaPrivilegiada.error).toBeNull();
    expect(lecturaPrivilegiada.data).toMatchObject({
      costo_hora_interno: 987.65,
      tarifa_override_hora: 1234.56,
      tarifa_override_moneda: 'MXN',
    });
  });

  it('rechaza el costo historico de sesiones sin romper su lectura operativa', async () => {
    const [operativa, confidencial, lecturaPrivilegiada] = await Promise.all([
      gerente.from('sesiones_trabajo').select('id, estado_sesion, horas_netas').limit(1),
      gerente.from('sesiones_trabajo').select('id, costo_hora_interno').limit(1),
      admin.from('sesiones_trabajo').select('id, costo_hora_interno').limit(1),
    ]);

    expect(operativa.error).toBeNull();
    expect(confidencial.error?.code).toBe('42501');
    expect(confidencial.data).toBeNull();
    expect(lecturaPrivilegiada.error).toBeNull();
  });
});
