'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** Limpia una carga privada sin uso al cancelar o reemplazar el archivo local. */
export async function descartarSubidaComprobanteGastoAccion(entrada: unknown): Promise<RespuestaAccion<null>> {
  const analisis = z.object({ ruta: z.string().min(1).max(200) }).strict().safeParse(entrada);
  if (!analisis.success) return { exito: false, error: 'Ruta inválida' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_gastos'))) return { exito: false, error: 'Sin permiso' };
  if (!new RegExp(`^${usuario.id}/[0-9a-f-]{36}\\.(jpg|png|webp|gif|pdf)$`).test(analisis.data.ruta)) {
    return { exito: false, error: 'Ruta inválida' };
  }
  const admin = crearClienteSupabaseAdmin();
  const [vigente, historico] = await Promise.all([
    admin.from('gastos').select('id').eq('comprobante_ruta', analisis.data.ruta).maybeSingle(),
    admin.from('comprobantes_gasto_historial').select('id').eq('ruta', analisis.data.ruta).limit(1).maybeSingle(),
  ]);
  if (vigente.error || historico.error || vigente.data || historico.data) {
    return { exito: false, error: 'El comprobante está asociado a un gasto' };
  }
  const { error } = await admin.storage.from('comprobantes-gasto').remove([analisis.data.ruta]);
  return error ? { exito: false, error: 'No se pudo limpiar la carga' } : { exito: true, datos: null };
}
