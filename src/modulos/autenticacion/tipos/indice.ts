/** Roles válidos del sistema. */
export type RolUsuario = 'admin' | 'vendedor' | 'gerente' | 'operador' | 'contador';

/**
 * Permisos granulares del sistema (catálogo `permisos` + `permisos_rol`).
 * Códigos en snake_case (el documento del cliente los cita en MAYÚSCULAS).
 */
export type Permiso =
  // Legacy
  | 'ver_clientes'
  | 'aprobar_ordenes'
  | 'registrar_pagos'
  | 'registrar_gastos'
  | 'aplicar_saldos'
  | 'eliminar'
  | 'ver_finanzas'
  | 'ver_pipeline_equipo'
  | 'configuracion'
  | 'cancelar_ordenes_en_proceso'
  | 'gestionar_inventario'
  | 'gestionar_produccion'
  | 'ver_planeacion'
  | 'gestionar_planeacion'
  // Clientes (B2)
  | 'cliente_vista'
  | 'cliente_editar'
  | 'cliente_documentos'
  | 'cliente_comercial'
  // RFQ (B3)
  | 'rfq_vista'
  | 'rfq_crear'
  | 'rfq_editar'
  | 'rfq_item_editar'
  | 'rfq_marcar_listo'
  | 'rfq_cerrar'
  // Propuestas (B4)
  | 'propuesta_vista'
  | 'propuesta_editar_articulo'
  | 'propuesta_editar_precio'
  | 'propuesta_editar_ruteo'
  | 'propuesta_editar_costo'
  | 'propuesta_validar'
  | 'propuesta_generar_pdf'
  | 'propuesta_enviar'
  | 'propuesta_seguimiento'
  | 'propuesta_aceptar'
  | 'propuesta_crear_revision'
  | 'propuesta_cerrar'
  // Órdenes (B5)
  | 'orden_vista'
  | 'orden_editar'
  | 'orden_liberar'
  | 'orden_reprogramar'
  | 'orden_cerrar_admin'
  | 'orden_cancelar'
  | 'orden_crear_interna'
  // Producción (B6)
  | 'produccion_operar'
  | 'calidad_liberar_primera_pieza'
  | 'calidad_inspeccionar'
  // Entregas (B7)
  | 'entrega_generar'
  | 'entrega_evidencia'
  // Sistema (B1)
  | 'actividad_vista'
  | 'catalogo_ver'
  | 'catalogo_editar'
  | 'usuario_admin'
  | 'permiso_admin';

/** Usuario del sistema (tabla usuarios). */
export type Usuario = {
  id: string; // UUID
  email: string;
  nombreCompleto: string;
  rol: RolUsuario;
  /** Hash bcrypt del PIN (solo si rol='operador'). Nunca se envía al cliente. */
  pinOperador?: string | null;
  /** Versión del PIN para revocar cookies previas sin depender de relojes. */
  pinCambiadoEn?: string | null;
  activo: boolean;
  ultimoLoginEn?: string | null; // ISO 8601
  creadoEn: string; // ISO 8601
  actualizadoEn: string; // ISO 8601
};

/** Usuario autenticado con sus permisos resueltos. */
export type UsuarioAutenticado = Usuario & {
  permisos: string[];
};

/** Sesión corta de operador de piso (cookie httpOnly). */
export type SesionOperador = {
  usuarioId: string;
  nombreUsuario: string;
  iniciadaEn: string; // ISO 8601
  ultimaActividadEn: string; // ISO 8601
  timeoutMinutos: number; // 15, 30, etc.
  /** Las cookies historicas sin modo se interpretan como acceso por PIN. */
  modo?: 'pin' | 'delegada';
  administradorId?: string;
  nombreAdministrador?: string;
  motivoDelegacion?: string;
  /** La delegacion tiene una fecha fija y no se prolonga por actividad. */
  expiraEn?: string;
  pinCambiadoEn?: string | null; // versión al emitir la cookie HMAC
};

/** Registro de auditoría (tabla logs). */
export type Log = {
  id: string;
  usuarioId: string;
  nombreUsuario: string;
  rol: RolUsuario;
  accion: string; // 'crear', 'actualizar', 'eliminar', 'aprobar', etc.
  modulo: string; // 'clientes', 'ordenes', etc.
  recursoId: string;
  detalles?: Record<string, unknown> | null;
  creadoEn: string; // ISO 8601
};

/** Fila de la tabla usuarios en Supabase (snake_case). */
export type FilaUsuario = {
  id: string;
  email: string;
  nombre_completo: string;
  rol: RolUsuario;
  pin_operador: string | null;
  pin_cambiado_en?: string | null;
  activo: boolean;
  ultimo_login_at: string | null;
  creado_en: string;
  actualizado_en: string;
};

/** Convierte fila snake_case de Supabase a tipo Usuario camelCase. */
export function filaAUsuario(fila: FilaUsuario): Usuario {
  return {
    id: fila.id,
    email: fila.email,
    nombreCompleto: fila.nombre_completo,
    rol: fila.rol,
    pinOperador: fila.pin_operador,
    pinCambiadoEn: fila.pin_cambiado_en ?? null,
    activo: fila.activo,
    ultimoLoginEn: fila.ultimo_login_at,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}
