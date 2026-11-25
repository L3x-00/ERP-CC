'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearCorridaServicio } from '@/modulos/produccion/servicios/corridas-servicio';
import { mensajeErrorSesion } from '@/modulos/produccion/servicios/sesiones-servicio';
import type { Corrida } from '@/modulos/produccion/tipos/corridas';

import { obtenerActorProduccionParaMutacion } from './utilidades-acciones';

const esquemaCrearLote = z.object({
  ordenId: z.uuid('Orden inválida'),
  procesoNombre: z.string().trim().min(2).max(120),
  items: z.array(z.object({
    partidaId: z.uuid('Ítem inválido'),
    cantidad: z.number().positive('La cantidad debe ser mayor a cero'),
  })).min(2, 'Selecciona al menos dos ítems').max(200),
}).strict();

/**
 * C2: el operador crea el lote sugerido desde su terminal. Resuelve el proceso
 * por nombre para no exponer catálogos financieros en la pantalla de piso;
 * la RPC vuelve a validar permiso, compatibilidad y cantidades.
 */
export async function crearLoteOperadorAccion(entrada: unknown): Promise<RespuestaAccion<Corrida>> {
  const resultado = esquemaCrearLote.safeParse(entrada);
  if (!resultado.success) {
    return { exito: false, error: resultado.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const actor = await obtenerActorProduccionParaMutacion('crear_corrida', resultado.data.ordenId);
  if (!actor) return { exito: false, error: 'No autorizado' };
  const [puedeGestionar, puedeOperar] = await Promise.all([
    can(actor, 'gestionar_produccion'),
    can(actor, 'produccion_operar'),
  ]);
  if (!puedeGestionar && !puedeOperar) {
    return { exito: false, error: 'Sin permiso para crear lotes' };
  }

  const correlationId = nuevoCorrelationId();
  try {
    const admin = crearClienteSupabaseAdmin();
    const { data: proceso, error: errorProceso } = await admin
      .from('catalogo_procesos')
      .select('id')
      .eq('activo', true)
      .ilike('nombre', resultado.data.procesoNombre)
      .maybeSingle();
    if (errorProceso || !proceso) {
      return { exito: false, error: 'No se encontró el proceso sugerido. Actualiza la ficha y vuelve a intentarlo.' };
    }

    const corrida = await crearCorridaServicio(admin, {
      ordenId: resultado.data.ordenId,
      procesoId: proceso.id,
      items: resultado.data.items,
      actorId: actor.id,
    });
    await registrarLog(actor, 'crear_corrida', 'produccion', corrida.id, {
      ordenId: corrida.ordenId,
      codigo: corrida.codigo,
      items: corrida.items.length,
      origen: 'terminal_operador',
    }, correlationId);
    return { exito: true, datos: corrida };
  } catch (error) {
    console.error('[PRODUCCION] Error al crear lote desde la terminal:', error);
    return { exito: false, error: mensajeErrorSesion(error) };
  }
}
