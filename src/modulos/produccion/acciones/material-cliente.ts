'use server';

import { z } from 'zod';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  mensajeErrorSesion,
  obtenerMaterialClienteOrdenServicio,
  obtenerMaterialClienteRevisionServicio,
  registrarConsumoMaterialClienteServicio,
  reemplazarMaterialClienteItemServicio,
} from '@/modulos/produccion/servicios/indice';
import type {
  ConsumoMaterialClienteRegistrado,
  MaterialClienteItem,
  MaterialClientePartida,
} from '@/modulos/produccion/tipos/indice';
import {
  esquemaConsumoMaterialCliente,
  esquemaMaterialClienteItem,
} from '@/modulos/produccion/validaciones/indice';

import { obtenerActorProduccion, obtenerActorProduccionParaMutacion } from './utilidades-acciones';

const esquemaRevision = z.object({ revisionId: z.uuid() }).strict();
const esquemaOrden = z.object({ ordenId: z.uuid() }).strict();

/** C13.3: guarda el material del cliente declarado para un ítem de la propuesta. */
export async function reemplazarMaterialClienteAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ codigoItem: string; materiales: number }>> {
  const resultado = esquemaMaterialClienteItem.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'propuesta_editar_ruteo'))) {
    return { exito: false, error: 'Sin permiso para editar el ruteo de la propuesta' };
  }

  const correlationId = nuevoCorrelationId();
  try {
    const guardado = await reemplazarMaterialClienteItemServicio(crearClienteSupabaseAdmin(), {
      ...resultado.data,
      actorId: usuario.id,
    });
    await registrarLog(usuario, 'editar_material_cliente', 'propuestas', resultado.data.revisionId, {
      codigoItem: guardado.codigoItem,
      materiales: guardado.materiales,
    }, correlationId);
    return { exito: true, datos: guardado };
  } catch (error) {
    console.error('[PRODUCCION] Error al guardar material del cliente:', error);
    return { exito: false, error: 'No se pudo guardar el material del cliente' };
  }
}

/** C13.3: material del cliente declarado en la revisión. */
export async function obtenerMaterialClienteRevisionAccion(
  entrada: unknown,
): Promise<RespuestaAccion<MaterialClienteItem[]>> {
  const analisis = esquemaRevision.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos inválidos' };

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  const autorizado = (await can(usuario, 'propuesta_editar_ruteo'))
    || (await can(usuario, 'gestionar_produccion'));
  if (!autorizado) return { exito: false, error: 'Sin permiso para ver el material del cliente' };

  try {
    const datos = await obtenerMaterialClienteRevisionServicio(crearClienteSupabaseAdmin(), {
      revisionId: analisis.data.revisionId,
      actorId: usuario.id,
    });
    return { exito: true, datos };
  } catch (error) {
    console.error('[PRODUCCION] Error al consultar material del cliente:', error);
    return { exito: false, error: 'No se pudo cargar el material del cliente' };
  }
}

/** C13.3: el operador descuenta el material del cliente al cerrar su sesión. */
export async function registrarConsumoMaterialClienteAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ConsumoMaterialClienteRegistrado>> {
  const resultado = esquemaConsumoMaterialCliente.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const actor = await obtenerActorProduccionParaMutacion(
    'registrar_consumo_material_cliente',
    resultado.data.sesionId,
  );
  if (!actor) return { exito: false, error: 'No autorizado' };

  const correlationId = nuevoCorrelationId();
  try {
    const consumo = await registrarConsumoMaterialClienteServicio(crearClienteSupabaseAdmin(), {
      ...resultado.data,
      actorId: actor.id,
    });
    await registrarLog(actor, 'consumo_material_cliente', 'produccion', consumo.id, {
      sesionId: resultado.data.sesionId,
      materialId: consumo.materialId,
      cantidadUsada: consumo.cantidadUsada,
      cantidadScrap: consumo.cantidadScrap,
      saldo: consumo.saldo,
    }, correlationId);
    return { exito: true, datos: consumo };
  } catch (error) {
    console.error('[PRODUCCION] Error al consumir material del cliente:', error);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}

/** C13.3: saldo del material del cliente por partida de la orden. */
export async function obtenerMaterialClienteOrdenAccion(
  entrada: unknown,
): Promise<RespuestaAccion<MaterialClientePartida[]>> {
  const analisis = esquemaOrden.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Datos inválidos' };

  const actor = await obtenerActorProduccion();
  if (!actor) return { exito: false, error: 'No autorizado' };

  return consultarMaterialCliente(analisis.data.ordenId, actor.id);
}

async function consultarMaterialCliente(
  ordenId: string,
  actorId: string,
): Promise<RespuestaAccion<MaterialClientePartida[]>> {
  try {
    const datos = await obtenerMaterialClienteOrdenServicio(crearClienteSupabaseAdmin(), {
      ordenId,
      actorId,
    });
    return { exito: true, datos };
  } catch (error) {
    console.error('[PRODUCCION] Error al consultar saldo del cliente:', error);
    return { exito: false, error: 'No se pudo cargar el material del cliente' };
  }
}
