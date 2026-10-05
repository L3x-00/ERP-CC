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

// Permisos granulares (catálogo `permisos` + asignación en `permisos_rol`).
// Nota: el documento del cliente cita los permisos en MAYÚSCULAS como
// notación; en el repo se normalizan a snake_case minúsculo (ADR-SII-05).
export const PERMISOS = [
  // Legacy (códigos vigentes)
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
  'gestionar_inventario',
  'gestionar_produccion',
  'ver_planeacion',
  'gestionar_planeacion',
  // Clientes (B2)
  'cliente_vista',
  'cliente_editar',
  'cliente_documentos',
  'cliente_comercial',
  // RFQ (B3)
  'rfq_vista',
  'rfq_crear',
  'rfq_editar',
  'rfq_item_editar',
  'rfq_marcar_listo',
  'rfq_cerrar',
  // Propuestas (B4)
  'propuesta_vista',
  'propuesta_editar_articulo',
  'propuesta_editar_precio',
  'propuesta_editar_ruteo',
  'propuesta_editar_costo',
  'propuesta_validar',
  'propuesta_generar_pdf',
  'propuesta_enviar',
  'propuesta_seguimiento',
  'propuesta_aceptar',
  'propuesta_crear_revision',
  'propuesta_cerrar',
  // Órdenes (B5)
  'orden_vista',
  'orden_editar',
  'orden_liberar',
  'orden_reprogramar',
  'orden_cerrar_admin',
  'orden_cancelar',
  'orden_crear_interna',
  // Producción (B6)
  'produccion_operar',
  'calidad_liberar_primera_pieza',
  'calidad_inspeccionar',
  // Entregas (B7)
  'entrega_generar',
  'entrega_evidencia',
  // Sistema (B1)
  'actividad_vista',
  'catalogo_ver',
  'catalogo_editar',
  'usuario_admin',
  'permiso_admin',
] as const;

// Timeouts de sesión: ver src/nucleo/autenticacion/constantes.ts (única fuente,
// son específicos de auth, no genéricos de la app).

// Formatos
export const FORMATO_MONEDA = 'MXN';
export const FORMATO_IVA_DEFECTO = 16; // %
export const FORMATO_IVA_FRONTERA = 8; // %

// Paginación
export const REGISTROS_POR_PAGINA = 10;
