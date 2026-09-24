'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const BUCKET = 'comprobantes-gasto';
const EXTENSIONES = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'application/pdf': 'pdf',
} as const;
const esquema = z.object({
  mime: z.enum(Object.keys(EXTENSIONES) as [keyof typeof EXTENSIONES, ...(keyof typeof EXTENSIONES)[]]),
  tamano: z.number().int().min(1).max(10 * 1024 * 1024),
  gastoId: z.uuid().optional(),
  actualizadoEn: z.iso.datetime({ offset: true }).optional(),
}).strict();

/** Emite permiso de carga limitado a una ruta aleatoria del usuario autorizado. */
export async function prepararSubidaComprobanteGastoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ ruta: string; token: string }>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Archivo inválido o mayor a 10 MiB' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_gastos'))) {
    return { exito: false, error: 'Sin permiso para subir comprobantes' };
  }
  const admin = crearClienteSupabaseAdmin();
  if (analisis.data.gastoId) {
    const { data: gasto, error } = await admin.from('gastos')
      .select('estado_pago, actualizado_en').eq('id', analisis.data.gastoId).maybeSingle();
    if (error || !gasto || gasto.estado_pago !== 'pendiente'
      || gasto.actualizado_en !== analisis.data.actualizadoEn) {
      return { exito: false, error: 'El gasto cambió; vuelve a consultar' };
    }
  }
  const ruta = `${usuario.id}/${randomUUID()}.${EXTENSIONES[analisis.data.mime]}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(ruta);
  if (error || !data?.token) return { exito: false, error: 'No se pudo preparar la subida' };
  return { exito: true, datos: { ruta, token: data.token } };
}
