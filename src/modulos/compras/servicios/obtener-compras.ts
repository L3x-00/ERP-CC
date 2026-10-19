import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  filaACompra,
  type CompraCola,
  type MaterialOpcion,
  type OrdenOpcion,
  type ProveedorOpcion,
  type UltimoCostoMaterial,
} from '@/modulos/compras/tipos/indice';

export type ColaCompras = {
  compras: CompraCola[];
  proveedores: ProveedorOpcion[];
  ordenes: OrdenOpcion[];
  materiales: MaterialOpcion[];
  /** C10.1/F08: último costo unitario capturado por material (solo lectura). */
  ultimosCostos: Record<string, UltimoCostoMaterial>;
};

/** SII-B8 F4: cola de compras con proveedor/orden legibles y catálogos del alta. */
export async function obtenerColaCompras(
  cliente: SupabaseClient<Database>,
  limite = 200,
): Promise<ColaCompras> {
  const [comprasResp, proveedoresResp, ordenesResp, materialesResp, costosResp] = await Promise.all([
    cliente
      .from('compras')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(limite),
    cliente
      .from('proveedores')
      .select('id, nombre_comercial, razon_social')
      .order('nombre_comercial', { ascending: true }),
    cliente
      .from('ordenes_produccion')
      .select('id, folio, folio_sii')
      .order('creado_en', { ascending: false })
      .limit(200),
    cliente
      .from('catalogo_materiales')
      .select('id, codigo, nombre')
      .eq('activo', true)
      .order('nombre', { ascending: true }),
    cliente
      .from('compras')
      .select('material_id, costo_unitario, moneda')
      .not('material_id', 'is', null)
      .not('costo_unitario', 'is', null)
      .neq('estado', 'CANCELADA')
      .order('fecha_compra', { ascending: false })
      .limit(500),
  ]);
  if (comprasResp.error) {
    throw new Error('No se pudieron cargar las compras');
  }

  const nombreProveedor = new Map(
    (proveedoresResp.data ?? []).map((proveedor) => [
      proveedor.id,
      proveedor.nombre_comercial || proveedor.razon_social,
    ]),
  );
  const folioOrdenMap = new Map(
    (ordenesResp.data ?? []).map((orden) => [orden.id, orden.folio_sii ?? orden.folio]),
  );

  const compras: CompraCola[] = (comprasResp.data ?? []).map((fila) => ({
    ...filaACompra(fila),
    proveedorNombre: nombreProveedor.get(fila.proveedor_id) ?? '—',
    ordenFolio: fila.orden_id ? (folioOrdenMap.get(fila.orden_id) ?? null) : null,
  }));

  // Solo lectura: la compra más reciente con costo unitario define la referencia.
  const ultimosCostos: Record<string, UltimoCostoMaterial> = {};
  for (const fila of costosResp.data ?? []) {
    if (fila.material_id && fila.costo_unitario !== null && !(fila.material_id in ultimosCostos)) {
      ultimosCostos[fila.material_id] = {
        costo: Number(fila.costo_unitario),
        moneda: fila.moneda === 'USD' ? 'USD' : 'MXN',
      };
    }
  }

  return {
    compras,
    proveedores: (proveedoresResp.data ?? []).map((proveedor) => ({
      id: proveedor.id,
      nombre: proveedor.nombre_comercial || proveedor.razon_social || '—',
    })),
    ordenes: (ordenesResp.data ?? []).map((orden) => ({
      id: orden.id,
      folio: orden.folio,
      folioSii: orden.folio_sii ?? null,
    })),
    materiales: (materialesResp.data ?? []).map((material) => ({
      id: material.id,
      codigo: material.codigo,
      nombre: material.nombre,
    })),
    ultimosCostos,
  };
}

export type PagoCompra = {
  id: string;
  monto: number;
  fechaPago: string;
  metodoPago: string;
  referencia: string | null;
};

/** Pagos de una compra, más recientes primero. */
export async function obtenerPagosCompra(
  cliente: SupabaseClient<Database>,
  compraId: string,
): Promise<PagoCompra[]> {
  const { data, error } = await cliente
    .from('pagos_compra')
    .select('id, monto, fecha_pago, metodo_pago, referencia')
    .eq('compra_id', compraId)
    .order('fecha_pago', { ascending: false });
  if (error) throw new Error('No se pudieron cargar los pagos de la compra');
  return (data ?? []).map((pago) => ({
    id: pago.id,
    monto: Number(pago.monto),
    fechaPago: pago.fecha_pago,
    metodoPago: pago.metodo_pago,
    referencia: pago.referencia ?? null,
  }));
}
