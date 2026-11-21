/** Señales y tiempos compartidos por el splash de bienvenida y los accesos. */
import { TIMEOUT_SESION_OPERADOR_MINUTOS } from '@/nucleo/autenticacion/constantes';

/** Duración mínima del splash; se extiende si la validación tarda más. */
export const DURACION_BIENVENIDA_MS = 2000;

/** Se dispara en cuanto empieza la validación de credenciales o del PIN. */
export const EVENTO_INICIO_SESION = 'orca:inicio-sesion';

/**
 * Se dispara cuando la validación falló: cierra el splash y deja visible el
 * formulario con su mensaje de error. En un login correcto NO se dispara.
 */
export const EVENTO_FIN_VALIDACION = 'orca:fin-validacion';

/**
 * Se dispara cuando la validación terminó bien: el check verde se pinta dentro
 * del splash y este se mantiene hasta que la ruta destino ya esté montada.
 */
export const EVENTO_ACCESO_PERMITIDO = 'orca:acceso-permitido';

/** Se dispara al cerrar sesión para no reutilizar el rastro de actividad. */
export const EVENTO_FIN_SESION = 'orca:fin-sesion';

/** Marca de tiempo de inicio, aislada del cuerpo de los componentes. */
export function ahoraMs(): number {
  return Date.now();
}

/** Espera a que el splash haya estado visible al menos 2 segundos. */
export function esperarDuracionMinima(inicio: number): Promise<void> {
  const restante = Math.max(0, DURACION_BIENVENIDA_MS - (Date.now() - inicio));
  return new Promise((resolver) => window.setTimeout(resolver, restante));
}

export const CLAVE_SESION_BIENVENIDA = 'orca-bienvenida-sesion-v1';
export const CLAVE_ACTIVIDAD_BIENVENIDA = 'orca-bienvenida-actividad-v1';

/** Tras este tiempo sin interacción, una recarga vuelve a mostrar el splash. */
export const INACTIVIDAD_BIENVENIDA_MS = TIMEOUT_SESION_OPERADOR_MINUTOS * 60 * 1000;
