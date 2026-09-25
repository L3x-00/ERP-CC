'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorCobranza,
  consolidarArFaltantesServicio,
  mensajeErrorCobranza,
  previsualizarConsolidacionServicio,
  type OrdenConsolidable,
} from '@/modulos/cobranza/servicios/cobranza-servicio';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** CFG-12: vista previa; no escribe nada. */
export async function previsualizarConsolidacionAccion(): Promise<RespuestaAccion<OrdenConsolidable[]>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_pagos'))) return { exito: false, error: 'Sin permiso para consolidar cuentas' };
  try {
    const filas = await previsualizarConsolidacionServicio(crearClienteSupabaseAdmin());
    return { exito: true, datos: filas };
  } catch (error) {
    console.error('[COBRANZA] Error en vista previa de consolidación:', error);
    return { exito: false, error: 'No se pudo generar la vista previa' };
  }
}

const esquemaConsolidar = z.object({
  ordenIds: z.array(z.uuid('Orden inválida')).min(1, 'Selecciona al menos una orden').max(500),
}).strict();

/** CFG-12: crea solo las AR faltantes confirmadas; idempotente y auditado. */
export async function consolidarArFaltantesAccion(entrada: unknown): Promise<
  RespuestaAccion<{ creadas: number; omitidas: number; detalle: { ordenId: string; creada: boolean; motivo: string | null }[] }>
> {
  const analisis = esquemaConsolidar.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_pagos'))) return { exito: false, error: 'Sin permiso para consolidar cuentas' };
  try {
    const detalle = await consolidarArFaltantesServicio(crearClienteSupabaseAdmin(), {
      ordenIds: analisis.data.ordenIds,
      actorId: usuario.id,
    });
    const creadas = detalle.filter((fila) => fila.creada).length;
    await registrarLog(usuario, 'consolidar_ar_faltantes', 'cobranza', usuario.id, {
      creadas,
      omitidas: detalle.length - creadas,
    });
    return { exito: true, datos: { creadas, omitidas: detalle.length - creadas, detalle } };
  } catch (error) {
    const codigo = error instanceof ErrorCobranza ? error.codigo : 'desconocido';
    console.error('[COBRANZA] Error al consolidar cuentas:', error);
    await registrarLog(usuario, 'consolidar_ar_rechazado', 'cobranza', usuario.id, { codigo });
    return { exito: false, error: mensajeErrorCobranza(error) };
  }
}
