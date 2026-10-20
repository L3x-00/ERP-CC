import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { esUrlSupabaseLoopback, prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// Solo la sesión y la auditoría se sustituyen: el cliente admin es el REAL del
// stack local, de modo que las Server Actions y las RPC corren contra Postgres.
const contexto = vi.hoisted(() => ({
  admin: null as unknown,
  usuario: null as unknown,
  logs: [] as unknown[][],
}));
vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: async () => contexto.usuario,
}));
vi.mock('@/nucleo/supabase/admin', () => ({ crearClienteSupabaseAdmin: () => contexto.admin }));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: async (...args: unknown[]) => {
    contexto.logs.push(args);
  },
  // `rfq_versiones.correlation_id` es uuid: el identificador de correlación también.
  nuevoCorrelationId: () => globalThis.crypto.randomUUID(),
}));

import { validarRfqListoAccion } from '@/modulos/rfq/acciones/validar-rfq-listo';
import { vincularContactoVigenteRfqAccion } from '@/modulos/rfq/acciones/vincular-contacto-rfq';
import { IndicadorEstadoRfq } from '@/modulos/rfq/componentes/indicador-estado-rfq';
import type { ValidacionRfqListo } from '@/modulos/rfq/tipos/indice';
import { capturaRfqListaParaValidar } from '@/modulos/rfq/utilidades/estados';

// Esta suite INSERTA y BORRA clientes, contactos y RFQ: solo corre en loopback.
const { describir, entorno, crearClienteServicio } = prepararSuiteSupabaseLocal(
  'vinculación automática del contacto del RFQ',
);

const PERMISOS_COMPLETOS = ['rfq_vista', 'rfq_editar', 'cliente_editar'];
const SIN_CREAR_CONTACTOS = ['rfq_vista', 'rfq_editar'];

describir('vinculación automática del contacto en un RFQ existente (integración)', () => {
  let admin: SupabaseClient<Database>;
  let usuarioId = '';
  const rfqs: string[] = [];
  const clientes: string[] = [];
  const procesos: string[] = [];

  function actuarCon(permisos: string[]): void {
    contexto.usuario = {
      id: usuarioId,
      email: 'qa-vinculo@orca.local',
      nombreCompleto: 'Vendedor QA vínculo',
      rol: 'vendedor',
      activo: true,
      permisos,
    };
  }

  beforeAll(async () => {
    admin = crearClienteServicio();
    contexto.admin = admin;
    const alta = await admin.auth.admin.createUser({
      email: `qa-vinculo-${randomUUID()}@orca.local`,
      password: `Qa!${randomUUID()}A9`,
      email_confirm: true,
    });
    if (alta.error || !alta.data.user) throw new Error(alta.error?.message ?? 'Sin usuario QA');
    usuarioId = alta.data.user.id;
    // El RPC de versiones revalida `rfq_editar` contra el rol real de la base.
    const perfil = await admin
      .from('usuarios')
      .update({ rol: 'vendedor', activo: true })
      .eq('id', usuarioId);
    if (perfil.error) throw perfil.error;
  });

  beforeEach(() => {
    contexto.logs.length = 0;
    actuarCon(PERMISOS_COMPLETOS);
  });

  afterAll(async () => {
    if (!admin) return;
    // RFQ primero: su borrado arrastra ítems, operaciones, eventos y versiones
    // (el único borrado de `rfq_versiones` que el trigger de inmutabilidad permite).
    for (const rfqId of rfqs) await admin.from('pipeline').delete().eq('id', rfqId);
    // Borrar el cliente arrastra sus contactos (incluidos los creados por la acción).
    for (const clienteId of clientes) await admin.from('clientes').delete().eq('id', clienteId);
    // Los catálogos no se borran: se desactivan y se retira su historial de versiones.
    for (const procesoId of procesos) {
      await admin.from('catalogo_procesos').update({ activo: false }).eq('id', procesoId);
      await admin
        .from('versiones_catalogo')
        .delete()
        .eq('entidad', 'catalogo_procesos')
        .eq('entidad_id', procesoId);
    }
    if (usuarioId) {
      await admin.from('logs').delete().eq('usuario_id', usuarioId);
      await admin.auth.admin.deleteUser(usuarioId);
    }
  });

  // --- Fixtures -----------------------------------------------------------------

  async function crearCliente(
    datos: { contacto?: string; correo?: string; telefono?: string } = {},
  ): Promise<string> {
    const nombre = `QA-VINCULO-${randomUUID()}`;
    const respuesta = await admin
      .from('clientes')
      .insert({
        razon_social: nombre,
        nombre_comercial: nombre,
        estado: 'activo',
        contacto: datos.contacto ?? null,
        correo: datos.correo ?? null,
        telefono: datos.telefono ?? null,
      })
      .select('id')
      .single();
    if (respuesta.error || !respuesta.data) throw new Error(respuesta.error?.message ?? 'Sin cliente');
    clientes.push(respuesta.data.id);
    return respuesta.data.id;
  }

  async function crearContacto(
    clienteId: string,
    datos: { nombre: string; esPrincipal: boolean },
  ): Promise<string> {
    const respuesta = await admin
      .from('contactos_cliente')
      .insert({
        cliente_id: clienteId,
        nombre: datos.nombre,
        correo: `${randomUUID().slice(0, 8)}@cliente.mx`,
        es_principal: datos.esPrincipal,
        activo: true,
      })
      .select('id')
      .single();
    if (respuesta.error || !respuesta.data) throw new Error(respuesta.error?.message ?? 'Sin contacto');
    return respuesta.data.id;
  }

  /** RFQ con la cabecera general completa; el seguimiento solo si se pide. */
  async function crearRfq(opciones: {
    clienteId: string | null;
    contactoId?: string;
    convertido?: boolean;
    nombreContacto?: string;
    telefono?: string;
    conSeguimiento?: boolean;
  }): Promise<string> {
    const sufijo = randomUUID().slice(0, 8).toUpperCase();
    const hoy = new Date().toISOString().slice(0, 10);
    const enSiete = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const respuesta = await admin
      .from('pipeline')
      .insert({
        folio_op: `OP-QAVC-${sufijo}`,
        // Mismo par que crean el alta (INCOMPLETE) y la aprobación (CONVERTED).
        ...(opciones.convertido
          ? { etapa: 'negociacion', estado_rfq: 'CONVERTED' }
          : { estado_rfq: 'INCOMPLETE' }),
        nombre_contacto: opciones.nombreContacto ?? 'Luis Mora',
        telefono: opciones.telefono ?? null,
        empresa: `QA Vínculo ${sufijo}`,
        vendedor_id: usuarioId,
        cliente_id: opciones.clienteId,
        contacto_id: opciones.contactoId ?? null,
        moneda: 'MXN',
        iva_porcentaje: 16,
        descripcion_general: `Solicitud QA vínculo ${sufijo}`,
        canal: 'CORREO',
        fecha_solicitud: hoy,
        responsable_id: usuarioId,
        ...(opciones.conSeguimiento
          ? {
              proxima_accion_codigo: 'FOLLOW_UP',
              fecha_proxima_accion: enSiete,
              responsable_proxima_accion_id: usuarioId,
            }
          : {}),
      })
      .select('id')
      .single();
    if (respuesta.error || !respuesta.data) throw new Error(respuesta.error?.message ?? 'Sin RFQ');
    rfqs.push(respuesta.data.id);
    return respuesta.data.id;
  }

  /** Un ítem activo completo con una operación que no exige archivo técnico. */
  async function agregarItemCompleto(rfqId: string): Promise<void> {
    const sufijo = randomUUID().slice(0, 8).toUpperCase();
    const material = await admin
      .from('catalogo_materiales')
      .select('id')
      .eq('activo', true)
      .order('orden')
      .limit(1)
      .single();
    if (material.error || !material.data) throw new Error('Sin material activo en el stack local');
    const espesor = await admin
      .from('catalogo_espesores')
      .select('id')
      .eq('material_id', material.data.id)
      .eq('activo', true)
      .limit(1)
      .maybeSingle();
    // Todos los procesos sembrados exigen archivo técnico: el de la prueba no.
    const proceso = await admin
      .from('catalogo_procesos')
      .insert({
        codigo: `QAVC_${sufijo}`,
        nombre: `Proceso QA vínculo ${sufijo}`,
        prefijo_corrida: 'QVC',
        requiere_archivo_tecnico: false,
        activo: true,
      })
      .select('id')
      .single();
    if (proceso.error || !proceso.data) throw new Error(proceso.error?.message ?? 'Sin proceso');
    procesos.push(proceso.data.id);
    const item = await admin
      .from('rfq_items')
      .insert({
        rfq_id: rfqId,
        numero: 1,
        codigo: 'IT01',
        descripcion: `Pieza QA vínculo ${sufijo}`,
        cantidad: 4,
        material_id: material.data.id,
        espesor_id: espesor.data?.id ?? null,
      })
      .select('id')
      .single();
    if (item.error || !item.data) throw new Error(item.error?.message ?? 'Sin ítem');
    const operacion = await admin
      .from('rfq_item_operaciones')
      .insert({ rfq_item_id: item.data.id, proceso_id: proceso.data.id, orden: 0 });
    if (operacion.error) throw new Error(operacion.error.message);
  }

  // --- Lecturas ------------------------------------------------------------------

  async function validar(rfqId: string): Promise<ValidacionRfqListo> {
    const respuesta = await validarRfqListoAccion({ rfqId });
    if (!respuesta.exito || !respuesta.datos) throw new Error('La validación del RFQ falló');
    return respuesta.datos;
  }

  async function leerRfq(rfqId: string): Promise<{ contacto_id: string | null; estado_rfq: string }> {
    const respuesta = await admin
      .from('pipeline')
      .select('contacto_id, estado_rfq')
      .eq('id', rfqId)
      .single();
    if (respuesta.error || !respuesta.data) throw new Error('No se leyó el RFQ');
    return respuesta.data;
  }

  async function leerVersiones(rfqId: string) {
    const respuesta = await admin
      .from('rfq_versiones')
      .select('numero, causa, actor_id, snapshot_cabecera')
      .eq('rfq_id', rfqId)
      .order('numero');
    if (respuesta.error) throw respuesta.error;
    return respuesta.data ?? [];
  }

  async function leerContactos(clienteId: string) {
    const respuesta = await admin
      .from('contactos_cliente')
      .select('id, nombre, correo, telefono, es_principal, activo, creado_por')
      .eq('cliente_id', clienteId);
    if (respuesta.error) throw respuesta.error;
    return respuesta.data ?? [];
  }

  function logsDe(accion: string, entidad?: string): unknown[][] {
    return contexto.logs.filter(
      (registro) => registro[1] === accion && (entidad === undefined || registro[2] === entidad),
    );
  }

  function indicador(estado: 'INCOMPLETE', validacion: ValidacionRfqListo): string {
    return renderToStaticMarkup(createElement(IndicadorEstadoRfq, { estadoRfq: estado, validacion }));
  }

  // --- Pruebas -------------------------------------------------------------------

  it('opera solo contra el Supabase local (guardia de loopback)', () => {
    expect(esUrlSupabaseLoopback(entorno().url)).toBe(true);
  });

  it('contacto existente/principal: al abrir liga el principal registrado y lo persiste con auditoría', async () => {
    const clienteId = await crearCliente();
    await crearContacto(clienteId, { nombre: 'Secundario QA', esPrincipal: false });
    const principalId = await crearContacto(clienteId, { nombre: 'Principal QA', esPrincipal: true });
    const rfqId = await crearRfq({ clienteId });

    // Antes: el faltante de contacto sigue visible.
    expect((await validar(rfqId)).secciones.cliente).toEqual(['contacto vigente del cliente']);

    const respuesta = await vincularContactoVigenteRfqAccion({ rfqId });

    expect(respuesta).toEqual({ exito: true, datos: { vinculado: true, contactoId: principalId } });
    // Persistido en la base, no solo devuelto.
    expect((await leerRfq(rfqId)).contacto_id).toBe(principalId);
    expect((await validar(rfqId)).secciones.cliente).toEqual([]);
    // Ligar uno registrado no crea contactos.
    expect(await leerContactos(clienteId)).toHaveLength(2);
    // Una versión de cabecera, con el actor y ya con el contacto ligado.
    const versiones = await leerVersiones(rfqId);
    expect(versiones).toHaveLength(1);
    expect(versiones[0]).toMatchObject({ causa: 'CABECERA', actor_id: usuarioId });
    expect((versiones[0]?.snapshot_cabecera as Record<string, unknown>).contacto_id).toBe(principalId);
    // Auditoría: el vínculo, y ninguna creación de contacto.
    expect(logsDe('vincular_contacto_rfq', 'pipeline')).toHaveLength(1);
    expect(logsDe('vincular_contacto_rfq')[0]?.[4]).toMatchObject({
      clienteId,
      contactoId: principalId,
      origen: 'registrado',
    });
    expect(logsDe('crear', 'clientes')).toHaveLength(0);
  });

  it('es idempotente: una segunda apertura no escribe ni versiona otra vez', async () => {
    const clienteId = await crearCliente();
    await crearContacto(clienteId, { nombre: 'Principal QA', esPrincipal: true });
    const rfqId = await crearRfq({ clienteId });

    await vincularContactoVigenteRfqAccion({ rfqId });
    const segunda = await vincularContactoVigenteRfqAccion({ rfqId });

    expect(segunda).toEqual({
      exito: true,
      datos: { vinculado: false, motivo: 'ya_tiene_contacto' },
    });
    expect(await leerVersiones(rfqId)).toHaveLength(1);
    expect(logsDe('vincular_contacto_rfq')).toHaveLength(1);
  });

  it('conserva la selección existente: no pisa el contacto ya elegido aunque haya otro principal', async () => {
    const clienteId = await crearCliente();
    await crearContacto(clienteId, { nombre: 'Principal QA', esPrincipal: true });
    const elegidoId = await crearContacto(clienteId, { nombre: 'Elegido QA', esPrincipal: false });
    const rfqId = await crearRfq({ clienteId, contactoId: elegidoId });

    const respuesta = await vincularContactoVigenteRfqAccion({ rfqId });

    expect(respuesta).toEqual({
      exito: true,
      datos: { vinculado: false, motivo: 'ya_tiene_contacto' },
    });
    expect((await leerRfq(rfqId)).contacto_id).toBe(elegidoId);
    expect(await leerVersiones(rfqId)).toHaveLength(0);
    expect(contexto.logs).toHaveLength(0);
  });

  it('principal del cliente: sin contactos registrados crea uno con sus datos propios y lo liga', async () => {
    const clienteId = await crearCliente({
      contacto: 'Ana Pérez QA',
      correo: 'ana.qa@cliente.mx',
      telefono: '664 000 1111',
    });
    const rfqId = await crearRfq({ clienteId });

    const respuesta = await vincularContactoVigenteRfqAccion({ rfqId });

    expect(respuesta.exito).toBe(true);
    const contactos = await leerContactos(clienteId);
    expect(contactos).toHaveLength(1);
    expect(contactos[0]).toMatchObject({
      nombre: 'Ana Pérez QA',
      correo: 'ana.qa@cliente.mx',
      telefono: '664 000 1111',
      es_principal: false,
      activo: true,
      creado_por: usuarioId,
    });
    expect(respuesta).toEqual({
      exito: true,
      datos: { vinculado: true, contactoId: contactos[0]?.id },
    });
    expect((await leerRfq(rfqId)).contacto_id).toBe(contactos[0]?.id);
    expect((await validar(rfqId)).secciones.cliente).toEqual([]);
    // Auditoría de la creación sobre el cliente y del vínculo con su origen.
    expect(logsDe('crear', 'clientes')[0]?.[4]).toMatchObject({
      contactoId: contactos[0]?.id,
      origen: 'rfq_vinculo_automatico',
      rfqId,
    });
    expect(logsDe('vincular_contacto_rfq')[0]?.[4]).toMatchObject({ origen: 'creado_desde_datos' });
  });

  it('cliente solo con teléfono: reutiliza el nombre ya capturado en el RFQ sin inventar nada', async () => {
    const clienteId = await crearCliente({ telefono: '664 000 2222' });
    const rfqId = await crearRfq({ clienteId, nombreContacto: 'Luis Mora' });

    const respuesta = await vincularContactoVigenteRfqAccion({ rfqId });

    expect(respuesta.exito).toBe(true);
    const contactos = await leerContactos(clienteId);
    expect(contactos).toHaveLength(1);
    expect(contactos[0]).toMatchObject({
      nombre: 'Luis Mora',
      correo: null,
      telefono: '664 000 2222',
    });
    expect((await leerRfq(rfqId)).contacto_id).toBe(contactos[0]?.id);
  });

  it('sin permiso para crear contactos: no escribe en contactos_cliente ni liga nada', async () => {
    actuarCon(SIN_CREAR_CONTACTOS);
    const clienteId = await crearCliente({ contacto: 'Ana Pérez QA', telefono: '664 000 3333' });
    const rfqId = await crearRfq({ clienteId });

    const respuesta = await vincularContactoVigenteRfqAccion({ rfqId });

    expect(respuesta).toEqual({
      exito: true,
      datos: { vinculado: false, motivo: 'sin_permiso_crear_contacto' },
    });
    expect(await leerContactos(clienteId)).toHaveLength(0);
    expect((await leerRfq(rfqId)).contacto_id).toBeNull();
    expect(await leerVersiones(rfqId)).toHaveLength(0);
    expect(contexto.logs).toHaveLength(0);
    // La falta sigue señalada.
    expect((await validar(rfqId)).secciones.cliente).toEqual(['contacto vigente del cliente']);
  });

  it('sin permiso para crear, igualmente liga un contacto que ya existe', async () => {
    actuarCon(SIN_CREAR_CONTACTOS);
    const clienteId = await crearCliente();
    const principalId = await crearContacto(clienteId, { nombre: 'Principal QA', esPrincipal: true });
    const rfqId = await crearRfq({ clienteId });

    const respuesta = await vincularContactoVigenteRfqAccion({ rfqId });

    expect(respuesta).toEqual({ exito: true, datos: { vinculado: true, contactoId: principalId } });
    expect((await leerRfq(rfqId)).contacto_id).toBe(principalId);
  });

  it('sin permiso rfq_editar la acción se rechaza y no toca la base', async () => {
    actuarCon(['rfq_vista']);
    const clienteId = await crearCliente();
    await crearContacto(clienteId, { nombre: 'Principal QA', esPrincipal: true });
    const rfqId = await crearRfq({ clienteId });

    const respuesta = await vincularContactoVigenteRfqAccion({ rfqId });

    expect(respuesta).toEqual({ exito: false, error: 'Sin permiso para editar el RFQ' });
    expect((await leerRfq(rfqId)).contacto_id).toBeNull();
  });

  it('sin datos: ni el cliente ni el RFQ aportan un nombre válido, no se inventa contacto', async () => {
    const clienteId = await crearCliente({ telefono: '664 000 4444' });
    const rfqId = await crearRfq({ clienteId, nombreContacto: '12' });

    const respuesta = await vincularContactoVigenteRfqAccion({ rfqId });

    expect(respuesta).toEqual({ exito: true, datos: { vinculado: false, motivo: 'sin_datos' } });
    expect(await leerContactos(clienteId)).toHaveLength(0);
    expect((await leerRfq(rfqId)).contacto_id).toBeNull();
  });

  it('un RFQ sin cliente o ya convertido (terminal) no se modifica', async () => {
    const sinCliente = await crearRfq({ clienteId: null });
    expect(await vincularContactoVigenteRfqAccion({ rfqId: sinCliente })).toEqual({
      exito: true,
      datos: { vinculado: false, motivo: 'sin_cliente' },
    });

    const clienteId = await crearCliente();
    await crearContacto(clienteId, { nombre: 'Principal QA', esPrincipal: true });
    const convertido = await crearRfq({ clienteId, convertido: true });
    expect(await vincularContactoVigenteRfqAccion({ rfqId: convertido })).toEqual({
      exito: true,
      datos: { vinculado: false, motivo: 'estado_no_editable' },
    });
    expect((await leerRfq(convertido)).contacto_id).toBeNull();
    expect((await leerRfq(convertido)).estado_rfq).toBe('CONVERTED');
    expect(await leerVersiones(convertido)).toHaveLength(0);
  });

  it('concurrencia con contacto registrado: una sola apertura gana y nada se duplica', async () => {
    const clienteId = await crearCliente();
    const principalId = await crearContacto(clienteId, { nombre: 'Principal QA', esPrincipal: true });
    const rfqId = await crearRfq({ clienteId });

    const respuestas = await Promise.all([
      vincularContactoVigenteRfqAccion({ rfqId }),
      vincularContactoVigenteRfqAccion({ rfqId }),
    ]);

    const ganadoras = respuestas.filter((r) => r.exito && r.datos?.vinculado === true);
    expect(ganadoras).toHaveLength(1);
    for (const r of respuestas.filter((x) => !ganadoras.includes(x))) {
      expect(r.exito && r.datos?.vinculado === false ? r.datos.motivo : null).toMatch(
        /^(concurrencia|ya_tiene_contacto)$/,
      );
    }
    expect((await leerRfq(rfqId)).contacto_id).toBe(principalId);
    expect(await leerContactos(clienteId)).toHaveLength(1);
    expect(await leerVersiones(rfqId)).toHaveLength(1);
    expect(logsDe('vincular_contacto_rfq')).toHaveLength(1);
  });

  it('concurrencia creando el contacto: queda exactamente uno, ligado, sin huérfanos', async () => {
    const clienteId = await crearCliente({ contacto: 'Ana Pérez QA', telefono: '664 000 5555' });
    const rfqId = await crearRfq({ clienteId });

    const respuestas = await Promise.all([
      vincularContactoVigenteRfqAccion({ rfqId }),
      vincularContactoVigenteRfqAccion({ rfqId }),
    ]);

    expect(respuestas.filter((r) => r.exito && r.datos?.vinculado === true)).toHaveLength(1);
    const contactos = await leerContactos(clienteId);
    expect(contactos).toHaveLength(1);
    expect((await leerRfq(rfqId)).contacto_id).toBe(contactos[0]?.id);
    expect(await leerVersiones(rfqId)).toHaveLength(1);
  });

  it('un RFQ incompleto sigue señalando sus faltantes y «Incompleto» tras ligar el contacto', async () => {
    const clienteId = await crearCliente();
    await crearContacto(clienteId, { nombre: 'Principal QA', esPrincipal: true });
    const rfqId = await crearRfq({ clienteId });

    await vincularContactoVigenteRfqAccion({ rfqId });
    const validacion = await validar(rfqId);

    // El contacto ya no falta, pero sí los ítems y el seguimiento.
    expect(validacion.listo).toBe(false);
    expect(validacion.secciones.cliente).toEqual([]);
    expect(validacion.secciones.general).toEqual([]);
    expect(validacion.secciones.items).toContain('al menos un ítem activo');
    expect(validacion.secciones.seguimiento).toContain('próxima acción');
    expect(capturaRfqListaParaValidar('INCOMPLETE', validacion)).toBe(false);

    const marca = indicador('INCOMPLETE', validacion);
    expect(marca).toContain('data-captura="incompleta"');
    expect(marca).toContain('Incompleto');
    expect(marca).not.toContain('Listo para validar');
    expect((await leerRfq(rfqId)).estado_rfq).toBe('INCOMPLETE');
  });

  it('una captura completa muestra «Listo para validar» solo tras ligar el contacto, sin cambiar el estado', async () => {
    const clienteId = await crearCliente();
    await crearContacto(clienteId, { nombre: 'Principal QA', esPrincipal: true });
    const rfqId = await crearRfq({ clienteId, conSeguimiento: true });
    await agregarItemCompleto(rfqId);

    // Lo único que falta es el contacto: el indicador no puede ser verde todavía.
    const antes = await validar(rfqId);
    expect(antes.listo).toBe(false);
    expect(antes.secciones.cliente).toEqual(['contacto vigente del cliente']);
    expect(antes.secciones.items).toEqual([]);
    expect(antes.secciones.archivos).toEqual([]);
    expect(antes.secciones.seguimiento).toEqual([]);
    expect(capturaRfqListaParaValidar('INCOMPLETE', antes)).toBe(false);
    expect(indicador('INCOMPLETE', antes)).toContain('data-captura="incompleta"');

    await vincularContactoVigenteRfqAccion({ rfqId });

    const despues = await validar(rfqId);
    expect(despues.listo).toBe(true);
    expect(capturaRfqListaParaValidar('INCOMPLETE', despues)).toBe(true);
    const marca = indicador('INCOMPLETE', despues);
    expect(marca).toContain('data-captura="lista"');
    expect(marca).toContain('Listo para validar');
    expect(marca).toContain('bg-exito-suave');
    expect(marca).not.toContain('Listo para propuesta');
    // La indicación no es el estado de negocio: el RFQ sigue Incompleto en la base.
    const rfq = await leerRfq(rfqId);
    expect(rfq.estado_rfq).toBe('INCOMPLETE');
  });
});
