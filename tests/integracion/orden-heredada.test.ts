import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// ORD-06: alta heredada con ID previo único, AR no cobrable y aislamiento de
// archivos. Escribe fixtures solo en el Supabase local.
const { describir: suite, crearClienteServicio, crearClienteAnonimo } = prepararSuiteSupabaseLocal(
  'orden heredada ORD-06', { requiereClaveAnonima: true },
);

suite('ORD-06: trabajo heredado persistente, único y con archivos privados', () => {
  let servicio: SupabaseClient<Database>;
  let operador: SupabaseClient<Database>;
  let administradorId = '';
  let operadorId = '';
  let clienteId = '';
  const usuarios: string[] = [];
  const ordenes: string[] = [];

  async function crearUsuario(rol: 'admin' | 'operador', activo: boolean) {
    const correo = `ord06-${randomUUID()}@orca.local`;
    const clave = `Ord06!${randomUUID()}Aa`;
    const alta = await servicio.auth.admin.createUser({ email: correo, password: clave, email_confirm: true });
    if (alta.error || !alta.data.user) throw alta.error ?? new Error('No se creó usuario');
    usuarios.push(alta.data.user.id);
    const perfil = await servicio.from('usuarios').update({ rol, activo }).eq('id', alta.data.user.id);
    if (perfil.error) throw perfil.error;
    const cliente = crearClienteAnonimo();
    const ingreso = await cliente.auth.signInWithPassword({ email: correo, password: clave });
    if (ingreso.error) throw ingreso.error;
    return { id: alta.data.user.id, cliente };
  }

  function argumentos(idHistorico: string, cliente: string) {
    return {
      p_cliente_id: cliente,
      p_actor_id: administradorId,
      p_id_historico: idHistorico,
      p_fecha_trabajo: '2026-08-20',
      p_fecha_compromiso: new Date(Date.now() + 86_400_000).toISOString(),
      p_condicion_pago: '30_dias',
      p_referencia_externa: 'LEGACY-INT-1',
      p_monto_sin_iva: 2500,
      p_monto_iva: 400,
      p_horas_estimadas: 16,
      p_notas: 'Trabajo heredado de integración',
      p_partidas: [{
        codigo_pieza: 'LEG-1',
        descripcion: 'Pieza heredada',
        cantidad_solicitada: 4,
        unidad_medida: 'pza',
        tiempo_estimado_minutos: 240,
        procesos: ['Corte', 'Pulido'],
      }],
    };
  }

  beforeAll(async () => {
    servicio = crearClienteServicio();
    const admin = await crearUsuario('admin', true);
    administradorId = admin.id;
    const personaOperadora = await crearUsuario('operador', true);
    operadorId = personaOperadora.id;
    operador = personaOperadora.cliente;
    const { data: cliente, error } = await servicio.from('clientes')
      .insert({
        nombre_comercial: `ORD06 ${randomUUID().slice(0, 6)}`,
        razon_social: 'ORD06 SA',
        estado: 'activo',
      })
      .select('id').single();
    if (error || !cliente) throw error ?? new Error('Sin cliente');
    clienteId = cliente.id;
  });

  afterAll(async () => {
    if (!servicio) return;
    for (const ordenId of ordenes) {
      await servicio.from('archivos_orden').delete().eq('orden_id', ordenId);
      const { data: partidas } = await servicio.from('partidas_orden_produccion')
        .select('id').eq('orden_id', ordenId);
      const partidaIds = (partidas ?? []).map((fila) => fila.id);
      if (partidaIds.length > 0) {
        await servicio.from('registros_avance_partida').delete().in('partida_id', partidaIds);
      }
      await servicio.from('sesiones_trabajo').delete().eq('orden_id', ordenId);
      await servicio.from('programacion_areas').delete().eq('orden_id', ordenId);
      await servicio.from('partidas_orden_produccion').delete().eq('orden_id', ordenId);
      await servicio.from('cuentas_por_cobrar').delete().eq('orden_id', ordenId);
      await servicio.from('ordenes_produccion').delete().eq('id', ordenId);
    }
    await servicio.from('clientes').delete().eq('id', clienteId);
    if (usuarios.length > 0) {
      await servicio.from('logs').delete().in('usuario_id', usuarios);
      await servicio.from('usuarios').delete().in('id', usuarios);
      for (const id of usuarios) await servicio.auth.admin.deleteUser(id);
    }
  });

  it('persiste orden, partidas, metas y AR no cobrable con ID normalizado', async () => {
    const idHistorico = `ord06-${randomUUID().slice(0, 8)}`;
    const { data, error } = await servicio.rpc('crear_orden_historica', argumentos(` ${idHistorico.toUpperCase()} `, clienteId));
    expect(error).toBeNull();
    const creada = data?.[0];
    expect(creada?.id).toBeTruthy();
    expect(creada?.folio).toMatch(/^OP-/);
    ordenes.push(creada!.id);

    const { data: orden } = await servicio.from('ordenes_produccion')
      .select('estado, id_historico, monto_sin_iva, monto_iva, condicion_pago, fecha_trabajo, horas_estimadas, cotizacion_id')
      .eq('id', creada!.id).single();
    expect(orden?.estado).toBe('programada');
    expect(orden?.id_historico).toBe(idHistorico);
    expect(Number(orden?.monto_sin_iva)).toBe(2500);
    expect(Number(orden?.monto_iva)).toBe(400);
    expect(orden?.condicion_pago).toBe('30_dias');
    expect(orden?.fecha_trabajo).toBe('2026-08-20');
    expect(Number(orden?.horas_estimadas)).toBe(16);
    expect(orden?.cotizacion_id).toBeNull();

    const { data: partidas } = await servicio.from('partidas_orden_produccion')
      .select('id, procesos, cantidad_producida').eq('orden_id', creada!.id);
    expect(partidas).toHaveLength(1);
    expect(partidas?.[0]?.procesos).toEqual(['Corte', 'Pulido']);
    expect(Number(partidas?.[0]?.cantidad_producida)).toBe(0);
    const { data: metas } = await servicio.from('metas_proceso_partida')
      .select('nombre, meta_piezas').eq('partida_id', partidas![0]!.id).order('secuencia');
    expect(metas?.map((meta) => meta.nombre)).toEqual(['Corte', 'Pulido']);

    const { data: cuenta } = await servicio.from('cuentas_por_cobrar')
      .select('estado, monto_total, monto_subtotal, monto_iva, cobrable_desde')
      .eq('orden_id', creada!.id).single();
    expect(cuenta?.estado).toBe('pendiente');
    expect(Number(cuenta?.monto_total)).toBe(2900);
    expect(Number(cuenta?.monto_subtotal)).toBe(2500);
    expect(Number(cuenta?.monto_iva)).toBe(400);
    expect(cuenta?.cobrable_desde).toBeNull();
  });

  it('rechaza un ID previo repetido sin duplicar orden ni AR', async () => {
    const idHistorico = `ord06-${randomUUID().slice(0, 8)}`;
    const primera = await servicio.rpc('crear_orden_historica', argumentos(idHistorico, clienteId));
    expect(primera.error).toBeNull();
    ordenes.push(primera.data![0]!.id);
    const repetida = await servicio.rpc('crear_orden_historica', argumentos(idHistorico.toUpperCase(), clienteId));
    expect(repetida.error?.message).toContain('id_historico_duplicado');

    const { data: ordenesConId } = await servicio.from('ordenes_produccion')
      .select('id').eq('id_historico', idHistorico);
    expect(ordenesConId).toHaveLength(1);
    const { data: cuentas } = await servicio.from('cuentas_por_cobrar')
      .select('id').eq('orden_id', ordenesConId![0]!.id);
    expect(cuentas).toHaveLength(1);
  });

  it('la identidad de operador no ejecuta el alta ni inserta archivos', async () => {
    const alta = await operador.rpc('crear_orden_historica', argumentos(`ord06-${randomUUID().slice(0, 8)}`, clienteId));
    expect(alta.error).not.toBeNull();

    const insercion = await operador.from('archivos_orden').insert({
      orden_id: randomUUID(), ruta: 'x/y.pdf', nombre: 'x.pdf', mime: 'application/pdf', tamano: 100,
    });
    expect(insercion.error).not.toBeNull();

    const { data: orden } = await servicio.from('ordenes_produccion')
      .select('id').eq('id_historico', 'ord06-inexistente').maybeSingle();
    expect(orden).toBeNull();
  });

  it('mantiene el bucket privado con carga firmada y limpieza del objeto', async () => {
    const ruta = `${randomUUID()}/${operadorId}/${randomUUID()}.pdf`;
    const firma = await servicio.storage.from('archivos-orden-historica').createSignedUploadUrl(ruta);
    expect(firma.error).toBeNull();
    expect(firma.data?.token).toBeTruthy();
    const subida = await servicio.storage.from('archivos-orden-historica')
      .uploadToSignedUrl(ruta, firma.data!.token, Buffer.from('%PDF-1.4 ORD-06\n'), { contentType: 'application/pdf' });
    expect(subida.error).toBeNull();
    const lectura = await servicio.storage.from('archivos-orden-historica').createSignedUrl(ruta, 60);
    expect(lectura.data?.signedUrl).toBeTruthy();
    const publica = await servicio.storage.from('archivos-orden-historica').getPublicUrl(ruta);
    const respuesta = await fetch(publica.data.publicUrl);
    expect(respuesta.ok).toBe(false);
    const limpieza = await servicio.storage.from('archivos-orden-historica').remove([ruta]);
    expect(limpieza.error).toBeNull();
  });
});
