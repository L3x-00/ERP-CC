import type { SupabaseClient } from '@supabase/supabase-js';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import type { Database, Json } from '@/compartido/tipos/supabase';
import {
  filaAAreaTrabajo,
  filaAConfiguracionSistema,
  filaACuentaBancaria,
  type AreaTrabajoConfig,
  type ConfiguracionSistema,
  type CuentaBancaria,
  type FilaAreaTrabajoConfig,
  type FilaConfiguracionSistema,
  type FilaCuentaBancaria,
} from '@/modulos/configuracion/tipos/indice';
import type {
  AreaTrabajoInput,
  GuardarCuentaBancariaInput,
} from '@/modulos/configuracion/validaciones/indice';
import {
  CATALOGO_CATEGORIAS_GASTO_DEFECTO,
  CONFIGURACION_EMPRESA_DEFECTO,
  IVA_PORCENTAJE_DEFECTO,
  PLANTILLA_DOCUMENTO_DEFECTO,
  TARIFAS_COTIZADOR_DEFECTO,
  TIPO_CAMBIO_USD_DEFECTO,
} from '@/modulos/configuracion/tipos/indice';
import { CATALOGO_TIERS_DEFECTO } from '@/modulos/clientes/tipos/indice';

export type ClienteConfiguracion = SupabaseClient<Database>;
export type SeccionConfiguracion = 'empresa' | 'tarifas' | 'plantillas' | 'tiers' | 'categorias' | 'tipo_cambio' | 'iva';

const FECHA_EPOCA = new Date(0).toISOString();

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/**
 * Combina la fila del singleton con valores seguros para instalaciones que
 * aún no tienen todos los campos JSONB de la versión vigente.
 */
export function combinarConfiguracion(
  fila: FilaConfiguracionSistema | null | undefined,
): ConfiguracionSistema {
  if (!fila) {
    return {
      id: 'main',
      empresa: { ...CONFIGURACION_EMPRESA_DEFECTO },
      tarifas: { ...TARIFAS_COTIZADOR_DEFECTO },
      plantillasDoc: { T1: { ...PLANTILLA_DOCUMENTO_DEFECTO } },
      tiers: CATALOGO_TIERS_DEFECTO,
      categoriasGasto: CATALOGO_CATEGORIAS_GASTO_DEFECTO,
      tipoCambioUsd: TIPO_CAMBIO_USD_DEFECTO,
      ivaPorcentajeDefault: IVA_PORCENTAJE_DEFECTO,
      actualizadoPor: null,
      actualizadoEn: FECHA_EPOCA,
    };
  }

  return filaAConfiguracionSistema(fila);
}

function filaDesdeRpc(valor: Json): FilaConfiguracionSistema {
  if (!esObjeto(valor)) throw new Error('La RPC devolvió una configuración inválida');
  const esJson = (campo: unknown): campo is Json => {
    try {
      JSON.stringify(campo);
      return true;
    } catch {
      return false;
    }
  };
  if (
    typeof valor.id !== 'string'
    || !esJson(valor.empresa_json)
    || !esJson(valor.tarifas_json)
    || !esJson(valor.plantillas_doc_json)
    || (typeof valor.tipo_cambio_usd !== 'number' && typeof valor.tipo_cambio_usd !== 'string')
    || (typeof valor.iva_porcentaje_default !== 'number' && typeof valor.iva_porcentaje_default !== 'string')
    || (valor.actualizado_por !== null && typeof valor.actualizado_por !== 'string')
    || typeof valor.actualizado_en !== 'string'
  ) {
    throw new Error('La RPC devolvió campos de configuración inválidos');
  }
  return {
    id: valor.id,
    empresa_json: valor.empresa_json,
    tarifas_json: valor.tarifas_json,
    plantillas_doc_json: valor.plantillas_doc_json,
    tiers_json: esJson(valor.tiers_json) ? valor.tiers_json : {},
    categorias_gasto_json: esJson(valor.categorias_gasto_json) ? valor.categorias_gasto_json : {},
    tipo_cambio_usd: valor.tipo_cambio_usd,
    iva_porcentaje_default: valor.iva_porcentaje_default,
    actualizado_por: valor.actualizado_por,
    actualizado_en: valor.actualizado_en,
  };
}

/** Lee el singleton y aplica fallbacks de contrato en un único punto. */
export async function obtenerConfiguracionGeneral(
  cliente: ClienteConfiguracion = crearClienteSupabaseAdmin(),
): Promise<ConfiguracionSistema> {
  const { data, error } = await cliente
    .from('configuracion_sistema')
    .select('*')
    .eq('id', 'main')
    .maybeSingle();

  if (error) throw error;
  return combinarConfiguracion(data);
}

/**
 * Actualiza solo una sección bajo el lock de la RPC. `datos` es JSON para
 * secciones estructuradas y un número para tipo de cambio/IVA.
 */
export async function actualizarConfiguracionSeccion(
  cliente: ClienteConfiguracion,
  seccion: SeccionConfiguracion,
  datos: Json | null,
  actualizadoPor: string,
): Promise<ConfiguracionSistema> {
  const esSeccionNumerica = seccion === 'tipo_cambio' || seccion === 'iva';
  const valor = esSeccionNumerica && typeof datos === 'number' ? datos : null;
  const json = esSeccionNumerica ? null : datos;
  const { data, error } = await cliente.rpc('actualizar_configuracion_seccion', {
    p_seccion: seccion,
    p_datos: json,
    // El parámetro SQL es nullable (la RPC valida cada sección y exige valor
    // solo en las numéricas); los tipos generados no lo expresan sin DEFAULT.
    p_valor: valor as number,
    p_actualizado_por: actualizadoPor,
  });

  if (error) throw error;
  if (!data) throw new Error('La RPC no devolvió la configuración actualizada');
  return filaAConfiguracionSistema(filaDesdeRpc(data));
}

/** Obtiene el tipo de cambio vigente con fallback defensivo. */
export async function obtenerTipoCambioVigente(
  cliente: ClienteConfiguracion = crearClienteSupabaseAdmin(),
): Promise<number> {
  const configuracion = await obtenerConfiguracionGeneral(cliente);
  return configuracion.tipoCambioUsd;
}

/** Lista cuentas ordenadas sin permitir que el cliente elija columnas sensibles. */
export async function listarCuentasBancarias(
  cliente: ClienteConfiguracion = crearClienteSupabaseAdmin(),
  soloActivas = true,
): Promise<CuentaBancaria[]> {
  let consulta = cliente
    .from('cuentas_bancarias')
    .select('*')
    .order('banco', { ascending: true })
    .order('numero_cuenta', { ascending: true });
  if (soloActivas) consulta = consulta.eq('activa', true);

  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []).map((fila) => filaACuentaBancaria(fila as FilaCuentaBancaria));
}

/** Lista las áreas de producción por orden administrativo y nombre. */
export async function listarAreasTrabajoConfig(
  cliente: ClienteConfiguracion = crearClienteSupabaseAdmin(),
): Promise<AreaTrabajoConfig[]> {
  const { data, error } = await cliente
    .from('areas_trabajo_config')
    .select('*')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((fila) => filaAAreaTrabajo(fila as FilaAreaTrabajoConfig));
}

/** Alta o actualización atómica de una cuenta mediante una sola sentencia. */
export async function guardarCuentaBancariaServicio(
  cliente: ClienteConfiguracion,
  entrada: GuardarCuentaBancariaInput,
): Promise<CuentaBancaria> {
  const payload: Database['public']['Tables']['cuentas_bancarias']['Insert'] = {
    banco: entrada.banco,
    numero_cuenta: entrada.numeroCuenta,
    clabe: entrada.clabe || null,
    moneda: entrada.moneda,
    titular: entrada.titular,
    activa: entrada.activa,
  };

  const consulta = entrada.id
    ? cliente.from('cuentas_bancarias').update(payload).eq('id', entrada.id).select('*').single()
    : cliente.from('cuentas_bancarias').insert(payload).select('*').single();
  const { data, error } = await consulta;
  if (error) throw error;
  return filaACuentaBancaria(data as FilaCuentaBancaria);
}

/** Alta o actualización de tarifas por área; el índice único evita duplicados. */
export async function guardarAreaTrabajoServicio(
  cliente: ClienteConfiguracion,
  entrada: AreaTrabajoInput,
): Promise<AreaTrabajoConfig> {
  const payload: Database['public']['Tables']['areas_trabajo_config']['Insert'] = {
    codigo: entrada.codigo,
    nombre: entrada.nombre,
    color_hex: entrada.colorHex,
    costo_hora_interno: entrada.costoHoraInterno,
    tarifa_hora_venta: entrada.tarifaHoraVenta,
    es_externo: entrada.esExterno,
    activo: entrada.activo,
    orden: entrada.orden,
    // OBS-14: jerarquía y mapeo a las áreas macro de Planeación.
    tipo: entrada.tipo,
    padre_codigo: entrada.padreCodigo ?? null,
    area_planeacion: entrada.areaPlaneacion ?? null,
  };

  const consulta = entrada.id
    ? cliente.from('areas_trabajo_config').update(payload).eq('id', entrada.id).select('*').single()
    : cliente.from('areas_trabajo_config').insert(payload).select('*').single();
  const { data, error } = await consulta;
  if (error) throw error;
  return filaAAreaTrabajo(data as FilaAreaTrabajoConfig);
}

/** OBS-09/PRD-11: operador activo con las áreas que puede atender. */
export type OperadorAreaConfig = {
  id: string;
  nombre: string;
  areas: string[];
};

/** Lista operadores activos y sus áreas habilitadas (códigos del catálogo). */
export async function listarOperadoresAreasServicio(
  cliente: ClienteConfiguracion = crearClienteSupabaseAdmin(),
): Promise<OperadorAreaConfig[]> {
  const [respuestaUsuarios, respuestaAsignaciones] = await Promise.all([
    cliente
      .from('usuarios')
      .select('id, nombre_completo')
      .eq('rol', 'operador')
      .eq('activo', true)
      .order('nombre_completo'),
    cliente.from('operadores_areas').select('operador_id, area_codigo'),
  ]);
  if (respuestaUsuarios.error) throw respuestaUsuarios.error;
  if (respuestaAsignaciones.error) throw respuestaAsignaciones.error;

  const porOperador = new Map<string, string[]>();
  for (const fila of respuestaAsignaciones.data ?? []) {
    const lista = porOperador.get(fila.operador_id) ?? [];
    lista.push(fila.area_codigo);
    porOperador.set(fila.operador_id, lista);
  }

  return (respuestaUsuarios.data ?? []).map((usuario) => ({
    id: usuario.id,
    nombre: usuario.nombre_completo,
    areas: porOperador.get(usuario.id) ?? [],
  }));
}

/**
 * A05: reemplaza las áreas habilitadas de un operador en una sola RPC
 * transaccional. La RPC valida actor, operador y TODOS los códigos antes de
 * escribir y serializa por operador, así que un fallo conserva la asignación
 * anterior en vez de dejar al operador sin restricciones. La lista vacía sigue
 * siendo válida y explícita (transición); el rechazo real de trabajo vive en
 * las RPC de producción. Devuelve el conjunto que quedó almacenado.
 */
export async function actualizarAreasOperadorServicio(
  cliente: ClienteConfiguracion,
  entrada: { operadorId: string; areas: readonly string[] },
  creadoPor: string,
): Promise<string[]> {
  const { data, error } = await cliente.rpc('reemplazar_areas_operador', {
    p_operador_id: entrada.operadorId,
    p_areas: [...entrada.areas],
    p_actor_id: creadoPor,
  });
  if (error) throw error;
  return (data ?? []).map((fila) => fila.area_codigo);
}
