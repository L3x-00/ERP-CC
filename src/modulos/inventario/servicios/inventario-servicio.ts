import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import type { ResultadoPaginado } from '@/compartido/tipos/indice';
import { sanitizarTerminoBusqueda } from '@/compartido/utilidades/buscar';
import {
  filaAMaterial,
  filaAMovimientoInventario,
  type CategoriaMaterial,
  type Material,
  type MovimientoInventario,
  type TipoMovimiento,
} from '@/modulos/inventario/tipos/inventario';
import type { CrearMaterialInput } from '@/modulos/inventario/validaciones/inventario';
import {
  convertirCompraAControl,
  costoControlDesdeCompra,
  stockSuficiente,
} from '@/modulos/inventario/servicios/calculos-inventario';

/** Materiales por página en la lista principal. */
export const MATERIALES_POR_PAGINA = 25;

/** Movimientos por página en el historial (kardex). */
export const MOVIMIENTOS_POR_PAGINA = 50;

/** Códigos de error de negocio del inventario (para respuestas genéricas + auditoría). */
export type CodigoErrorInventario =
  | 'stock_insuficiente'
  | 'material_inexistente'
  | 'codigo_duplicado'
  | 'desconocido';

/** Error de negocio del inventario con código estable (no se muestra crudo al usuario). */
export class ErrorInventario extends Error {
  constructor(
    public readonly codigo: CodigoErrorInventario,
    mensaje?: string,
  ) {
    super(mensaje ?? codigo);
    this.name = 'ErrorInventario';
  }
}

/** Filtros de la lista de materiales. */
export type FiltrosMateriales = {
  categoria?: CategoriaMaterial;
  proveedorId?: string;
  /** Texto libre: código o nombre. */
  busqueda?: string;
  pagina?: number;
};

/**
 * Lista materiales paginados (A-Z por nombre) con filtros. El alcance de lectura
 * lo impone RLS.
 */
export async function obtenerMaterialesServicio(
  cliente: SupabaseClient<Database>,
  filtros?: FiltrosMateriales,
): Promise<ResultadoPaginado<Material>> {
  const pagina = Math.max(1, filtros?.pagina ?? 1);
  const desde = (pagina - 1) * MATERIALES_POR_PAGINA;
  const hasta = desde + MATERIALES_POR_PAGINA - 1;

  let consulta = cliente.from('materiales').select('*', { count: 'exact' });

  if (filtros?.categoria) {
    consulta = consulta.eq('categoria', filtros.categoria);
  }
  if (filtros?.proveedorId) {
    consulta = consulta.eq('proveedor_id', filtros.proveedorId);
  }
  if (filtros?.busqueda) {
    const termino = sanitizarTerminoBusqueda(filtros.busqueda);
    if (termino) {
      consulta = consulta.or(`codigo.ilike.%${termino}%,nombre.ilike.%${termino}%`);
    }
  }

  const { data, error, count } = await consulta
    .order('nombre', { ascending: true })
    .range(desde, hasta);

  if (error) {
    throw new Error('No se pudieron cargar los materiales');
  }

  return {
    registros: (data ?? []).map(filaAMaterial),
    total: count ?? 0,
    pagina,
    porPagina: MATERIALES_POR_PAGINA,
  };
}

/** Filtros del historial de movimientos (kardex). */
export type FiltrosMovimientos = {
  materialId?: string;
  tipo?: TipoMovimiento;
  pagina?: number;
};

/**
 * Lista el historial de movimientos de inventario, más reciente primero. El
 * alcance de lectura lo impone RLS. Filtrable por material y tipo.
 */
export async function obtenerMovimientosServicio(
  cliente: SupabaseClient<Database>,
  filtros?: FiltrosMovimientos,
): Promise<ResultadoPaginado<MovimientoInventario>> {
  const pagina = Math.max(1, filtros?.pagina ?? 1);
  const desde = (pagina - 1) * MOVIMIENTOS_POR_PAGINA;
  const hasta = desde + MOVIMIENTOS_POR_PAGINA - 1;

  let consulta = cliente.from('movimientos_inventario').select('*', { count: 'exact' });

  if (filtros?.materialId) {
    consulta = consulta.eq('material_id', filtros.materialId);
  }
  if (filtros?.tipo) {
    consulta = consulta.eq('tipo_movimiento', filtros.tipo);
  }

  const { data, error, count } = await consulta
    .order('creado_en', { ascending: false })
    .range(desde, hasta);

  if (error) {
    throw new Error('No se pudo cargar el historial de movimientos');
  }

  return {
    registros: (data ?? []).map(filaAMovimientoInventario),
    total: count ?? 0,
    pagina,
    porPagina: MOVIMIENTOS_POR_PAGINA,
  };
}

/**
 * Crea un material. El costo por unidad de control inicial se deriva del costo
 * de compra y el factor de conversión; el stock arranca en 0 (se mueve solo por
 * `registrarMovimientoServicio`). Requiere cliente admin (service_role).
 */
export async function crearMaterialServicio(
  admin: SupabaseClient<Database>,
  datos: CrearMaterialInput,
): Promise<Material> {
  const costoControl = costoControlDesdeCompra(datos.costoUnitarioCompra, datos.factorConversion);

  const { data, error } = await admin
    .from('materiales')
    .insert({
      codigo: datos.codigo,
      nombre: datos.nombre,
      descripcion: datos.descripcion ?? null,
      categoria: datos.categoria,
      unidad_compra: datos.unidadCompra,
      unidad_control: datos.unidadControl,
      factor_conversion: datos.factorConversion,
      costo_unitario_compra: datos.costoUnitarioCompra,
      costo_unitario_control: costoControl,
      stock_minimo_control: datos.stockMinimoControl,
      proveedor_id: datos.proveedorId ?? null,
      factor_merma_porcentaje: datos.factorMermaPorcentaje,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new ErrorInventario('codigo_duplicado');
    }
    throw new ErrorInventario('desconocido', error.message);
  }
  return filaAMaterial(data);
}

/** Entrada de compra: agrega stock y recalcula CPP. */
export type EntradaCompraInput = {
  tipo: 'entrada_compra';
  materialId: string;
  cantidadCompra: number;
  costoUnitarioCompra: number;
  referenciaExterna?: string;
  notas?: string;
  operadorId?: string;
};

/** Salida a producción: descuenta stock (bloquea si es insuficiente). */
export type SalidaProduccionInput = {
  tipo: 'salida_produccion';
  materialId: string;
  cantidadControl: number;
  ordenId?: string;
  notas?: string;
  operadorId?: string;
};

export type MovimientoInput = EntradaCompraInput | SalidaProduccionInput;

/**
 * Registra un movimiento de inventario de forma atómica.
 *
 * La conversión de unidades y el costo entrante por unidad de control se calculan
 * aquí (deterministas); la mutación crítica —lock del material, prohibición de
 * stock negativo, CPP, folio y kardex— la ejecuta la función Postgres
 * `registrar_movimiento_inventario` en una sola transacción. Para salidas se hace
 * una guardia previa de stock (rápida) además de la del servidor. Requiere
 * cliente admin (service_role, único con EXECUTE sobre la RPC).
 *
 * @throws ErrorInventario con código estable ('stock_insuficiente', etc.).
 */
export async function registrarMovimientoServicio(
  admin: SupabaseClient<Database>,
  entrada: MovimientoInput,
): Promise<MovimientoInventario> {
  const { data: filaMaterial, error: errorMaterial } = await admin
    .from('materiales')
    .select('*')
    .eq('id', entrada.materialId)
    .maybeSingle();

  if (errorMaterial) {
    throw new ErrorInventario('desconocido', errorMaterial.message);
  }
  if (!filaMaterial) {
    throw new ErrorInventario('material_inexistente');
  }
  const material = filaAMaterial(filaMaterial);

  let argumentos: Database['public']['Functions']['registrar_movimiento_inventario']['Args'];

  if (entrada.tipo === 'entrada_compra') {
    const cantidadControl = convertirCompraAControl(
      entrada.cantidadCompra,
      material.factorConversion,
    );
    const costoControlEntrante = costoControlDesdeCompra(
      entrada.costoUnitarioCompra,
      material.factorConversion,
    );
    argumentos = {
      p_material_id: entrada.materialId,
      p_tipo: 'entrada_compra',
      p_prefijo_folio: 'ENT',
      p_cantidad_control: cantidadControl,
      p_costo_unitario_momento: costoControlEntrante,
      p_cantidad_compra: entrada.cantidadCompra,
      ...(entrada.operadorId ? { p_operador_id: entrada.operadorId } : {}),
      ...(entrada.referenciaExterna ? { p_referencia_externa: entrada.referenciaExterna } : {}),
      ...(entrada.notas ? { p_notas: entrada.notas } : {}),
    };
  } else {
    // Guardia previa (la garantía real la da el lock en la RPC).
    if (!stockSuficiente(material.stockActualControl, entrada.cantidadControl)) {
      throw new ErrorInventario('stock_insuficiente');
    }
    argumentos = {
      p_material_id: entrada.materialId,
      p_tipo: 'salida_produccion',
      p_prefijo_folio: 'SAL',
      p_cantidad_control: entrada.cantidadControl,
      p_costo_unitario_momento: material.costoUnitarioControl,
      ...(entrada.ordenId ? { p_orden_id: entrada.ordenId } : {}),
      ...(entrada.operadorId ? { p_operador_id: entrada.operadorId } : {}),
      ...(entrada.notas ? { p_notas: entrada.notas } : {}),
    };
  }

  const { data: idMovimiento, error } = await admin.rpc(
    'registrar_movimiento_inventario',
    argumentos,
  );

  if (error) {
    if (error.message.includes('stock_insuficiente')) {
      throw new ErrorInventario('stock_insuficiente');
    }
    if (error.message.includes('material_inexistente')) {
      throw new ErrorInventario('material_inexistente');
    }
    throw new ErrorInventario('desconocido', error.message);
  }
  if (!idMovimiento) {
    throw new ErrorInventario('desconocido');
  }

  const { data: filaMov, error: errorMov } = await admin
    .from('movimientos_inventario')
    .select('*')
    .eq('id', idMovimiento)
    .single();

  if (errorMov || !filaMov) {
    throw new ErrorInventario('desconocido', errorMov?.message);
  }
  return filaAMovimientoInventario(filaMov);
}
