import type { Tables } from '@/compartido/tipos/supabase';

/** Tiers comerciales en orden ascendente de beneficio. */
export const TIERS_CLIENTE = ['bronce', 'plata', 'oro', 'platino'] as const;

/** Tier comercial del cliente (por consumo o asignación manual). */
export type TierCliente = (typeof TIERS_CLIENTE)[number];

/** Estado del ciclo de vida del cliente. */
export type EstadoCliente = 'prospecto' | 'activo' | 'inactivo';

/** Moneda comercial del cliente. */
export type MonedaCliente = 'MXN' | 'USD';

/** Condiciones de pago pactadas. */
export type CondicionesPagoCliente = 'contado' | '15_dias' | '30_dias' | 'credito';

/** Tipos de documento adjuntables a un cliente. */
export type TipoDocumentoCliente =
  | 'csf'
  | 'contrato'
  | 'identificacion'
  | 'comprobante_domicilio'
  | 'otro';

/** Dirección estructurada (se guarda como JSONB en `direccion_fiscal`/`direccion_envio`). */
export type Direccion = {
  calle: string;
  numeroExterior: string;
  numeroInterior: string | null;
  colonia: string;
  municipio: string;
  estado: string;
  codigoPostal: string;
  pais: string;
};

/** Cliente 360° (camelCase; ver mapeo desde FilaCliente). */
export type Cliente = {
  id: string;
  /** Folio humano global CLI-#### (SII-B2.1); nulo solo en filas históricas sin migrar. */
  folio: string | null;
  razonSocial: string;
  nombreComercial: string;
  rfc: string | null;
  contacto: string | null;
  correo: string | null;
  telefono: string | null;
  condicionesPago: CondicionesPagoCliente | null;
  limiteCredito: number;
  saldoAFavor: number;
  /** Moneda comercial (MXN/USD). */
  moneda: MonedaCliente;
  /** Crédito habilitado, sincronizado con `condicionesPago`. */
  creditoHabilitado: boolean;
  /** Días de crédito (1..365 con crédito; null/0 sin crédito). */
  diasCredito: number | null;
  /** Tier base derivado del consumo. El EFECTIVO lo resuelve `calcularTier`. */
  tier: TierCliente;
  tierManual: TierCliente | null;
  tierManualHasta: string | null;
  estado: EstadoCliente;
  direccionFiscal: Direccion | null;
  direccionEnvio: Direccion | null;
  creadoEn: string;
  actualizadoEn: string;
};

/** Documento del cliente en el modelo único `archivos` (metadata versionada). */
export type DocumentoCliente = {
  id: string;
  clienteId: string;
  tipo: TipoDocumentoCliente;
  nombreArchivo: string;
  /** Nombre normalizado del ERP; repetirlo genera una versión nueva. */
  nombreErp: string | null;
  rutaStorage: string;
  mime: string;
  tamanoBytes: number;
  version: number;
  /** `true` si es la versión vigente del documento. */
  vigente: boolean;
  /** Versión anterior que reemplaza esta fila (trazabilidad). */
  reemplazaA: string | null;
  subidoPor: string | null;
  creadoEn: string;
};

/** Contacto adicional del cliente (OBS-02): a lo sumo uno principal activo. */
export interface ContactoCliente {
  id: string;
  clienteId: string;
  nombre: string;
  puesto: string | null;
  correo: string | null;
  telefono: string | null;
  notas: string | null;
  esPrincipal: boolean;
  /** Baja lógica: inactivo conserva historial (SII-B2.3). */
  activo: boolean;
  desactivadoEn: string | null;
  desactivadoPor: string | null;
  creadoPor: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

/** Resultado de la verificación de crédito de un cliente. */
export type ResumenCredito = {
  limite: number;
  saldoAFavor: number;
  usado: number;
  /** Crédito que aún puede consumir (límite + saldo a favor − usado). */
  disponible: number;
  /** `true` si el crédito usado supera el disponible: bloquea nuevas órdenes. */
  excedido: boolean;
};

/**
 * Umbral de consumo acumulado (MXN, últimos 3 meses) para alcanzar cada tier.
 * Bronce es el piso (sin umbral). Único origen de los cortes de negocio.
 */
export const UMBRAL_TIER: Record<TierCliente, number> = {
  bronce: 0,
  plata: 50_000,
  oro: 150_000,
  platino: 300_000,
};

/** Descuento porcentual asociado a cada tier. */
export const DESCUENTO_TIER: Record<TierCliente, number> = {
  bronce: 0,
  plata: 3,
  oro: 5,
  platino: 8,
};

/** Vigencia (en días) de un tier asignado manualmente por un admin. */
export const DIAS_TIER_MANUAL = 90;

/** Umbral y descuento vigentes de un tier (CFG-08: editables en Configuración). */
export interface TierConfig {
  umbralMxn: number;
  descuentoPorcentaje: number;
}

/** Catálogo de tiers resuelto desde `configuracion_sistema.tiers_json`. */
export interface CatalogoTiers {
  diasManual: number;
  tiers: Record<TierCliente, TierConfig>;
}

/** Valores de fábrica: cortes vigentes si no hay catálogo guardado o válido. */
export const CATALOGO_TIERS_DEFECTO: CatalogoTiers = {
  diasManual: DIAS_TIER_MANUAL,
  tiers: {
    bronce: { umbralMxn: UMBRAL_TIER.bronce, descuentoPorcentaje: DESCUENTO_TIER.bronce },
    plata: { umbralMxn: UMBRAL_TIER.plata, descuentoPorcentaje: DESCUENTO_TIER.plata },
    oro: { umbralMxn: UMBRAL_TIER.oro, descuentoPorcentaje: DESCUENTO_TIER.oro },
    platino: { umbralMxn: UMBRAL_TIER.platino, descuentoPorcentaje: DESCUENTO_TIER.platino },
  },
};

// Filas crudas de Supabase (snake_case) derivadas de los tipos generados.
export type FilaCliente = Tables<'clientes'>;
export type FilaArchivoCliente = Tables<'archivos'>;
export type FilaContactoCliente = Tables<'contactos_cliente'>;

/** Convierte una fila de `contactos_cliente` (snake_case) a `ContactoCliente`. */
export function filaAContactoCliente(fila: FilaContactoCliente): ContactoCliente {
  return {
    id: fila.id,
    clienteId: fila.cliente_id,
    nombre: fila.nombre,
    puesto: fila.puesto,
    correo: fila.correo,
    telefono: fila.telefono,
    notas: fila.notas,
    esPrincipal: fila.es_principal,
    activo: fila.activo,
    desactivadoEn: fila.desactivado_en,
    desactivadoPor: fila.desactivado_por,
    creadoPor: fila.creado_por,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

/** Convierte el JSONB de dirección a `Direccion` tipada (o null). */
function jsonADireccion(valor: FilaCliente['direccion_fiscal']): Direccion | null {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    return null;
  }
  const d = valor as Record<string, unknown>;
  return {
    calle: String(d.calle ?? ''),
    numeroExterior: String(d.numeroExterior ?? ''),
    numeroInterior: d.numeroInterior == null ? null : String(d.numeroInterior),
    colonia: String(d.colonia ?? ''),
    municipio: String(d.municipio ?? ''),
    estado: String(d.estado ?? ''),
    codigoPostal: String(d.codigoPostal ?? ''),
    pais: String(d.pais ?? 'México'),
  };
}

/** Convierte una fila de `clientes` (snake_case) a `Cliente` (camelCase). */
export function filaACliente(fila: FilaCliente): Cliente {
  return {
    id: fila.id,
    folio: fila.folio ?? null,
    razonSocial: fila.razon_social,
    nombreComercial: fila.nombre_comercial,
    rfc: fila.rfc,
    contacto: fila.contacto,
    correo: fila.correo,
    telefono: fila.telefono,
    condicionesPago: fila.condiciones_pago as CondicionesPagoCliente | null,
    limiteCredito: Number(fila.limite_credito),
    saldoAFavor: Number(fila.saldo_a_favor),
    moneda: fila.moneda === 'USD' ? 'USD' : 'MXN',
    creditoHabilitado: fila.credito_habilitado === true,
    diasCredito:
      fila.dias_credito === null || fila.dias_credito === undefined
        ? null
        : Number(fila.dias_credito),
    tier: fila.tier as TierCliente,
    tierManual: fila.tier_manual as TierCliente | null,
    tierManualHasta: fila.tier_manual_hasta,
    estado: fila.estado as EstadoCliente,
    direccionFiscal: jsonADireccion(fila.direccion_fiscal),
    direccionEnvio: jsonADireccion(fila.direccion_envio),
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

/** Convierte una fila de `archivos` (snake_case) a `DocumentoCliente`. */
export function filaADocumentoCliente(fila: FilaArchivoCliente): DocumentoCliente {
  return {
    id: fila.id,
    clienteId: fila.entidad_id,
    tipo: (fila.tema_codigo ?? 'otro') as TipoDocumentoCliente,
    nombreArchivo: fila.nombre_original,
    nombreErp: fila.nombre_erp,
    rutaStorage: fila.ruta_storage,
    mime: fila.mime,
    tamanoBytes: Number(fila.tamano_bytes),
    version: Number(fila.version),
    vigente: fila.vigente,
    reemplazaA: fila.reemplaza_a,
    subidoPor: fila.subido_por,
    creadoEn: fila.creado_en,
  };
}
