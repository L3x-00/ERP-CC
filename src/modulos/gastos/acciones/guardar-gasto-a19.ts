'use server';

import type { Json } from '@/compartido/tipos/supabase';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerConfiguracionGeneral } from '@/modulos/configuracion/servicios/indice';
import { filaAGasto, type Gasto } from '@/modulos/gastos/tipos/indice';
import { esquemaGuardarGastoA19, esquemaRegistrarGasto } from '@/modulos/gastos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const BUCKET = 'comprobantes-gasto';
const MIMES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf',
};
const MAX_BYTES = 10 * 1024 * 1024;

function mensajeError(mensaje: string): string {
  if (mensaje.includes('version_obsoleta')) return 'El gasto cambió en otra pantalla; vuelve a consultar';
  if (mensaje.includes('estado_invalido')) return 'Solo se pueden corregir gastos pendientes';
  if (mensaje.includes('usuario_sin_permiso')) return 'Sin permiso para guardar el gasto';
  if (mensaje.includes('proveedor_inexistente')) return 'El proveedor ya no existe';
  return 'No se pudo guardar el gasto';
}

/** Guarda datos y ruta del comprobante en una sola transacción SQL. */
export async function guardarGastoA19Accion(formulario: FormData): Promise<RespuestaAccion<Gasto>> {
  const crudo = formulario.get('datos');
  if (typeof crudo !== 'string' || crudo.length > 30_000) {
    return { exito: false, error: 'Datos inválidos' };
  }
  let entrada: unknown;
  try { entrada = JSON.parse(crudo); } catch { return { exito: false, error: 'Datos inválidos' }; }
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    return { exito: false, error: 'Datos inválidos' };
  }
  const { modo, gastoId, actualizadoEn, tipoGasto, comprobanteRuta, ...campos } = entrada as Record<string, unknown>;
  const meta = esquemaGuardarGastoA19.safeParse({ modo, gastoId, actualizadoEn, tipoGasto });
  const datos = esquemaRegistrarGasto.safeParse({ ...campos, tipoGasto });
  if (!meta.success || !datos.success) {
    return { exito: false, error: meta.error?.issues[0]?.message ?? datos.error?.issues[0]?.message ?? 'Datos inválidos' };
  }
  if (meta.data.modo === 'editar' && (!meta.data.gastoId || !meta.data.actualizadoEn)) {
    return { exito: false, error: 'Falta la versión del gasto' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_gastos'))) {
    return { exito: false, error: 'Sin permiso para guardar gastos' };
  }
  const admin = crearClienteSupabaseAdmin();
  const configuracion = await obtenerConfiguracionGeneral();
  if (!configuracion.categoriasGasto.includes(datos.data.categoria)) {
    const { data: anterior } = meta.data.modo === 'editar' && meta.data.gastoId
      ? await admin.from('gastos').select('categoria').eq('id', meta.data.gastoId).maybeSingle()
      : { data: null };
    if (anterior?.categoria !== datos.data.categoria) {
      return { exito: false, error: 'La categoría no está en el catálogo configurado' };
    }
  }

  let ruta: string | null = null;
  if (comprobanteRuta !== undefined) {
    if (typeof comprobanteRuta !== 'string'
      || !new RegExp(`^${usuario.id}/[0-9a-f-]{36}\\.(jpg|png|webp|gif|pdf)$`).test(comprobanteRuta)) {
      return { exito: false, error: 'Ruta de comprobante inválida' };
    }
    ruta = comprobanteRuta;
    const nombre = ruta.split('/')[1];
    const { data: objetos, error } = await admin.storage.from(BUCKET)
      .list(usuario.id, { search: nombre, limit: 20 });
    const objeto = objetos?.find((item) => item.name === nombre);
    const mime = String(objeto?.metadata?.mimetype ?? '');
    const tamano = Number(objeto?.metadata?.size ?? 0);
    if (error || !objeto || MIMES[mime] !== nombre.split('.').pop()
      || tamano < 1 || tamano > MAX_BYTES) {
      return { exito: false, error: 'Comprobante no disponible o inválido' };
    }
  }

  try {
    const payload = { ...datos.data, tipoGasto: meta.data.tipoGasto, ...(ruta ? { comprobanteRuta: ruta } : {}) };
    const { data, error } = meta.data.modo === 'crear'
      ? await admin.rpc('registrar_gasto_a19', { p_datos: payload as Json, p_usuario_id: usuario.id })
      : await admin.rpc('editar_gasto_a19', {
        p_gasto_id: meta.data.gastoId as string,
        p_actualizado_en: meta.data.actualizadoEn as string,
        p_datos: payload as Json,
        p_usuario_id: usuario.id,
      });
    if (error || !data?.[0]) throw new Error(error?.message ?? 'gasto_inexistente');
    const gasto = filaAGasto(data[0]);
    await registrarLog(usuario, meta.data.modo === 'crear' ? 'registrar_gasto' : 'editar_gasto', 'gastos', gasto.id, {
      folio: gasto.folio, tipoGasto: gasto.tipoGasto, comprobanteActualizado: ruta !== null,
    });
    return { exito: true, datos: gasto };
  } catch (error) {
    console.error('[GASTOS] Falló guardar A19:', error);
    return { exito: false, error: mensajeError(error instanceof Error ? error.message : '') };
  }
}
