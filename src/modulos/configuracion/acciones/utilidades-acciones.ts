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
    // Código estable para correlación; el detalle crudo solo va a la consola.
    console.error(`[CONFIGURACION] ${accion}:`, error);
    await registrarLog(usuario, `${accion}_rechazada`, 'configuracion', recursoId, {
      codigo: 'error_servicio_configuracion',
    });
    return { exito: false, error: 'No se pudo guardar la configuración' };
  }
}
