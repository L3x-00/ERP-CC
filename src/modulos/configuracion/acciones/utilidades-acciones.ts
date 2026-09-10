import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { UsuarioAutenticado } from '@/modulos/autenticacion/tipos/indice';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';

type EjecutarConfiguracion<T> = () => Promise<T>;

/** Ejecuta la operación y separa el detalle técnico del mensaje público. */
export async function ejecutarAccionConfiguracion<T>(
  usuario: UsuarioAutenticado,
  accion: string,
  recursoId: string,
  ejecutar: EjecutarConfiguracion<T>,
  detalles: Record<string, unknown> = {},
): Promise<RespuestaAccion<T>> {
  try {
    const datos = await ejecutar();
    await registrarLog(usuario, accion, 'configuracion', recursoId, detalles);
    return { exito: true, datos };
  } catch (error) {
    const detalleTecnico = error instanceof Error ? error.message : 'error_no_identificado';
    console.error(`[CONFIGURACION] ${accion}:`, error);
    await registrarLog(usuario, `${accion}_rechazada`, 'configuracion', recursoId, {
      codigo: detalleTecnico.slice(0, 180),
    });
    return { exito: false, error: 'No se pudo guardar la configuración' };
  }
}
