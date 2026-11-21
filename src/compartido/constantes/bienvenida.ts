/** Señales y tiempos compartidos por el splash de bienvenida y los accesos. */
import { TIMEOUT_SESION_OPERADOR_MINUTOS } from '@/nucleo/autenticacion/constantes';

/** El splash permanece visible 2 segundos, sin importar lo que tarde el servidor. */
export const DURACION_BIENVENIDA_MS = 2000;

/** Se dispara cuando el login (admin u operador) termina correctamente. */
export const EVENTO_INICIO_SESION = 'orca:inicio-sesion';

/** Se dispara al cerrar sesión para no reutilizar el rastro de actividad. */
export const EVENTO_FIN_SESION = 'orca:fin-sesion';

export const CLAVE_SESION_BIENVENIDA = 'orca-bienvenida-sesion-v1';
export const CLAVE_ACTIVIDAD_BIENVENIDA = 'orca-bienvenida-actividad-v1';

/** Tras este tiempo sin interacción, una recarga vuelve a mostrar el splash. */
export const INACTIVIDAD_BIENVENIDA_MS = TIMEOUT_SESION_OPERADOR_MINUTOS * 60 * 1000;
