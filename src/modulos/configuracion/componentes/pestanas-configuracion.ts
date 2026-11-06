/**
 * Pestañas de Configuración. Los ids son estables para poder enlazar
 * directamente a una sección (por ejemplo, desde el aviso de procesos del RFQ).
 */
export const PESTANAS_CONFIGURACION = [
  ['empresa', 'Empresa'],
  ['folios', 'Folios'],
  ['tarifas', 'Tarifas / TC'],
  ['catalogos', 'Catálogos'],
  ['catalogos-base', 'Catálogos base'],
  ['areas', 'Áreas de trabajo'],
  ['cuentas', 'Cuentas bancarias'],
  ['plantillas', 'Plantillas T1'],
  ['usuarios', 'Usuarios'],
  ['permisos', 'Permisos'],
  ['operadores', 'Operadores'],
] as const;

export type PestanaConfiguracion = (typeof PESTANAS_CONFIGURACION)[number][0];

/** Valida el parámetro `pestana` de la URL; ignora valores desconocidos. */
export function leerPestanaConfiguracion(
  valor: string | string[] | undefined,
): PestanaConfiguracion | undefined {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  const encontrada = PESTANAS_CONFIGURACION.find(([id]) => id === texto);
  return encontrada?.[0];
}
