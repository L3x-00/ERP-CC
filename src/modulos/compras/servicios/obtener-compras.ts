import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import {
  filaACompra,
  type CompraCola,
  type OrdenOpcion,
  type ProveedorOpcion,
} from '@/modulos/compras/tipos/indice';

export type ColaCompras = {
  compras: CompraCola[];
  proveedores: ProveedorOpcion[];
  ordenes: OrdenOpcion[];
};

/** SII-B8 F4: cola de compras con proveedor/orden legibles y catálogos del alta. */
export async function obtenerColaCompras(
  cliente: SupabaseClient<Database>,
  limite = 200,
): Promise<ColaCompras> {
  const [comprasResp, proveedoresResp, ordenesResp] = await Promise.all([
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
