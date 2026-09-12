import type { Json } from '@/compartido/tipos/supabase';

export type MonedaCuenta = 'MXN' | 'USD';

export interface ConfiguracionEmpresa {
  nombre: string;
  razonSocial: string;
  rfc: string;
  direccion: string;
  telefono: string;
  email: string;
  logoUrl: string | null;
}

export interface TarifasCotizadorConfig {
  costoHoraDefault: number;
  segundosPorPierce: number;
  factorEficienciaLaser: number;
  factorMermaMaterial: number;
  margenUtilidadDefault: number;
}

export interface PlantillaDocumentoConfig {
  colorAcento: string;
  terminosCondiciones: string;
  textoPiePagina: string;
  textoEncabezado: string;
}

export type PlantillasDocumentoConfig = Record<string, PlantillaDocumentoConfig>;

export interface CuentaBancaria {
  id: string;
  banco: string;
  numeroCuenta: string;
  clabe: string | null;
  moneda: MonedaCuenta;
  titular: string;
  activa: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

export interface AreaTrabajoConfig {
  id: string;
  codigo: string;
  nombre: string;
  colorHex: string;
  costoHoraInterno: number;
  tarifaHoraVenta: number;
  esExterno: boolean;
  activo: boolean;
  orden: number;
  creadoEn: string;
  actualizadoEn: string;
}

export interface ConfiguracionSistema {
  id: 'main';
  empresa: ConfiguracionEmpresa;
  tarifas: TarifasCotizadorConfig;
  plantillasDoc: PlantillasDocumentoConfig;
  tipoCambioUsd: number;
  ivaPorcentajeDefault: number;
  actualizadoPor: string | null;
  actualizadoEn: string;
}

/** Fila de configuración que llega desde Supabase (snake_case). */
export interface FilaConfiguracionSistema {
  id: string;
  empresa_json: Json;
  tarifas_json: Json;
  plantillas_doc_json: Json;
  tipo_cambio_usd: number | string;
  iva_porcentaje_default: number | string;
  actualizado_por: string | null;
  actualizado_en: string;
}

export interface FilaCuentaBancaria {
  id: string;
  banco: string;
  numero_cuenta: string;
  clabe: string | null;
  moneda: string;
  titular: string;
  activa: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface FilaAreaTrabajoConfig {
  id: string;
  codigo: string;
  nombre: string;
  color_hex: string;
  costo_hora_interno: number | string;
  tarifa_hora_venta: number | string;
  es_externo: boolean;
  activo: boolean;
  orden: number;
  creado_en: string;
  actualizado_en: string;
}

export const CONFIGURACION_EMPRESA_DEFECTO: ConfiguracionEmpresa = {
  nombre: 'CC Manufacturing Group',
  razonSocial: 'CC Manufacturing Group, S. de R.L. de C.V.',
  rfc: 'XAXX010101000',
  direccion: 'Tijuana, Baja California, México',
  telefono: '',
  email: '',
  logoUrl: null,
};

export const TARIFAS_COTIZADOR_DEFECTO: TarifasCotizadorConfig = {
  costoHoraDefault: 650,
  segundosPorPierce: 8,
  factorEficienciaLaser: 0.85,
  factorMermaMaterial: 0.08,
  margenUtilidadDefault: 30,
};

export const PLANTILLA_DOCUMENTO_DEFECTO: PlantillaDocumentoConfig = {
  colorAcento: '#1D4ED8',
  terminosCondiciones: 'Precios sujetos a confirmación de materiales y alcance.',
  textoPiePagina: 'CC Manufacturing Group · Tijuana, Baja California, México',
  textoEncabezado: 'ORCA MFG ERP',
};

export const TIPO_CAMBIO_USD_DEFECTO = 20;
export const IVA_PORCENTAJE_DEFECTO = 16;

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function textoSeguro(valor: unknown, respaldo: string): string {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : respaldo;
}

function textoOpcional(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null;
}

function numeroSeguro(valor: unknown, respaldo: number, minimo = 0): number {
  const numero =
    typeof valor === 'number'
      ? valor
      : typeof valor === 'string' && valor.trim() !== ''
        ? Number(valor)
        : NaN;
  return Number.isFinite(numero) && numero >= minimo ? numero : respaldo;
}

function monedaSegura(valor: string): MonedaCuenta {
  return valor === 'USD' ? 'USD' : 'MXN';
}

function plantillaDesde(valor: unknown): PlantillaDocumentoConfig {
  const objeto = esObjeto(valor) ? valor : {};
  return {
    colorAcento: /^#[0-9A-Fa-f]{6}$/.test(String(objeto.colorAcento ?? ''))
      ? String(objeto.colorAcento)
      : PLANTILLA_DOCUMENTO_DEFECTO.colorAcento,
    terminosCondiciones: textoSeguro(
      objeto.terminosCondiciones,
      PLANTILLA_DOCUMENTO_DEFECTO.terminosCondiciones,
    ),
    textoPiePagina: textoSeguro(objeto.textoPiePagina, PLANTILLA_DOCUMENTO_DEFECTO.textoPiePagina),
    textoEncabezado: textoSeguro(objeto.textoEncabezado, PLANTILLA_DOCUMENTO_DEFECTO.textoEncabezado),
  };
}

function empresaDesde(valor: Json): ConfiguracionEmpresa {
  const objeto = esObjeto(valor) ? valor : {};
  return {
    nombre: textoSeguro(objeto.nombre, CONFIGURACION_EMPRESA_DEFECTO.nombre),
    razonSocial: textoSeguro(objeto.razonSocial, CONFIGURACION_EMPRESA_DEFECTO.razonSocial),
    rfc: textoSeguro(objeto.rfc, CONFIGURACION_EMPRESA_DEFECTO.rfc),
    direccion: textoSeguro(objeto.direccion, CONFIGURACION_EMPRESA_DEFECTO.direccion),
    telefono: typeof objeto.telefono === 'string' ? objeto.telefono.trim() : CONFIGURACION_EMPRESA_DEFECTO.telefono,
    email: typeof objeto.email === 'string' ? objeto.email.trim() : CONFIGURACION_EMPRESA_DEFECTO.email,
    logoUrl: textoOpcional(objeto.logoUrl),
  };
}

function tarifasDesde(valor: Json): TarifasCotizadorConfig {
  const objeto = esObjeto(valor) ? valor : {};
  return {
    costoHoraDefault: numeroSeguro(objeto.costoHoraDefault, TARIFAS_COTIZADOR_DEFECTO.costoHoraDefault),
    segundosPorPierce: numeroSeguro(objeto.segundosPorPierce, TARIFAS_COTIZADOR_DEFECTO.segundosPorPierce, 0.01),
    factorEficienciaLaser: numeroSeguro(
      objeto.factorEficienciaLaser,
      TARIFAS_COTIZADOR_DEFECTO.factorEficienciaLaser,
      0.01,
    ),
    factorMermaMaterial: numeroSeguro(objeto.factorMermaMaterial, TARIFAS_COTIZADOR_DEFECTO.factorMermaMaterial),
    margenUtilidadDefault: numeroSeguro(objeto.margenUtilidadDefault, TARIFAS_COTIZADOR_DEFECTO.margenUtilidadDefault),
  };
}

function plantillasDesde(valor: Json): PlantillasDocumentoConfig {
  if (!esObjeto(valor)) return { T1: { ...PLANTILLA_DOCUMENTO_DEFECTO } };

  const claves = Object.keys(valor);
  const parecePlantillaRaiz = claves.some((clave) =>
    ['colorAcento', 'terminosCondiciones', 'textoPiePagina', 'textoEncabezado'].includes(clave),
  );
  if (parecePlantillaRaiz) return { T1: plantillaDesde(valor) };

  const plantillas: PlantillasDocumentoConfig = {};
  for (const clave of claves) {
    if (esObjeto(valor[clave])) plantillas[clave] = plantillaDesde(valor[clave]);
  }
  return Object.keys(plantillas).length > 0
    ? plantillas
    : { T1: { ...PLANTILLA_DOCUMENTO_DEFECTO } };
}

/** Mapea y normaliza una fila del singleton sin exponer JSONB desconocido. */
export function filaAConfiguracionSistema(fila: FilaConfiguracionSistema): ConfiguracionSistema {
  if (fila.id !== 'main') throw new Error('La configuración singleton tiene un identificador inválido');
  return {
    id: 'main',
    empresa: empresaDesde(fila.empresa_json),
    tarifas: tarifasDesde(fila.tarifas_json),
    plantillasDoc: plantillasDesde(fila.plantillas_doc_json),
    tipoCambioUsd: numeroSeguro(fila.tipo_cambio_usd, TIPO_CAMBIO_USD_DEFECTO, 0.0001),
    ivaPorcentajeDefault: numeroSeguro(fila.iva_porcentaje_default, IVA_PORCENTAJE_DEFECTO),
    actualizadoPor: fila.actualizado_por,
    actualizadoEn: fila.actualizado_en,
  };
}

/** Convierte una cuenta bancaria de Supabase al contrato público del módulo. */
export function filaACuentaBancaria(fila: FilaCuentaBancaria): CuentaBancaria {
  return {
    id: fila.id,
    banco: fila.banco,
    numeroCuenta: fila.numero_cuenta,
    clabe: fila.clabe,
    moneda: monedaSegura(fila.moneda),
    titular: fila.titular,
    activa: fila.activa,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

/** Convierte un área de trabajo de Supabase al contrato público del módulo. */
export function filaAAreaTrabajo(fila: FilaAreaTrabajoConfig): AreaTrabajoConfig {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    colorHex: fila.color_hex,
    costoHoraInterno: numeroSeguro(fila.costo_hora_interno, 0),
    tarifaHoraVenta: numeroSeguro(fila.tarifa_hora_venta, 0),
    esExterno: fila.es_externo,
    activo: fila.activo,
    orden: fila.orden,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}
