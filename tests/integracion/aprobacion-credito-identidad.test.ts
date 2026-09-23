import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

const contexto = vi.hoisted(() => ({
  admin: null as unknown,
  servidor: null as unknown,
  usuario: null as unknown,
}));
vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: async () => contexto.usuario,
}));
vi.mock('@/nucleo/supabase/admin', () => ({ crearClienteSupabaseAdmin: () => contexto.admin }));
vi.mock('@/nucleo/supabase/servidor', () => ({ crearClienteSupabaseServidor: async () => contexto.servidor }));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({ registrarLog: async () => {} }));

import { marcarGanadaAccion } from '@/modulos/pipeline/acciones/marcar-ganada';

const { describir, crearClienteServicio, crearClienteAnonimo } = prepararSuiteSupabaseLocal(
  'A13-A14 aprobación comercial',
  { requiereClaveAnonima: true },
);

describir('A13-A14: aprobación con crédito e identidad de cliente', () => {
  let admin: SupabaseClient<Database>;
  let usuarioId = '';
  const clientes: string[] = [];
  const oportunidades: string[] = [];
  const ordenes: string[] = [];

  beforeAll(async () => {
    admin = crearClienteServicio();
    const servidor = crearClienteAnonimo();
    const correo = `qa-credito-${randomUUID()}@orca.local`;
    const contrasena = `Qa!${randomUUID()}A9`;
    const alta = await admin.auth.admin.createUser({
      email: correo, password: contrasena, email_confirm: true,
    });
    if (alta.error || !alta.data.user) throw new Error(alta.error?.message ?? 'Sin usuario QA');
    usuarioId = alta.data.user.id;
    const perfil = await admin.from('usuarios').update({ rol: 'gerente', activo: true }).eq('id', usuarioId);
    if (perfil.error) throw perfil.error;
    const ingreso = await servidor.auth.signInWithPassword({ email: correo, password: contrasena });
    if (ingreso.error) throw ingreso.error;
    contexto.servidor = servidor;
    contexto.admin = admin;
    contexto.usuario = {
      id: usuarioId,
      email: correo,
      nombreCompleto: 'Gerente QA Crédito',
      rol: 'gerente',
      activo: true,
      permisos: ['aprobar_ordenes', 'ver_pipeline_equipo'],
    };
  });

  async function crearCliente(limite: number): Promise<{ id: string; nombre: string }> {
    const nombre = `QA-CREDITO-${randomUUID()}`;
    const respuesta = await admin.from('clientes').insert({
      razon_social: nombre,
      nombre_comercial: nombre,
      limite_credito: limite,
      estado: 'activo',
    }).select('id').single();
    if (respuesta.error || !respuesta.data) throw new Error(respuesta.error?.message ?? 'Sin cliente QA');
    clientes.push(respuesta.data.id);
    return { id: respuesta.data.id, nombre };
  }

  async function crearOportunidad(clienteId: string, empresa: string, importe: number): Promise<string> {
    const folio = await admin.rpc('generar_folio_op');
    if (folio.error || !folio.data) throw new Error(folio.error?.message ?? 'Sin folio QA');
    const respuesta = await admin.from('pipeline').insert({
      folio_op: folio.data,
      empresa,
      nombre_contacto: 'Contacto QA',
      vendedor_id: usuarioId,
      cliente_id: clienteId,
      etapa: 'negociacion',
      iva_porcentaje: 0,
    }).select('id').single();
    if (respuesta.error || !respuesta.data) throw new Error(respuesta.error?.message ?? 'Sin oportunidad QA');
    const id = respuesta.data.id;
    oportunidades.push(id);
    const linea = await admin.from('cotizacion_lineas').insert({
      pipeline_id: id, descripcion: 'Línea QA', cantidad: 1, precio_unitario: importe,
    });
    if (linea.error) throw linea.error;
    return id;
  }

  it('serializa el crédito de dos aprobaciones de 80 con límite compartido 100', async () => {
    const cliente = await crearCliente(100);
    const primera = await crearOportunidad(cliente.id, cliente.nombre, 80);
    const segunda = await crearOportunidad(cliente.id, cliente.nombre, 80);
    let llegadas = 0;
    let liberar = () => {};
    const barrera = new Promise<void>((resolver) => { liberar = resolver; });
    const temporizador = setTimeout(liberar, 10_000);
    contexto.admin = new Proxy(admin, {
      get(objetivo, propiedad) {
        if (propiedad === 'rpc') {
          return async (nombre: string, argumentos: Record<string, unknown>) => {
            if (nombre === 'aprobar_oportunidad_y_crear_orden') {
              llegadas += 1;
              if (llegadas === 2) liberar();
              await barrera;
            }
            return objetivo.rpc(nombre as never, argumentos as never);
          };
        }
        return Reflect.get(objetivo, propiedad);
      },
    });
    try {
      const respuestas = await Promise.all([primera, segunda].map((id) => marcarGanadaAccion({
        id, fechaCompromiso: '2026-10-20T00:00:00Z',
      })));
      for (const respuesta of respuestas) {
        if (respuesta.exito && respuesta.datos) ordenes.push(respuesta.datos.ordenId);
      }
      const cuentas = await admin.from('cuentas_por_cobrar').select('saldo_pendiente').eq('cliente_id', cliente.id);
      if (cuentas.error) throw cuentas.error;
      const saldo = (cuentas.data ?? []).reduce((suma, cuenta) => suma + Number(cuenta.saldo_pendiente), 0);
      expect(llegadas).toBe(2);
      expect(respuestas.filter((respuesta) => respuesta.exito)).toHaveLength(1);
      expect(saldo).toBe(80);
      expect(respuestas.find((respuesta) => respuesta.requiereAutorizacionCredito)?.excedenteMxn).toBe(60);
    } finally {
      clearTimeout(temporizador);
      contexto.admin = admin;
    }
  });

  it('conserva el cliente seleccionado aunque empresa y correo difieran', async () => {
    const cliente = await crearCliente(0);
    const oportunidad = await crearOportunidad(cliente.id, `Otra empresa ${randomUUID()}`, 80);
    const respuesta = await marcarGanadaAccion({
      id: oportunidad, fechaCompromiso: '2026-10-20T00:00:00Z',
    });
    if (respuesta.exito && respuesta.datos) {
      ordenes.push(respuesta.datos.ordenId);
      if (respuesta.datos.clienteId !== cliente.id) clientes.push(respuesta.datos.clienteId);
    }
    const pipeline = await admin.from('pipeline').select('cliente_id').eq('id', oportunidad).single();
    if (pipeline.error) throw pipeline.error;
    expect(respuesta.exito).toBe(true);
    if (!respuesta.exito || !respuesta.datos) throw new Error('La aprobación no devolvió orden');
    expect(respuesta.datos.clienteId).toBe(cliente.id);
    expect(pipeline.data.cliente_id).toBe(cliente.id);
    const orden = await admin.from('ordenes_produccion').select('cliente_id').eq('id', respuesta.datos.ordenId).single();
    const cuenta = await admin.from('cuentas_por_cobrar').select('cliente_id').eq('orden_id', respuesta.datos.ordenId).single();
    expect(orden.data?.cliente_id).toBe(cliente.id);
    expect(cuenta.data?.cliente_id).toBe(cliente.id);
  });

  it('evalúa el límite del cliente seleccionado y no crea otro para eludirlo', async () => {
    const cliente = await crearCliente(1);
    const oportunidad = await crearOportunidad(cliente.id, `Otra empresa ${randomUUID()}`, 80);
    const respuesta = await marcarGanadaAccion({
      id: oportunidad, fechaCompromiso: '2026-10-20T00:00:00Z',
    });
    expect(respuesta.exito).toBe(false);
    expect(respuesta.requiereAutorizacionCredito).toBe(true);
    const pipeline = await admin.from('pipeline').select('cliente_id').eq('id', oportunidad).single();
    const ordenesCreadas = await admin.from('ordenes_produccion').select('id').eq('cotizacion_id', oportunidad);
    expect(pipeline.data?.cliente_id).toBe(cliente.id);
    expect(ordenesCreadas.data).toEqual([]);
  });

  it('rechaza un cliente seleccionado que ya no está activo', async () => {
    const cliente = await crearCliente(0);
    const oportunidad = await crearOportunidad(cliente.id, `Otra empresa ${randomUUID()}`, 80);
    const baja = await admin.from('clientes').update({ estado: 'inactivo' }).eq('id', cliente.id);
    if (baja.error) throw baja.error;
    const respuesta = await marcarGanadaAccion({
      id: oportunidad, fechaCompromiso: '2026-10-20T00:00:00Z',
    });
    expect(respuesta).toEqual({ exito: false, error: 'El cliente de la oportunidad no está activo' });
    const ordenesCreadas = await admin.from('ordenes_produccion').select('id').eq('cotizacion_id', oportunidad);
    expect(ordenesCreadas.data).toEqual([]);
  });

  it('permite sobregiro explícito de admin activo y el reintento no duplica la AR', async () => {
    const cliente = await crearCliente(100);
    const primera = await crearOportunidad(cliente.id, cliente.nombre, 80);
    const segunda = await crearOportunidad(cliente.id, cliente.nombre, 80);
    const alta = await admin.from('usuarios').update({ rol: 'admin' }).eq('id', usuarioId);
    if (alta.error) throw alta.error;
    contexto.usuario = { ...(contexto.usuario as object), rol: 'admin' };
    try {
      const aprobada = await marcarGanadaAccion({ id: primera, fechaCompromiso: '2026-10-20T00:00:00Z' });
      expect(aprobada.exito).toBe(true);
      if (!aprobada.exito || !aprobada.datos) throw new Error('No se aprobó la primera RFQ');
      ordenes.push(aprobada.datos.ordenId);

      const sobregiro = await marcarGanadaAccion({
        id: segunda, fechaCompromiso: '2026-10-20T00:00:00Z', autorizarSobregiro: true,
      });
      expect(sobregiro.exito).toBe(true);
      if (!sobregiro.exito || !sobregiro.datos) throw new Error('No se autorizó el sobregiro');
      ordenes.push(sobregiro.datos.ordenId);

      const repetida = await admin.rpc('aprobar_oportunidad_y_crear_orden', {
        p_pipeline_id: segunda,
        p_cliente_id: cliente.id,
        p_fecha_compromiso: '2026-10-20T00:00:00Z',
        p_autorizar_sobregiro: true,
        p_actor_id: usuarioId,
      });
      expect(repetida.error).toBeNull();
      expect(repetida.data?.[0]).toMatchObject({ id: sobregiro.datos.ordenId, ya_existia: true });
      const cuentas = await admin.from('cuentas_por_cobrar').select('orden_id,saldo_pendiente').eq('cliente_id', cliente.id);
      expect(cuentas.error).toBeNull();
      expect(cuentas.data).toHaveLength(2);
      expect((cuentas.data ?? []).reduce((suma, cuenta) => suma + Number(cuenta.saldo_pendiente), 0)).toBe(160);
    } finally {
      const restaura = await admin.from('usuarios').update({ rol: 'gerente' }).eq('id', usuarioId);
      if (restaura.error) throw restaura.error;
      contexto.usuario = { ...(contexto.usuario as object), rol: 'gerente' };
    }
  });

  it('la RPC rechaza sobregiro de gerente y de admin inactivo', async () => {
    const cliente = await crearCliente(1);
    const oportunidad = await crearOportunidad(cliente.id, cliente.nombre, 80);
    const argumentos = {
      p_pipeline_id: oportunidad,
      p_cliente_id: cliente.id,
      p_fecha_compromiso: '2026-10-20T00:00:00Z',
      p_autorizar_sobregiro: true,
      p_actor_id: usuarioId,
    };
    const gerente = await admin.rpc('aprobar_oportunidad_y_crear_orden', argumentos);
    expect(gerente.error?.message).toContain('sobregiro_requiere_admin_activo');
    const baja = await admin.from('usuarios').update({ rol: 'admin', activo: false }).eq('id', usuarioId);
    if (baja.error) throw baja.error;
    try {
      const inactivo = await admin.rpc('aprobar_oportunidad_y_crear_orden', argumentos);
      expect(inactivo.error?.message).toContain('sobregiro_requiere_admin_activo');
    } finally {
      const restaura = await admin.from('usuarios').update({ rol: 'gerente', activo: true }).eq('id', usuarioId);
      if (restaura.error) throw restaura.error;
    }
    const ordenesCreadas = await admin.from('ordenes_produccion').select('id').eq('cotizacion_id', oportunidad);
    expect(ordenesCreadas.data).toEqual([]);
  });

  it('la RPC rechaza sustituir por otro ID al cliente ya seleccionado', async () => {
    const elegido = await crearCliente(0);
    const ajeno = await crearCliente(0);
    const oportunidad = await crearOportunidad(elegido.id, elegido.nombre, 80);
    const resultado = await admin.rpc('aprobar_oportunidad_y_crear_orden', {
      p_pipeline_id: oportunidad,
      p_cliente_id: ajeno.id,
      p_fecha_compromiso: '2026-10-20T00:00:00Z',
      p_autorizar_sobregiro: false,
      p_actor_id: usuarioId,
    });
    expect(resultado.error?.message).toContain('cliente_no_corresponde_oportunidad');
    const ordenesCreadas = await admin.from('ordenes_produccion').select('id').eq('cotizacion_id', oportunidad);
    expect(ordenesCreadas.data).toEqual([]);
  });

  afterAll(async () => {
    if (!admin) return;
    for (const ordenId of ordenes) {
      await admin.from('cuentas_por_cobrar').delete().eq('orden_id', ordenId);
      await admin.from('ordenes_produccion').delete().eq('id', ordenId);
    }
    for (const oportunidadId of oportunidades) {
      await admin.from('cotizacion_lineas').delete().eq('pipeline_id', oportunidadId);
      await admin.from('pipeline').delete().eq('id', oportunidadId);
    }
    for (const clienteId of clientes) await admin.from('clientes').delete().eq('id', clienteId);
    if (usuarioId) {
      await admin.from('logs').delete().eq('usuario_id', usuarioId);
      await admin.auth.admin.deleteUser(usuarioId);
    }
  });
});
