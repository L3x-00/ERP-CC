'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

const BUCKET = 'comprobantes-gasto';

export async function obtenerUrlComprobanteGastoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ url: string }>> {
  const validado = z.object({ gastoId: z.uuid() }).strict().safeParse(entrada);
  if (!validado.success) return { exito: false, error: 'Gasto inválido' };
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'ver_finanzas'))) {
    return { exito: false, error: 'Sin permiso para consultar comprobantes' };
  }
  const servidor = await crearClienteSupabaseServidor();
  const { data: gasto, error } = await servidor.from('gastos')
    .select('comprobante_ruta, comprobante_url')
    .eq('id', validado.data.gastoId).maybeSingle();
  if (error || !gasto) return { exito: false, error: 'Gasto no disponible' };
  if (!gasto.comprobante_ruta) {
    return gasto.comprobante_url
      ? { exito: true, datos: { url: gasto.comprobante_url } }
      : { exito: false, error: 'Este gasto no tiene comprobante' };
  }
  const admin = crearClienteSupabaseAdmin();
  const { data, error: errorFirma } = await admin.storage.from(BUCKET)
    .createSignedUrl(gasto.comprobante_ruta, 60);
  if (errorFirma || !data?.signedUrl) return { exito: false, error: 'No se pudo abrir el comprobante' };
  return { exito: true, datos: { url: data.signedUrl } };
}
