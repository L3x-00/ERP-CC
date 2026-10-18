'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorOrden,
  crearOrdenBasadaEnAnteriorServicio,
  type OrdenCreada,
} from '@/modulos/ordenes/servicios/ordenes-servicio';
import { esquemaCrearOrdenBasadaEnAnterior } from '@/modulos/ordenes/validaciones/ordenes';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog, nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

function mensajeCrearOrdenBasada(codigo: ErrorOrden['codigo']): string {
  switch (codigo) {
    case 'orden_origen_legacy_no_admitida':
      return 'Las órdenes legacy no pueden usarse como base todavía';
    case 'orden_origen_no_finalizada':
      return 'La orden de origen debe estar finalizada para crear una nueva basada en ella';
    case 'orden_sin_partidas':
      return 'La orden de origen no tiene partidas técnicas para copiar';
    case 'orden_inexistente':
      return 'La orden de origen ya no está disponible';
    case 'sin_permiso_crear_orden_basada':
      return 'Sin permiso para crear órdenes basadas en otra';
    default:
      return 'No se pudo crear la orden basada en la anterior';
  }
}

/** C8.6/O-03 B: crea una OP técnica nueva desde una OP finalizada no legacy. */
export async function crearOrdenBasadaEnAnteriorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<OrdenCreada>> {
  const correlationId = nuevoCorrelationId();
  const analisis = esquemaCrearOrdenBasadaEnAnterior.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'aprobar_ordenes'))) {
    return { exito: false, error: 'Sin permiso para crear órdenes basadas en otra' };
  }

  try {
    const orden = await crearOrdenBasadaEnAnteriorServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      actorId: usuario.id,
    });
    await registrarLog(usuario, 'crear_orden_basada_en_anterior', 'ordenes', orden.id, {
      ordenOrigenId: analisis.data.ordenOrigenId,
      folioNuevo: orden.folio,
    }, correlationId);
    return { exito: true, datos: orden };
  } catch (error) {
    const codigo = error instanceof ErrorOrden ? error.codigo : 'desconocido';
    console.error('[ORDENES] Error al crear una orden basada en anterior:', error);
    await registrarLog(usuario, 'crear_orden_basada_en_anterior_rechazada', 'ordenes',
      analisis.data.ordenOrigenId, { codigo }, correlationId);
    return { exito: false, error: mensajeCrearOrdenBasada(codigo) };
  }
}
