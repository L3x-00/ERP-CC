// Estados comunes
export const ESTADOS_ORDEN = [
  'aprobado',
  'bandeja',
  'en_proceso',
  'pausada',
  'lista',
  'entregada',
  'cancelada',
] as const;

export const ESTADOS_RFQ = ['pendiente', 'enviada', 'aprobada', 'rechazada'] as const;

// Roles
export const ROLES = ['admin', 'vendedor', 'gerente', 'operador', 'contador'] as const;

// Permisos granulares (tabla permisos_rol)
export const PERMISOS = [
  'ver_clientes',
  'aprobar_ordenes',
  'registrar_pagos',
  'registrar_gastos',
  'aplicar_saldos',
  'eliminar',
  'ver_finanzas',
  'ver_pipeline_equipo',
  'configuracion',
  'cancelar_ordenes_en_proceso',
] as const;

// Timeouts de sesión: ver src/nucleo/autenticacion/constantes.ts (única fuente,
// son específicos de auth, no genéricos de la app).

// Formatos
export const FORMATO_MONEDA = 'MXN';
export const FORMATO_IVA_DEFECTO = 16; // %
export const FORMATO_IVA_FRONTERA = 8; // %

// Paginación
export const REGISTROS_POR_PAGINA = 10;
