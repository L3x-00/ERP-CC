import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import type { ResultadoPaginado } from '@/compartido/tipos/indice';
import { sanitizarTerminoBusqueda } from '@/compartido/utilidades/buscar';
import { filaAProveedor, type Proveedor } from '@/modulos/inventario/tipos/inventario';
import type { CrearProveedorInput } from '@/modulos/inventario/validaciones/inventario';
import { ErrorInventario } from '@/modulos/inventario/servicios/inventario-servicio';

/** Proveedores por página. */
export const PROVEEDORES_POR_PAGINA = 25;

type ActualizacionProveedor = Database['public']['Tables']['proveedores']['Update'];

/** Filtros de la lista de proveedores. */
export type FiltrosProveedores = {
  /** Texto libre: nombre comercial, razón social o RFC. */
  busqueda?: string;
  pagina?: number;
};

/** Lista proveedores paginados (A-Z por nombre comercial). Alcance por RLS. */
export async function obtenerProveedoresServicio(
  cliente: SupabaseClient<Database>,
  filtros?: FiltrosProveedores,
): Promise<ResultadoPaginado<Proveedor>> {
  const pagina = Math.max(1, filtros?.pagina ?? 1);
  const desde = (pagina - 1) * PROVEEDORES_POR_PAGINA;
  const hasta = desde + PROVEEDORES_POR_PAGINA - 1;

  let consulta = cliente.from('proveedores').select('*', { count: 'exact' });

  if (filtros?.busqueda) {
    const termino = sanitizarTerminoBusqueda(filtros.busqueda);
    if (termino) {
      consulta = consulta.or(
        `nombre_comercial.ilike.%${termino}%,razon_social.ilike.%${termino}%,rfc.ilike.%${termino}%`,
      );
    }
  }

  const { data, error, count } = await consulta
    .order('nombre_comercial', { ascending: true })
    .range(desde, hasta);

  if (error) {
    throw new Error('No se pudieron cargar los proveedores');
  }

  return {
    registros: (data ?? []).map(filaAProveedor),
    total: count ?? 0,
    pagina,
    porPagina: PROVEEDORES_POR_PAGINA,
  };
}

/** Carga un proveedor por id, o null si no existe/no es visible. */
export async function obtenerProveedorPorIdServicio(
  cliente: SupabaseClient<Database>,
  id: string,
): Promise<Proveedor | null> {
  const { data, error } = await cliente
    .from('proveedores')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error('No se pudo cargar el proveedor');
  }
  return data ? filaAProveedor(data) : null;
}

/** Crea un proveedor. Requiere cliente admin (service_role). */
export async function crearProveedorServicio(
  admin: SupabaseClient<Database>,
  datos: CrearProveedorInput,
): Promise<Proveedor> {
  const { data, error } = await admin
    .from('proveedores')
    .insert({
      nombre_comercial: datos.nombreComercial,
      razon_social: datos.razonSocial ?? null,
      rfc: datos.rfc ? datos.rfc : null,
      contacto_nombre: datos.contactoNombre,
      correo: datos.correo.toLowerCase(),
      telefono: datos.telefono,
      direccion: datos.direccion ?? null,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new ErrorInventario('codigo_duplicado', 'RFC de proveedor duplicado');
    }
    throw new ErrorInventario('desconocido', error.message);
  }
  return filaAProveedor(data);
}

/** Actualiza campos de un proveedor (edición parcial). Requiere cliente admin. */
export async function actualizarProveedorServicio(
  admin: SupabaseClient<Database>,
  id: string,
  cambios: Partial<CrearProveedorInput>,
): Promise<Proveedor> {
  const parche: ActualizacionProveedor = {};
  if (cambios.nombreComercial !== undefined) parche.nombre_comercial = cambios.nombreComercial;
  if (cambios.razonSocial !== undefined) parche.razon_social = cambios.razonSocial ?? null;
  if (cambios.rfc !== undefined) parche.rfc = cambios.rfc ? cambios.rfc : null;
  if (cambios.contactoNombre !== undefined) parche.contacto_nombre = cambios.contactoNombre;
  if (cambios.correo !== undefined) parche.correo = cambios.correo.toLowerCase();
  if (cambios.telefono !== undefined) parche.telefono = cambios.telefono;
  if (cambios.direccion !== undefined) parche.direccion = cambios.direccion ?? null;

  const { data, error } = await admin
    .from('proveedores')
    .update(parche)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new ErrorInventario('codigo_duplicado', 'RFC de proveedor duplicado');
    }
    throw new ErrorInventario('desconocido', error.message);
  }
  return filaAProveedor(data);
}
