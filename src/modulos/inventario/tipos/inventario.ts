import type { Tables } from '@/compartido/tipos/supabase';

export type CategoriaMaterial =
  | 'materia_prima'
  | 'insumo'
  | 'semiterminado'
  | 'terminado';

export type UnidadCompra = 'hoja' | 'barra' | 'rollo' | 'pieza';
export type UnidadControl = 'm2' | 'ml' | 'pieza' | 'kg';

export type TipoMovimiento =
  | 'entrada_compra'
  | 'salida_produccion'
  | 'ajuste_inventario'
  | 'devolucion';

export type EstadoReserva = 'activa' | 'consumida' | 'cancelada';

export interface Proveedor {
  id: string;
  nombreComercial: string;
  razonSocial: string | null;
  rfc: string | null;
  contactoNombre: string;
  correo: string;
  telefono: string;
  direccion: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

export interface Material {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  categoria: CategoriaMaterial;
  unidadCompra: UnidadCompra;
  unidadControl: UnidadControl;
  factorConversion: number;
  costoUnitarioCompra: number;
  costoUnitarioControl: number;
  stockActualControl: number;
  stockReservadoControl: number;
  stockMinimoControl: number;
  proveedorId: string | null;
  factorMermaPorcentaje: number;
  creadoEn: string;
  actualizadoEn: string;
}

export interface MovimientoInventario {
  id: string;
  folio: string;
  materialId: string;
  tipoMovimiento: TipoMovimiento;
  /** Nulo en movimientos sin equivalente de compra (p. ej. salida de producción). */
  cantidadCompra: number | null;
  cantidadControl: number;
  costoUnitarioMomento: number;
  ordenId: string | null;
  operadorId: string | null;
  referenciaExterna: string | null;
  notas: string | null;
  creadoEn: string;
}

export interface ReservaMaterial {
  id: string;
  materialId: string;
  ordenId: string;
  cantidadReservada: number;
  estado: EstadoReserva;
  creadoEn: string;
  actualizadoEn: string;
}

// Filas crudas de Supabase (snake_case) derivadas de los tipos generados.
export type FilaProveedor = Tables<'proveedores'>;
export type FilaMaterial = Tables<'materiales'>;
export type FilaMovimientoInventario = Tables<'movimientos_inventario'>;
export type FilaReservaMaterial = Tables<'reservas_material'>;

/** Convierte una fila de `proveedores` (snake_case) a `Proveedor`. */
export function filaAProveedor(fila: FilaProveedor): Proveedor {
  return {
    id: fila.id,
    nombreComercial: fila.nombre_comercial,
    razonSocial: fila.razon_social,
    rfc: fila.rfc,
    contactoNombre: fila.contacto_nombre,
    correo: fila.correo,
    telefono: fila.telefono,
    direccion: fila.direccion,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

/** Convierte una fila de `materiales` (snake_case) a `Material`. */
export function filaAMaterial(fila: FilaMaterial): Material {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    categoria: fila.categoria as CategoriaMaterial,
    unidadCompra: fila.unidad_compra as UnidadCompra,
    unidadControl: fila.unidad_control as UnidadControl,
    factorConversion: Number(fila.factor_conversion),
    costoUnitarioCompra: Number(fila.costo_unitario_compra),
    costoUnitarioControl: Number(fila.costo_unitario_control),
    stockActualControl: Number(fila.stock_actual_control),
    stockReservadoControl: Number(fila.stock_reservado_control),
    stockMinimoControl: Number(fila.stock_minimo_control),
    proveedorId: fila.proveedor_id,
    factorMermaPorcentaje: Number(fila.factor_merma_porcentaje),
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

/** Convierte una fila de `movimientos_inventario` (snake_case) a `MovimientoInventario`. */
export function filaAMovimientoInventario(
  fila: FilaMovimientoInventario,
): MovimientoInventario {
  return {
    id: fila.id,
    folio: fila.folio,
    materialId: fila.material_id,
    tipoMovimiento: fila.tipo_movimiento as TipoMovimiento,
    cantidadCompra: fila.cantidad_compra === null ? null : Number(fila.cantidad_compra),
    cantidadControl: Number(fila.cantidad_control),
    costoUnitarioMomento: Number(fila.costo_unitario_momento),
    ordenId: fila.orden_id,
    operadorId: fila.operador_id,
    referenciaExterna: fila.referencia_externa,
    notas: fila.notas,
    creadoEn: fila.creado_en,
  };
}

/** Convierte una fila de `reservas_material` (snake_case) a `ReservaMaterial`. */
export function filaAReservaMaterial(fila: FilaReservaMaterial): ReservaMaterial {
  return {
    id: fila.id,
    materialId: fila.material_id,
    ordenId: fila.orden_id,
    cantidadReservada: Number(fila.cantidad_reservada),
    estado: fila.estado as EstadoReserva,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}
