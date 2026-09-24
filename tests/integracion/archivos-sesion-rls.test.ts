import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

const { describir: suite, crearClienteServicio, crearClienteAnonimo } = prepararSuiteSupabaseLocal(
  'Archivos de sesión PRD-17 y RLS', { requiereClaveAnonima: true },
);

suite('PRD-17: metadatos privados por sesión con JWT real', () => {
  let servicio: SupabaseClient<Database>;
  let administrador: SupabaseClient<Database>;
  let operador: SupabaseClient<Database>;
  const clienteId = randomUUID();
  const ordenId = randomUUID();
  const partidaId = randomUUID();
  const recursoId = randomUUID();
  const programacionId = randomUUID();
  const sesionId = randomUUID();
  const archivoId = randomUUID();
  const usuarios: string[] = [];
  let administradorId = '';

  async function crearUsuario(rol: 'admin' | 'operador') {
    const correo = `prd17-${randomUUID()}@orca.local`;
    const clave = `Prd17!${randomUUID()}Aa`;
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

  beforeAll(async () => {
    servicio = crearClienteServicio();
    const admin = await crearUsuario('admin');
    const personaOperadora = await crearUsuario('operador');
    administrador = admin.cliente;
    administradorId = admin.id;
    operador = personaOperadora.cliente;
    const sufijo = randomUUID().slice(0, 8).toUpperCase();
    const operaciones = [
      await servicio.from('clientes').insert({ id: clienteId, nombre_comercial: `PRD17 ${sufijo}`, razon_social: `PRD17 ${sufijo} SA` }),
      await servicio.from('recursos_planeacion').insert({ id: recursoId, codigo: `PRD17-${sufijo}`, nombre: 'Recurso PRD17', area: 'taller', activo: true }),
    ];
    for (const resultado of operaciones) if (resultado.error) throw resultado.error;
    const folio = await servicio.rpc('generar_folio_orden', { p_prefijo: 'OP' });
    if (folio.error || !folio.data) throw folio.error ?? new Error('No se generó folio');
    const orden = await servicio.from('ordenes_produccion').insert({
      id: ordenId, folio: folio.data, cliente_id: clienteId,
      estado: 'en_proceso', fecha_compromiso: '2099-12-31T00:00:00Z',
    });
    if (orden.error) throw orden.error;
    const partida = await servicio.from('partidas_orden_produccion').insert({
      id: partidaId, orden_id: ordenId, codigo_pieza: `PRD17-${sufijo}`,
      cantidad_solicitada: 10, unidad_medida: 'pieza', operador_asignado_id: personaOperadora.id,
    });
    if (partida.error) throw partida.error;
    const programacion = await servicio.from('programacion_areas').insert({
      id: programacionId, orden_id: ordenId, partida_id: partidaId, recurso_id: recursoId,
      secuencia: 1, estado_planeacion: 'bloqueada', fecha_programada: '2099-12-30',
      turno: 'matutino', horas_estimadas: 2,
    });
    if (programacion.error) throw programacion.error;
    const sesion = await servicio.from('sesiones_trabajo').insert({
      id: sesionId, orden_id: ordenId, partida_id: partidaId, programacion_id: programacionId,
      operador_id: personaOperadora.id, estado_sesion: 'pausada',
      fecha_inicio: new Date(Date.now() - 3_600_000).toISOString(), fecha_fin: new Date().toISOString(),
      horas_brutas: 1, horas_netas: 1, piezas_producidas: 2, motivo_pausa: 'otro',
    });
    if (sesion.error) throw sesion.error;
    const archivo = await servicio.from('archivos_sesion_produccion').insert({
      id: archivoId, sesion_id: sesionId,
      ruta: `${sesionId}/${administradorId}/${randomUUID()}.pdf`, nombre: 'bitacora.pdf',
      mime: 'application/pdf', tamano: 1500, creado_por: administradorId,
    });
    if (archivo.error) throw archivo.error;
  });

  afterAll(async () => {
    if (!servicio) return;
    await servicio.from('archivos_sesion_produccion').delete().eq('id', archivoId);
    await servicio.from('sesiones_trabajo').delete().eq('id', sesionId);
    await servicio.from('programacion_areas').delete().eq('id', programacionId);
    await servicio.from('partidas_orden_produccion').delete().eq('id', partidaId);
    await servicio.from('ordenes_produccion').delete().eq('id', ordenId);
    await servicio.from('recursos_planeacion').delete().eq('id', recursoId);
    await servicio.from('clientes').delete().eq('id', clienteId);
    for (const id of usuarios) await servicio.auth.admin.deleteUser(id);
  });

  it('permite leer al administrador pero no al operador o visitante', async () => {
    const [admin, piso, visitante] = await Promise.all([
      administrador.from('archivos_sesion_produccion').select('id').eq('id', archivoId),
      operador.from('archivos_sesion_produccion').select('id').eq('id', archivoId),
      crearClienteAnonimo().from('archivos_sesion_produccion').select('id').eq('id', archivoId),
    ]);
    expect(admin.error).toBeNull();
    expect(admin.data).toHaveLength(1);
    expect(piso.data ?? []).toHaveLength(0);
    expect(visitante.data ?? []).toHaveLength(0);
  });

  it('no deja editar ni insertar metadatos directamente desde JWT de administrador', async () => {
    const insercion = await administrador.from('archivos_sesion_produccion').insert({
      sesion_id: sesionId, ruta: `${sesionId}/${administradorId}/${randomUUID()}.pdf`,
      nombre: 'atajo.pdf', mime: 'application/pdf', tamano: 100, creado_por: administradorId,
    });
    const eliminacion = await administrador.from('archivos_sesion_produccion').delete().eq('id', archivoId);
    expect(insercion.error).not.toBeNull();
    expect(eliminacion.error).not.toBeNull();
    const original = await servicio.from('archivos_sesion_produccion').select('id').eq('id', archivoId);
    expect(original.data).toHaveLength(1);
  });

  it('rechaza una ruta de otra sesión y no la presenta como archivo de esta orden', async () => {
    const otraSesion = await servicio.from('archivos_sesion_produccion').insert({
      sesion_id: sesionId, ruta: `${randomUUID()}/${administradorId}/${randomUUID()}.pdf`,
      nombre: 'ajeno.pdf', mime: 'application/pdf', tamano: 100, creado_por: administradorId,
    });
    expect(otraSesion.error?.code).toBe('23514');
    const otraOrden = await servicio.from('archivos_sesion_produccion')
      .select('id, sesiones_trabajo!inner(orden_id)').eq('id', archivoId)
      .eq('sesiones_trabajo.orden_id', randomUUID());
    expect(otraOrden.error).toBeNull();
    expect(otraOrden.data).toHaveLength(0);
  });

  it('revoca lectura con JWT antiguo al desactivar al administrador', async () => {
    const baja = await servicio.from('usuarios').update({ activo: false }).eq('id', administradorId);
    if (baja.error) throw baja.error;
    const lectura = await administrador.from('archivos_sesion_produccion').select('id').eq('id', archivoId);
    expect(lectura.error).toBeNull();
    expect(lectura.data).toHaveLength(0);
    const historico = await servicio.from('archivos_sesion_produccion').select('id').eq('id', archivoId);
    expect(historico.data).toHaveLength(1);
  });
});
