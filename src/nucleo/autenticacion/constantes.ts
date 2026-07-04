/** Minutos de inactividad antes de cerrar sesión de operador. */
export const TIMEOUT_SESION_OPERADOR_MINUTOS = 15;

/** Horas de vigencia de sesión admin/ventas/gerente. */
export const TIMEOUT_SESION_ADMIN_HORAS = 24;

/** Longitud mínima del PIN de operador. */
export const PIN_LONGITUD_MINIMA = 4;

/** Longitud máxima del PIN de operador. */
export const PIN_LONGITUD_MAXIMA = 6;

/** Intentos máximos de login antes de bloqueo temporal. */
export const INTENTOS_LOGIN_MAXIMOS = 5;

/** Minutos de bloqueo tras alcanzar INTENTOS_LOGIN_MAXIMOS. */
export const BLOQUEO_LOGIN_MINUTOS = 15;

/** Nombre de la cookie de sesión de operador (httpOnly). */
export const COOKIE_SESION_OPERADOR = 'sesion_operador';

/** Rondas de sal para hash bcrypt del PIN. */
export const RONDAS_SAL_BCRYPT = 10;
