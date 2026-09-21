'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { esquemaDatosOportunidad } from '@/modulos/pipeline/validaciones/esquemas-prospecto';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Actualiza los datos de captura de la solicitud comercial — RFQ-01: orden de
 * compra del cliente, fecha requerida, horas estimadas y notas. Solo mientras
 * la oportunidad está abierta (no ganada/perdida), para no reescribir el
 * histórico de una oportunidad cerrada. Las cadenas vacías se guardan como null.
 * Escribe con cliente admin tras verificar dueño/admin/`ver_pipeline_equipo`.
 */
export async function actualizarDatosOportunidadAccion(
  entrada: unknown,
): Promise<RespuestaAccion> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaDatosOportunidad.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { id, poCliente, fechaRequerida, horasEstimadas, notas, fechaSeguimiento, fechaVencimientoCotizacion, proximoPaso } =
    analisis.data;

  const servidor = await crearClienteSupabaseServidor();
  const cargada = await obtenerOportunidadPorId(servidor, id);
  if (!cargada) {
    return { exito: false, error: 'No encontrada' };
  }

  if (
    cargada.oportunidad.vendedorId !== usuario.id &&
    usuario.rol !== 'admin' &&
    !(await can(usuario, 'ver_pipeline_equipo'))
  ) {
    return { exito: false, error: 'No encontrada' };
  }

  if (cargada.oportunidad.etapa === 'ganada' || cargada.oportunidad.etapa === 'perdida') {
    return { exito: false, error: 'Los datos solo se editan con la oportunidad abierta' };
  }

  const admin = crearClienteSupabaseAdmin();
  const { error } = await admin
    .from('pipeline')
    .update({
      po_cliente: poCliente.trim() ? poCliente.trim() : null,
      fecha_requerida: fechaRequerida ? fechaRequerida : null,
      horas_estimadas: horasEstimadas,
      notas: notas.trim() ? notas.trim() : null,
      // RFQ-08: fechas comerciales editables (vacío → null).
      fecha_seguimiento: fechaSeguimiento ? fechaSeguimiento : null,
      fecha_vencimiento_cotizacion: fechaVencimientoCotizacion
        ? fechaVencimientoCotizacion
        : null,
      // OBS-03: siguiente acción concreta (obligatoria si hay fecha; Zod lo exige).
      proximo_paso: proximoPaso && proximoPaso.trim() ? proximoPaso.trim() : null,
    })
    .eq('id', id);
  if (error) {
    return { exito: false, error: 'No se pudieron actualizar los datos de la solicitud' };
  }

  await registrarLog(usuario, 'actualizar_datos_oportunidad', 'pipeline', id, {
    poCliente: poCliente.trim() || null,
    fechaRequerida: fechaRequerida || null,
    horasEstimadas,
    fechaSeguimiento: fechaSeguimiento || null,
    fechaVencimientoCotizacion: fechaVencimientoCotizacion || null,
    proximoPaso: proximoPaso?.trim() || null,
  });

  return { exito: true };
}
