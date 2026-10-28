'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  obtenerConsumosMaterialOrdenServicio,
  obtenerDatosTableroProduccionServicio,
  type AreaCatalogoProduccion,
  type ConsumoMaterialOrden,
  type OrdenTableroProduccion,
} from '@/modulos/produccion/servicios/indice';
import type { RecursoPlaneacion } from '@/modulos/planeacion/tipos/indice';
import { esquemaConsultarOrdenConcluida } from '@/modulos/produccion/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

/** Ficha de solo lectura para una orden que ya terminó su trabajo de piso. */
export interface DetalleOrdenConcluida {
  orden: OrdenTableroProduccion;
  areas: AreaCatalogoProduccion[];
  responsables: Record<string, string>;
  recursos: RecursoPlaneacion[];
  /** La entrega real la revalida `generarNotaEntregaAccion`; esto solo gobierna la UI. */
  puedeEntregar: boolean;
}

/**
 * Producción y Planeación comparten la misma ficha. Órdenes exige
 * `gestionar_produccion` y Planeación `ver_planeacion` o `gestionar_planeacion`;
 * esta lectura puntual acepta cualquiera de los tres y no muta nada.
 */
async function autorizarLectura() {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false as const, error: 'No autorizado' };
  const permitido =
    (await can(usuario, 'gestionar_produccion'))
    || (await can(usuario, 'ver_planeacion'))
    || (await can(usuario, 'gestionar_planeacion'));
  if (!permitido) {
    return { exito: false as const, error: 'Sin permiso para consultar la orden' };
  }
  return { exito: true as const, usuario };
}

export async function obtenerDetalleOrdenConcluidaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<DetalleOrdenConcluida>> {
  const analisis = esquemaConsultarOrdenConcluida.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const autorizacion = await autorizarLectura();
  if (!autorizacion.exito) return autorizacion;

  try {
    const cliente = await crearClienteSupabaseServidor();
    const admin = crearClienteSupabaseAdmin();
    const datos = await obtenerDatosTableroProduccionServicio(
      cliente,
      { ordenId: analisis.data.ordenId },
      admin,
    );
    const orden = datos.ordenes.find((actual) => actual.id === analisis.data.ordenId);
    if (!orden) {
      return { exito: false, error: 'La orden ya no está disponible' };
    }
    return {
      exito: true,
      datos: {
        orden,
        areas: datos.areas ?? [],
        responsables: datos.responsables ?? {},
        recursos: datos.recursos,
        puedeEntregar: await can(autorizacion.usuario, 'gestionar_produccion'),
      },
    };
  } catch (error) {
    console.error('[PRODUCCION] Error al consultar orden concluida:', error);
    return { exito: false, error: 'No se pudo consultar la orden concluida' };
  }
}

export async function obtenerConsumosMaterialOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ConsumoMaterialOrden[]>> {
  const analisis = esquemaConsultarOrdenConcluida.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const autorizacion = await autorizarLectura();
  if (!autorizacion.exito) return autorizacion;

  try {
    const cliente = await crearClienteSupabaseServidor();
    return {
      exito: true,
      datos: await obtenerConsumosMaterialOrdenServicio(
        cliente,
        crearClienteSupabaseAdmin(),
        analisis.data.ordenId,
      ),
    };
  } catch (error) {
    console.error('[PRODUCCION] Error al consultar material utilizado:', error);
    return { exito: false, error: 'No se pudo consultar el material utilizado' };
  }
}
