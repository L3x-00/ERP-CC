'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { generarFolioOp } from '@/modulos/pipeline/servicios/generar-folio-op';
import { esquemaCrearProspecto } from '@/modulos/pipeline/validaciones/esquemas-prospecto';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Crea un prospecto nuevo en la etapa inicial del pipeline.
 *
 * El folio OP se genera SIEMPRE vía RPC atómica (nunca contando filas ni en
 * cliente). El prospecto queda asignado al vendedor autenticado. Escribe con
 * cliente admin: el folio y las columnas controladas (etapa/folio) están
 * protegidas de escritura directa por trigger/RLS; la autorización ya se hizo
 * arriba (`obtenerUsuarioServidor`) y `vendedor_id` se fija al usuario actual.
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
  const datos = analisis.data;

  const admin = crearClienteSupabaseAdmin();

  let folioOp: string;
  try {
    folioOp = await generarFolioOp(admin);
  } catch {
    return { exito: false, error: 'No se pudo generar el folio' };
  }

  const { data: fila, error } = await admin
    .from('pipeline')
    .insert({
      folio_op: folioOp,
      etapa: 'prospecto',
      nombre_contacto: datos.nombreContacto,
      empresa: datos.empresa,
      // Correo opcional: cadena vacía se normaliza a null.
      correo: datos.correo ? datos.correo : null,
      telefono: datos.telefono ?? null,
      vendedor_id: usuario.id,
      moneda: datos.moneda,
      condiciones_pago: datos.condicionesPago ?? null,
      prioridad: datos.prioridad,
      iva_porcentaje: datos.ivaPorcentaje,
      etiquetas: datos.etiquetas,
    })
    .select('id')
    .single();

  if (error || !fila) {
    return { exito: false, error: 'No se pudo crear el prospecto' };
  }

  await registrarLog(usuario, 'crear', 'pipeline', fila.id, { folioOp });

  return { exito: true, datos: { id: fila.id, folioOp } };
}
