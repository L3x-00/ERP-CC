import type {
  CategoriaMaterial,
  Material,
  TipoMovimiento,
  UnidadControl,
} from '@/modulos/inventario/tipos/inventario';

/** ¿El material está en alerta de reorden (stock actual ≤ stock mínimo)? */
export function esStockBajo(material: Pick<Material, 'stockActualControl' | 'stockMinimoControl'>): boolean {
  return material.stockActualControl <= material.stockMinimoControl;
}

/** Valor estimado del material en inventario = stock actual × costo por unidad de control. */
export function valorInventario(
  material: Pick<Material, 'stockActualControl' | 'costoUnitarioControl'>,
): number {
  return material.stockActualControl * material.costoUnitarioControl;
}

/** Etiqueta legible de cada categoría. */
export const ETIQUETA_CATEGORIA: Record<CategoriaMaterial, string> = {
  materia_prima: 'Materia prima',
  insumo: 'Insumo',
  semiterminado: 'Semiterminado',
  terminado: 'Terminado',
};

/** Etiqueta legible de cada tipo de movimiento. */
export const ETIQUETA_TIPO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  entrada_compra: 'Entrada (compra)',
  salida_produccion: 'Salida (producción)',
  ajuste_inventario: 'Ajuste',
  devolucion: 'Devolución',
};

/** Símbolo corto de la unidad de control. */
export const ETIQUETA_UNIDAD_CONTROL: Record<UnidadControl, string> = {
  m2: 'm²',
  ml: 'ml',
  pieza: 'pza',
  kg: 'kg',
};
