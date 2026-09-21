import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/compartido/tipos/supabase';
import {
  filaAGasto,
  type CalculoRentabilidadOrden,
  type ComponenteRentabilidad,
  type FilaGasto,
  type Gasto,
} from '@/modulos/gastos/tipos/gastos';
import type {
  CambiarEstadoGastoInput,
  ConsultarGastosInput,
  RegistrarGastoInput,
} from '@/modulos/gastos/validaciones/gastos';

export type CodigoErrorGastos =
  | 'gasto_inexistente'
  | 'orden_inexistente'
  | 'proveedor_inexistente'
  | 'usuario_sin_permiso'
  | 'estado_invalido'
  | 'conflicto_version'
  | 'desconocido';

export class ErrorGastos extends Error {
  constructor(public readonly codigo: CodigoErrorGastos, mensaje?: string) {
    super(mensaje ?? codigo);
    this.name = 'ErrorGastos';
  }
}

function codigoDesdeMensaje(mensaje: string | undefined): CodigoErrorGastos {
  if (!mensaje) return 'desconocido';
  if (mensaje.includes('gasto_inexistente')) return 'gasto_inexistente';
  if (mensaje.includes('orden_inexistente')) return 'orden_inexistente';
  if (mensaje.includes('proveedor_inexistente')) return 'proveedor_inexistente';
  if (mensaje.includes('usuario_sin_permiso')) return 'usuario_sin_permiso';
  if (mensaje.includes('estado') || mensaje.includes('transicion')) return 'estado_invalido';
  if (mensaje.includes('version_obsoleta')) return 'conflicto_version';
  return 'desconocido';
}

function lanzarError(mensaje: string | undefined): never {
  throw new ErrorGastos(codigoDesdeMensaje(mensaje), mensaje);
}

function jsonSeguro(valor: Record<string, unknown> | null | undefined): Json | null {
  if (!valor) return null;
  try {
    const serializado = JSON.stringify(valor);
    if (!serializado) return null;
    return JSON.parse(serializado) as Json;
  } catch {
    throw new ErrorGastos('desconocido');
  }
}

function numeroSeguro(valor: number | null | undefined): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
}

/** Registra el gasto mediante una RPC que genera el folio y valida invariantes en Postgres. */
export async function registrarGastoServicio(
  admin: SupabaseClient<Database>,
  entrada: RegistrarGastoInput,
  usuarioId: string,
): Promise<Gasto> {
  // Los parámetros SQL sin DEFAULT se generan como no nulos, pero la RPC acepta
  // null en los campos opcionales (los valida por dentro); de ahí la conversión.
  const argumentos = {
    p_orden_id: entrada.ordenId ?? null,
    p_proveedor_id: entrada.proveedorId ?? null,
    p_cuenta_bancaria_id: entrada.cuentaBancariaId ?? null,
    p_categoria: entrada.categoria,
    p_descripcion: entrada.descripcion,
    p_monto_subtotal: entrada.montoSubtotal,
    p_monto_iva: entrada.montoIva,
    p_monto_total: entrada.montoTotal,
    p_moneda: entrada.moneda,
    p_tipo_cambio: entrada.tipoCambio,
    p_fecha_gasto: entrada.fechaGasto,
    p_fecha_vencimiento: entrada.fechaVencimiento ?? null,
    p_comprobante_url: entrada.comprobanteUrl ?? null,
    p_folio_comprobante: entrada.folioComprobante ?? null,
    p_metodo_pago: entrada.metodoPago ?? null,
    p_datos_ocr_json: jsonSeguro(entrada.datosOcrJson),
    p_notas: entrada.notas ?? null,
    p_creado_por: usuarioId,
  } as unknown as Database['public']['Functions']['registrar_gasto']['Args'];

  const { data, error } = await admin.rpc('registrar_gasto', argumentos);
  if (error) lanzarError(error.message);
  const fila = data?.[0];
  if (!fila) throw new ErrorGastos('desconocido');
  return filaAGasto(fila);
}

/** Cambia el estado con compare-and-set dentro de PostgreSQL. */
export async function cambiarEstadoGastoServicio(
  admin: SupabaseClient<Database>,
  entrada: CambiarEstadoGastoInput,
  usuarioId: string,
): Promise<Gasto> {
  const argumentos = {
    p_gasto_id: entrada.gastoId,
    p_nuevo_estado: entrada.nuevoEstado,
    p_usuario_id: usuarioId,
    ...(entrada.estadoEsperado ? { p_estado_esperado: entrada.estadoEsperado } : {}),
  };
  const { data, error } = await admin.rpc('cambiar_estado_gasto', argumentos);
  if (error) lanzarError(error.message);
  const fila = data?.[0];
  if (!fila) throw new ErrorGastos('desconocido');
  return filaAGasto(fila);
}

/** Consulta bajo el cliente de sesión; RLS decide qué información financiera ve el usuario. */
export async function consultarGastosServicio(
  cliente: SupabaseClient<Database>,
  filtros: ConsultarGastosInput,
): Promise<Gasto[]> {
  let consulta = cliente
    .from('gastos')
    .select('*, ordenes_produccion(folio)')
    .order('fecha_gasto', { ascending: false });
  if (filtros.ordenId) consulta = consulta.eq('orden_id', filtros.ordenId);
  if (filtros.proveedorId) consulta = consulta.eq('proveedor_id', filtros.proveedorId);
  if (filtros.categorias?.length) consulta = consulta.in('categoria', filtros.categorias);
  if (filtros.estados?.length) consulta = consulta.in('estado_pago', filtros.estados);
  if (filtros.moneda) consulta = consulta.eq('moneda', filtros.moneda);
  if (filtros.desde) {
    const inicio = filtros.desde.length === 10
      ? `${filtros.desde}T00:00:00.000Z`
      : filtros.desde;
    consulta = consulta.gte('fecha_gasto', inicio);
  }
  if (filtros.hasta) {
    if (filtros.hasta.length === 10) {
      const finExclusivo = new Date(`${filtros.hasta}T00:00:00.000Z`);
      finExclusivo.setUTCDate(finExclusivo.getUTCDate() + 1);
      consulta = consulta.lt('fecha_gasto', finExclusivo.toISOString());
    } else {
      consulta = consulta.lte('fecha_gasto', filtros.hasta);
    }
  }
  if (filtros.busqueda) {
    const termino = filtros.busqueda.replace(/[\\%_]/g, '').trim();
    if (termino) consulta = consulta.ilike('descripcion', `%${termino}%`);
  }
  const { data, error } = await consulta;
  if (error) throw new ErrorGastos('desconocido', error.message);
  return (data ?? []).map((fila) => {
    const { ordenes_produccion, ...base } = fila;
    return {
      ...filaAGasto(base as FilaGasto),
      ordenFolio: ordenes_produccion?.folio ?? null,
    };
  });
}

function componentesFaltantes(
  fila: {
    monto_venta_mxn: number;
    materiales_considerados: number;
    sesiones_consideradas: number;
    gastos_considerados: number;
  },
): ComponenteRentabilidad[] {
  const faltantes: ComponenteRentabilidad[] = [];
  if (numeroSeguro(fila.monto_venta_mxn) <= 0) faltantes.push('ingreso');
  if (numeroSeguro(fila.materiales_considerados) === 0) faltantes.push('materiales');
  if (numeroSeguro(fila.sesiones_consideradas) === 0) faltantes.push('mano_obra');
  if (numeroSeguro(fila.gastos_considerados) === 0) faltantes.push('gastos');
  return faltantes;
}

/** Consulta el agregado transaccional de rentabilidad en MXN. */
export async function obtenerRentabilidadOrdenServicio(
  admin: SupabaseClient<Database>,
  ordenId: string,
): Promise<CalculoRentabilidadOrden> {
  const { data, error } = await admin.rpc('obtener_rentabilidad_orden', { p_orden_id: ordenId });
  if (error) lanzarError(error.message);
  const fila = data?.[0];
  if (!fila) throw new ErrorGastos('orden_inexistente');
  return {
    ordenId: fila.orden_id,
    moneda: 'MXN',
    ingresoMxn: numeroSeguro(fila.monto_venta_mxn),
    costoMaterialesMxn: numeroSeguro(fila.costo_materiales_mxn),
    costoManoObraMxn: numeroSeguro(fila.costo_mano_obra_mxn),
    costoGastosDirectosMxn: numeroSeguro(fila.costo_gastos_directos_mxn),
    costoTotalMxn: numeroSeguro(fila.costo_total_mxn),
    utilidadBrutaMxn: numeroSeguro(fila.utilidad_bruta_mxn),
    margenPorcentaje: fila.margen_porcentaje === null ? null : numeroSeguro(fila.margen_porcentaje),
    margenCalculable: fila.margen_calculable,
    materialesConsiderados: numeroSeguro(fila.materiales_considerados),
    sesionesConsideradas: numeroSeguro(fila.sesiones_consideradas),
    sesionesSinTarifa: numeroSeguro(fila.sesiones_sin_tarifa),
    gastosConsiderados: numeroSeguro(fila.gastos_considerados),
    gastosExcluidos: numeroSeguro(fila.gastos_excluidos),
    componentesFaltantes: componentesFaltantes(fila),
  };
}

/** Mensaje saneado que puede cruzar la frontera hacia la interfaz. */
export function mensajeErrorGastos(error: unknown): string {
  if (error instanceof ErrorGastos) {
    const mensajes: Partial<Record<CodigoErrorGastos, string>> = {
      gasto_inexistente: 'El gasto ya no existe',
      orden_inexistente: 'La orden indicada no existe',
      proveedor_inexistente: 'El proveedor indicado no existe',
      usuario_sin_permiso: 'No tienes permiso para operar gastos',
      estado_invalido: 'La transición del gasto no está permitida',
      conflicto_version: 'El gasto cambió en otra pantalla; vuelve a consultar',
    };
    return mensajes[error.codigo] ?? 'No se pudo procesar el gasto';
  }
  return 'No se pudo procesar el gasto';
}
