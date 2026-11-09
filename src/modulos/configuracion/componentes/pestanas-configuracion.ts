/**
 * Navegación de Configuración (UI-01).
 *
 * Seis secciones principales. Las pestañas anteriores se conservan como
 * entradas de compatibilidad para que los enlaces existentes (`?pestana=`)
 * sigan abriendo el contenido correcto y, cuando aplica, la subsección exacta.
 */

export const SECCIONES_CONFIGURACION = [
  { id: 'folios', etiqueta: 'Folios', descripcion: 'Continuidad de folios CNC y folios por periodo' },
  { id: 'tarifas', etiqueta: 'Tarifas y costos', descripcion: 'Tipo de cambio, costeo, estaciones y tarifario del ruteo' },
  { id: 'catalogos', etiqueta: 'Catálogos', descripcion: 'Catálogos comerciales y operativos' },
  { id: 'areas', etiqueta: 'Áreas de trabajo', descripcion: 'Áreas, subáreas, procesos y operadores por área' },
  { id: 'personas', etiqueta: 'Personas y accesos', descripcion: 'Usuarios, permisos y operadores de piso' },
  { id: 'documentos', etiqueta: 'Documentos', descripcion: 'Plantilla T1 de documentos' },
] as const;

export type SeccionConfiguracion = (typeof SECCIONES_CONFIGURACION)[number]['id'];

/**
 * Accesos provisionales mientras UI-02 reubica Empresa (menú de usuario) y
 * Cuentas bancarias (Tesorería). No forman parte de las seis secciones.
 */
export const SECCIONES_PROVISIONALES = [
  { id: 'empresa', etiqueta: 'Empresa' },
  { id: 'cuentas', etiqueta: 'Cuentas bancarias' },
] as const;

export type SeccionProvisional = (typeof SECCIONES_PROVISIONALES)[number]['id'];

export const SUBSECCIONES_CATALOGOS = [
  { id: 'comerciales', etiqueta: 'Comerciales', descripcion: 'Tiers y categorías de gasto' },
  { id: 'operativos', etiqueta: 'Operativos', descripcion: 'Procesos, grupos, próximas acciones y canales RFQ' },
] as const;

export type SubseccionCatalogos = (typeof SUBSECCIONES_CATALOGOS)[number]['id'];

export const SUBSECCIONES_PERSONAS = [
  { id: 'usuarios', etiqueta: 'Usuarios', descripcion: 'Altas, roles y estado de usuarios' },
  { id: 'permisos', etiqueta: 'Permisos', descripcion: 'Matriz de permisos por rol' },
  { id: 'operadores', etiqueta: 'Operadores', descripcion: 'Acceso por PIN de operadores de piso' },
] as const;

export type SubseccionPersonas = (typeof SUBSECCIONES_PERSONAS)[number]['id'];

export type SubseccionConfiguracion = SubseccionCatalogos | SubseccionPersonas;

export type VistaConfiguracion = {
  seccion: SeccionConfiguracion | SeccionProvisional;
  subseccion?: SubseccionConfiguracion;
};

/**
 * Correspondencia entre los valores históricos de `?pestana=` y la nueva vista.
 * Un enlace a `catalogos-base` abre Catálogos en su apartado operativo; un
 * enlace a `catalogos` abre el comercial.
 */
const MAPA_PESTANAS: Record<string, VistaConfiguracion> = {
  folios: { seccion: 'folios' },
  tarifas: { seccion: 'tarifas' },
  areas: { seccion: 'areas' },
  catalogos: { seccion: 'catalogos', subseccion: 'comerciales' },
  'catalogos-base': { seccion: 'catalogos', subseccion: 'operativos' },
  plantillas: { seccion: 'documentos' },
  documentos: { seccion: 'documentos' },
  usuarios: { seccion: 'personas', subseccion: 'usuarios' },
  permisos: { seccion: 'personas', subseccion: 'permisos' },
  operadores: { seccion: 'personas', subseccion: 'operadores' },
  personas: { seccion: 'personas', subseccion: 'usuarios' },
  empresa: { seccion: 'empresa' },
  cuentas: { seccion: 'cuentas' },
};

/** Vista inicial: la primera sección de la nueva arquitectura. */
export const VISTA_CONFIGURACION_INICIAL: VistaConfiguracion = { seccion: 'folios' };

/** Valida el parámetro `pestana`; un valor desconocido cae en la vista inicial. */
export function leerVistaConfiguracion(valor: string | string[] | undefined): VistaConfiguracion {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  if (!texto) return VISTA_CONFIGURACION_INICIAL;
  return MAPA_PESTANAS[texto] ?? VISTA_CONFIGURACION_INICIAL;
}

/**
 * Valor de `?pestana=` que representa una vista. Se usan los identificadores
 * históricos para no romper enlaces externos (RFQ, propuestas, manual).
 */
export function pestanaDesdeVista(vista: VistaConfiguracion): string {
  if (vista.seccion === 'catalogos') {
    return vista.subseccion === 'operativos' ? 'catalogos-base' : 'catalogos';
  }
  if (vista.seccion === 'personas') {
    return vista.subseccion === 'permisos' || vista.subseccion === 'operadores'
      ? vista.subseccion
      : 'usuarios';
  }
  if (vista.seccion === 'documentos') return 'plantillas';
  return vista.seccion;
}

/** Subsección que se abre al seleccionar una sección principal. */
export function subseccionInicial(
  seccion: SeccionConfiguracion,
): SubseccionConfiguracion | undefined {
  if (seccion === 'catalogos') return 'comerciales';
  if (seccion === 'personas') return 'usuarios';
  return undefined;
}
