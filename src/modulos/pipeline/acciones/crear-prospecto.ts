'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { generarFolioOp } from '@/modulos/pipeline/servicios/generar-folio-op';
import { obtenerClienteParaRfq } from '@/modulos/pipeline/servicios/obtener-cliente-para-rfq';
import { esquemaCrearProspecto } from '@/modulos/pipeline/validaciones/esquemas-prospecto';
import { mensajeErrorRfq } from '@/modulos/rfq/acciones/utilidades-acciones';
import {
  resolverContactoVigenteCliente,
  retirarContactoRecienCreado,
} from '@/modulos/rfq/servicios/contacto-vigente-cliente';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Inicia un RFQ recuperable en estado INCOMPLETE.
 *
 * El folio OP se genera SIEMPRE vía RPC atómica (nunca contando filas ni en
 * cliente). El folio RFQ lo asigna el trigger de alta. El prospecto queda
 * asignado al vendedor autenticado. Escribe con cliente admin: las columnas
 * controladas están protegidas de escritura directa por trigger/RLS; la
 * autorización ya se hizo arriba (`obtenerUsuarioServidor`) y `vendedor_id` se
 * fija al usuario actual.
 *
 * RFQ-02/03: admite `clienteId` para que la RFQ nazca ligada a un cliente del
 * catálogo, heredando sus condiciones de pago si la captura no fijó otras. Si
 * no se eligió contacto, se liga el contacto vigente del cliente.
 */
export async function crearProspectoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ id: string; folioOp: string }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaCrearProspecto.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  if (!(await can(usuario, 'rfq_crear'))) {
    return { exito: false, error: 'Sin permiso para crear RFQ' };
  }
  const datos = analisis.data;

  // RFQ-02/03: si la RFQ nace ligada a un cliente, se verifica BAJO RLS que el
  // usuario pueda verlo y se heredan sus condiciones de pago cuando la captura
  // no las fijó a mano (lo capturado por el vendedor siempre manda).
  let clienteId: string | null = null;
  let condicionesPago = datos.condicionesPago ?? null;
  if (datos.clienteId) {
    const servidor = await crearClienteSupabaseServidor();
    const clienteRfq = await obtenerClienteParaRfq(servidor, datos.clienteId);
    if (!clienteRfq) {
      return { exito: false, error: 'Cliente no válido' };
    }
    clienteId = clienteRfq.id;
    condicionesPago = condicionesPago ?? clienteRfq.condicionesPago;
  }

  // El contacto sí puede venir del formulario; el responsable siempre es el
  // usuario autenticado que crea el RFQ, nunca un id enviado por el navegador.
  if (datos.contactoId && !clienteId) {
    return { exito: false, error: 'Elige un cliente antes del contacto' };
  }

  const admin = crearClienteSupabaseAdmin();

  if (datos.contactoId && clienteId) {
    const { data: contacto } = await admin
      .from('contactos_cliente')
      .select('id, cliente_id, activo')
      .eq('id', datos.contactoId)
      .maybeSingle();
    if (!contacto || !contacto.activo || contacto.cliente_id !== clienteId) {
      return { exito: false, error: 'El contacto no pertenece al cliente' };
    }
  }

  // Ajuste cliente 2026-10-12: la próxima acción se captura unificada con canal
  // y seguimiento. Viaja completa (acción + fecha + responsable) o ausente.
  const tocaProximaAccion =
    datos.proximaAccionCodigo !== undefined
    || datos.fechaProximaAccion !== undefined
    || datos.responsableProximaAccionId !== undefined;
  let proximaAccionTexto: string | null = null;
  let fechaProximaAccion: string | null = null;
  if (tocaProximaAccion) {
    fechaProximaAccion = datos.fechaProximaAccion?.trim() || null;
    if (!datos.proximaAccionCodigo || !fechaProximaAccion || !datos.responsableProximaAccionId) {
      return {
        exito: false,
        error: 'Completa la próxima acción: acción, fecha y responsable de la acción',
      };
    }
    const { data: accion } = await admin
      .from('catalogo_proximas_acciones')
      .select('codigo, es_otro, activo')
      .eq('codigo', datos.proximaAccionCodigo)
      .maybeSingle();
    if (!accion || !accion.activo) {
      return { exito: false, error: 'La próxima acción seleccionada no está vigente' };
    }
    proximaAccionTexto = datos.proximaAccionTexto?.trim() || null;
    if (accion.es_otro && (!proximaAccionTexto || proximaAccionTexto.length < 3)) {
      return { exito: false, error: 'Describe la acción "Otro" de la próxima acción' };
    }
    // Se tolera "ayer" en UTC para no rechazar el "hoy" local del usuario.
    const pisoFecha = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (fechaProximaAccion < pisoFecha) {
      return { exito: false, error: 'La fecha de la próxima acción no puede estar en el pasado' };
    }
    const { data: responsableAccion } = await admin
      .from('usuarios')
      .select('id, activo')
      .eq('id', datos.responsableProximaAccionId)
      .maybeSingle();
    if (!responsableAccion || !responsableAccion.activo) {
      return { exito: false, error: 'El responsable de la próxima acción no está activo' };
    }
  }

  const correlationId = nuevoCorrelationId();
  const fechaRegistro = new Date().toISOString().slice(0, 10);

  let folioOp: string;
  try {
    folioOp = await generarFolioOp(admin);
  } catch {
    return { exito: false, error: 'No se pudo generar el folio' };
  }

  // Sin contacto elegido, el RFQ nace ligado al contacto vigente del cliente
  // (principal registrado o, si no tiene contactos, uno creado con sus datos o con
  // el nombre ya capturado). Se resuelve al final para no dejar un contacto creado
  // si falla una validación anterior; crearlo exige los mismos permisos que crear
  // un contacto a mano (rfq_editar + cliente_editar), no solo rfq_crear.
  let contactoId = datos.contactoId ?? null;
  let contactoAutomatico: string | null = null;
  let contactoCreado = false;
  if (clienteId && !contactoId) {
    const puedeCrear = (await can(usuario, 'rfq_editar')) && (await can(usuario, 'cliente_editar'));
    const resolucion = await resolverContactoVigenteCliente(admin, {
      clienteId,
      actorId: usuario.id,
      puedeCrear,
      capturado: {
        nombre: datos.nombreContacto,
        correo: datos.correo,
        telefono: datos.telefono,
      },
    });
    if (resolucion.estado === 'vinculable') {
      contactoId = resolucion.id;
      contactoAutomatico = resolucion.id;
      contactoCreado = resolucion.creado;
    }
  }

  const { data: fila, error } = await admin
    .from('pipeline')
    .insert({
      folio_op: folioOp,
      estado_rfq: 'INCOMPLETE',
      nombre_contacto: datos.nombreContacto,
      empresa: datos.empresa,
      // Correo opcional: cadena vacía se normaliza a null.
      correo: datos.correo ? datos.correo : null,
      telefono: datos.telefono ?? null,
      vendedor_id: usuario.id,
      cliente_id: clienteId,
      moneda: datos.moneda,
      condiciones_pago: condicionesPago,
      prioridad: datos.prioridad,
      iva_porcentaje: datos.ivaPorcentaje,
      etiquetas: datos.etiquetas,
      es_orden_interna: datos.esOrdenInterna,
      // DC-01: PO y horas estimadas salen del alta. Las columnas legacy se
      // conservan en null para no reintroducirlas mediante clientes antiguos.
      po_cliente: null,
      fecha_requerida: null,
      horas_estimadas: null,
      notas: null,
      // Los datos generales se capturan antes de los ítems. La fecha y el
      // responsable son autoritativos del servidor para evitar alteraciones.
      canal: datos.canal?.trim() || null,
      canal_detalle: datos.canalDetalle?.trim() ? datos.canalDetalle.trim() : null,
      fecha_solicitud: fechaRegistro,
      descripcion_general: datos.descripcionGeneral?.trim() || null,
      responsable_id: usuario.id,
      contacto_id: contactoId,
      // Ajuste cliente 2026-10-12: la próxima acción nace con el RFQ cuando se
      // capturó en el alta (unificada con canal y seguimiento).
      proxima_accion_codigo: tocaProximaAccion ? (datos.proximaAccionCodigo ?? null) : null,
      proxima_accion_texto: tocaProximaAccion ? proximaAccionTexto : null,
      fecha_proxima_accion: tocaProximaAccion ? fechaProximaAccion : null,
      responsable_proxima_accion_id: tocaProximaAccion
        ? (datos.responsableProximaAccionId ?? null)
        : null,
    })
    .select('id')
    .single();

  if (error || !fila) {
    if (contactoCreado && contactoAutomatico) {
      await retirarContactoRecienCreado(admin, contactoAutomatico);
    }
    const traducido = mensajeErrorRfq(error?.message ?? '');
    return {
      exito: false,
      error:
        traducido === 'No se pudo completar la operación'
          ? 'No se pudo crear el prospecto'
          : traducido,
    };
  }

  if (contactoCreado && clienteId && contactoAutomatico) {
    await registrarLog(
      usuario,
      'crear',
      'clientes',
      clienteId,
      { contactoId: contactoAutomatico, origen: 'rfq_alta_automatico', rfqId: fila.id },
      correlationId,
    );
  }
  await registrarLog(
    usuario,
    'crear',
    'pipeline',
    fila.id,
    {
      folioOp,
      clienteId,
      estadoRfq: 'INCOMPLETE',
      ...(contactoAutomatico ? { contactoAutomatico } : {}),
    },
    correlationId,
  );

  return { exito: true, datos: { id: fila.id, folioOp } };
}
