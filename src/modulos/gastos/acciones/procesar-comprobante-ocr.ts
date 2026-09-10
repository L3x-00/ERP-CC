'use server';

import { Buffer } from 'node:buffer';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  ErrorOcr,
  extraerDatosComprobante,
} from '@/modulos/gastos/servicios/indice';
import type { DatosComprobanteOCR } from '@/modulos/gastos/tipos/indice';
import { esquemaComprobanteOCR } from '@/modulos/gastos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';

const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;

export async function procesarComprobanteOcrAccion(
  formulario: FormData,
): Promise<RespuestaAccion<DatosComprobanteOCR>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_gastos'))) {
    return { exito: false, error: 'Sin permiso para procesar comprobantes' };
  }

  const archivo = formulario.get('comprobante');
  if (!(archivo instanceof File)) return { exito: false, error: 'Selecciona un comprobante válido' };
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'].includes(archivo.type)) {
    return { exito: false, error: 'El tipo de comprobante no está permitido' };
  }
  if (archivo.size <= 0 || archivo.size > TAMANO_MAXIMO_BYTES) {
    return { exito: false, error: 'El comprobante excede el tamaño permitido' };
  }

  try {
    const entrada = {
      contenidoBase64: Buffer.from(await archivo.arrayBuffer()).toString('base64'),
      tipoMime: archivo.type,
    };
    const analisis = esquemaComprobanteOCR.safeParse(entrada);
    if (!analisis.success) return { exito: false, error: 'Comprobante inválido' };
    const datos = await extraerDatosComprobante(analisis.data);
    await registrarLog(usuario, 'procesar_comprobante_ocr', 'gastos', usuario.id, {
      mime: archivo.type,
      bytes: archivo.size,
    });
    return { exito: true, datos };
  } catch (error) {
    console.error('[GASTOS] Error al procesar OCR:', error);
    if (error instanceof ErrorOcr && error.codigo === 'configuracion_faltante') {
      await registrarLog(usuario, 'ocr_comprobante_rechazado', 'gastos', usuario.id, {
        codigo: error.codigo,
      });
      return { exito: false, error: 'El OCR no está configurado' };
    }
    await registrarLog(usuario, 'ocr_comprobante_rechazado', 'gastos', usuario.id);
    return { exito: false, error: 'No se pudo leer el comprobante' };
  }
}
