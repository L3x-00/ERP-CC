'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

import { registrarVersionRfq } from '../servicios/registrar-version-rfq';
import { esquemaDatosGeneralesRfq } from '../validaciones/esquemas-rfq';
import { mensajeErrorRfq } from './utilidades-acciones';

// CV-01/DC-05: la frontera de inmutabilidad es crear Rev A, no marcarlo listo.
const ESTADOS_EDITABLES = ['NEW', 'INCOMPLETE', 'WAITING_CUSTOMER', 'WAITING_TECHNICAL', 'READY_FOR_PROPOSAL'];

function coincideCanal(valor: string, codigo: string, nombre: string): boolean {
  return (
    valor.localeCompare(codigo, 'es', { sensitivity: 'base' }) === 0 ||
    valor.localeCompare(nombre, 'es', { sensitivity: 'base' }) === 0
  );
}

/**
 * Server Action: actualiza los datos generales y de seguimiento del RFQ con
 * compare-and-set sobre `actualizado_en`. Solo en estados donde el RFQ sigue
 * capturándose; para editar uno listo debe volver a Incompleto.
 */
export async function actualizarDatosRfqAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ actualizadoEn: string }>> {
  const resultado = esquemaDatosGeneralesRfq.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }
  if (!(await can(usuario, 'rfq_editar'))) {
    return { exito: false, error: 'Sin permiso para editar el RFQ' };
  }

  const datos = resultado.data;
  const admin = crearClienteSupabaseAdmin();

  const { data: rfq, error: errorRfq } = await admin
    .from('pipeline')
    .select(
      'id, estado_rfq, cliente_id, canal, actualizado_en, proxima_accion_codigo, proxima_accion_texto, fecha_proxima_accion',
    )
    .eq('id', datos.rfqId)
    .maybeSingle();
  if (errorRfq || !rfq) {
    return { exito: false, error: 'El RFQ no existe' };
  }
  if (!ESTADOS_EDITABLES.includes(rfq.estado_rfq)) {
    return {
      exito: false,
      error: 'El RFQ ya no admite cambios: quedó congelado al crear la Propuesta Rev A',
    };
  }
  if (rfq.actualizado_en !== datos.actualizadoEn) {
    return { exito: false, error: 'El RFQ cambió; recarga antes de reintentar' };
  }

  // Obs. cliente 2026-10-21: la edición directa del Resumen sustituye la acción
  // vigente solo con su resultado. Se compara contra la fila guardada, no contra
  // el navegador; mover fecha o responsable conserva la misma acción.
  const accionVigente = rfq.proxima_accion_codigo
    ? {
        codigo: rfq.proxima_accion_codigo,
        texto: rfq.proxima_accion_texto?.trim() || null,
        fecha: rfq.fecha_proxima_accion?.slice(0, 10) ?? null,
      }
    : null;
  const sustituyeAccion =
    accionVigente !== null &&
    ((datos.proximaAccionCodigo ?? null) !== accionVigente.codigo ||
      (datos.proximaAccionTexto?.trim() || null) !== accionVigente.texto);
  if (sustituyeAccion && !datos.resultadoProximaAccion) {
    return { exito: false, error: 'Indica cómo terminó la acción de seguimiento actual' };
  }

  // Validaciones de integridad de los vínculos elegidos.
  if (datos.contactoId) {
    const { data: contacto } = await admin
      .from('contactos_cliente')
      .select('id, cliente_id, activo')
      .eq('id', datos.contactoId)
      .maybeSingle();
    if (!contacto || !contacto.activo) {
      return { exito: false, error: 'El contacto no está vigente' };
    }
    if (rfq.cliente_id && contacto.cliente_id !== rfq.cliente_id) {
      return { exito: false, error: 'El contacto no pertenece al cliente del RFQ' };
    }
  }

  const responsables = [datos.responsableId, datos.responsableProximaAccionId].filter(
    (valor): valor is string => Boolean(valor),
  );
  if (responsables.length > 0) {
    const { data: usuariosActivos } = await admin
      .from('usuarios')
      .select('id')
      .in('id', responsables)
      .eq('activo', true);
    if ((usuariosActivos ?? []).length !== new Set(responsables).size) {
      return { exito: false, error: 'Uno de los responsables no está activo' };
    }
  }

  if (datos.proximaAccionCodigo) {
    const { data: accion } = await admin
      .from('catalogo_proximas_acciones')
      .select('codigo')
      .eq('codigo', datos.proximaAccionCodigo)
      .maybeSingle();
    if (!accion) {
      return { exito: false, error: 'La próxima acción no existe en el catálogo' };
    }
  }

  let canal = datos.canal ?? null;
  let canalDetalle = datos.canalDetalle ?? null;
  if (canal) {
    const { data: canales, error: errorCanales } = await admin
      .from('catalogo_canales')
      .select('codigo, nombre, es_otro, activo');
    if (errorCanales) {
      return { exito: false, error: 'No se pudo validar el canal seleccionado' };
    }

    const seleccionado = (canales ?? []).find((opcion) =>
      coincideCanal(canal!, opcion.codigo, opcion.nombre),
    );
    if (!seleccionado) {
      const esHistoricoSinCatalogar =
        rfq.canal !== null &&
        rfq.canal.localeCompare(canal, 'es', { sensitivity: 'base' }) === 0;
      if (!esHistoricoSinCatalogar) {
        return { exito: false, error: 'Selecciona un canal vigente del catálogo' };
      }
      canal = rfq.canal;
      canalDetalle = null;
    } else {
      const actual = rfq.canal
        ? (canales ?? []).find((opcion) => coincideCanal(rfq.canal!, opcion.codigo, opcion.nombre))
        : null;
      const conservaHistorico = actual?.codigo === seleccionado.codigo;
      if (!seleccionado.activo && !conservaHistorico) {
        return { exito: false, error: 'El canal seleccionado ya no está activo' };
      }
      if (seleccionado.es_otro && !canalDetalle?.trim()) {
        return { exito: false, error: 'Escribe el detalle del canal Otro' };
      }
      canal = seleccionado.codigo;
      canalDetalle = seleccionado.es_otro ? canalDetalle?.trim() ?? null : null;
    }
  } else {
    canalDetalle = null;
  }

  const { data: actualizado, error } = await admin
    .from('pipeline')
    .update({
      canal,
      canal_detalle: canalDetalle,
      fecha_solicitud: datos.fechaSolicitud ?? null,
      // «Finalizar captura» no la envía: sin el campo se conserva la guardada.
      ...(datos.fechaRequeridaCliente !== undefined
        ? { fecha_requerida: datos.fechaRequeridaCliente }
        : {}),
      // Igual que la fecha requerida: sin el campo se conserva; vacío lo limpia.
      ...(datos.plazoComercial !== undefined
        ? { plazo_comercial: datos.plazoComercial?.trim() || null }
        : {}),
      descripcion_general: datos.descripcionGeneral ?? null,
      contacto_id: datos.contactoId ?? null,
      responsable_id: datos.responsableId ?? null,
      proxima_accion_codigo: datos.proximaAccionCodigo ?? null,
      proxima_accion_texto: datos.proximaAccionTexto ?? null,
      fecha_proxima_accion: datos.fechaProximaAccion ?? null,
      responsable_proxima_accion_id: datos.responsableProximaAccionId ?? null,
    })
    .eq('id', datos.rfqId)
    .eq('actualizado_en', datos.actualizadoEn)
    .select('actualizado_en')
    .maybeSingle();

  if (error || !actualizado) {
    return { exito: false, error: mensajeErrorRfq(error?.message ?? 'rfq_desactualizado') };
  }

  const correlationId = nuevoCorrelationId();
  await registrarVersionRfq(admin, {
    rfqId: datos.rfqId,
    causa: 'CABECERA',
    actorId: usuario.id,
    correlationId,
  });
  // El resultado describe la acción anterior y queda en Actividad con una acción
  // propia por resultado; comparte correlación con el guardado del Resumen.
  if (sustituyeAccion && accionVigente && datos.resultadoProximaAccion) {
    await registrarLog(
      usuario,
      `seguimiento_${datos.resultadoProximaAccion}`,
      'pipeline',
      datos.rfqId,
      {
        accionAnterior: accionVigente.codigo,
        ...(accionVigente.fecha ? { fechaAnterior: accionVigente.fecha } : {}),
        ...(datos.proximaAccionCodigo ? { accionNueva: datos.proximaAccionCodigo } : {}),
        ...(datos.fechaProximaAccion ? { fechaNueva: datos.fechaProximaAccion } : {}),
      },
      correlationId,
    );
  }

  await registrarLog(
    usuario,
    'actualizar_datos_rfq',
    'pipeline',
    datos.rfqId,
    {
      campos: Object.keys(datos).filter(
        (clave) =>
          clave !== 'rfqId' && clave !== 'actualizadoEn' && clave !== 'resultadoProximaAccion',
      ),
    },
    correlationId,
  );

  return { exito: true, datos: { actualizadoEn: actualizado.actualizado_en } };
}
