import type { Tables } from '@/compartido/tipos/supabase';

/** Tier comercial del cliente (por consumo o asignación manual). */
export type TierCliente = 'bronce' | 'plata' | 'oro' | 'platino';

/** Estado del ciclo de vida del cliente. */
export type EstadoCliente = 'prospecto' | 'activo' | 'inactivo';

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
  razonSocial: string;
  nombreComercial: string;
  rfc: string | null;
  contacto: string | null;
  correo: string | null;
  telefono: string | null;
  condicionesPago: CondicionesPagoCliente | null;
  limiteCredito: number;
  saldoAFavor: number;
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

/** Documento del cliente (metadatos; el binario vive en Storage). */
export type DocumentoCliente = {
  id: string;
  clienteId: string;
  tipo: TipoDocumentoCliente;
  nombreArchivo: string;
  rutaStorage: string;
  subidoPor: string | null;
  creadoEn: string;
};

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

// Filas crudas de Supabase (snake_case) derivadas de los tipos generados.
export type FilaCliente = Tables<'clientes'>;
export type FilaDocumentoCliente = Tables<'documentos_cliente'>;

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
    razonSocial: fila.razon_social,
    nombreComercial: fila.nombre_comercial,
    rfc: fila.rfc,
    contacto: fila.contacto,
    correo: fila.correo,
    telefono: fila.telefono,
    condicionesPago: fila.condiciones_pago as CondicionesPagoCliente | null,
    limiteCredito: Number(fila.limite_credito),
    saldoAFavor: Number(fila.saldo_a_favor),
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

/** Convierte una fila de `documentos_cliente` (snake_case) a `DocumentoCliente`. */
export function filaADocumentoCliente(fila: FilaDocumentoCliente): DocumentoCliente {
  return {
    id: fila.id,
    clienteId: fila.cliente_id,
    tipo: fila.tipo as TipoDocumentoCliente,
    nombreArchivo: fila.nombre_archivo,
    rutaStorage: fila.ruta_storage,
    subidoPor: fila.subido_por,
    creadoEn: fila.creado_en,
  };
}
