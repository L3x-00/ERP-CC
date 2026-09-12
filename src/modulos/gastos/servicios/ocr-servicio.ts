import {
  esquemaComprobanteOCR,
  esquemaDatosComprobanteOCR,
  type ComprobanteOCRInput,
} from '@/modulos/gastos/validaciones/gastos';
import type { DatosComprobanteOCR } from '@/modulos/gastos/tipos/gastos';
import {
  ErrorIa,
  solicitarTextoConImagenes,
} from '@/nucleo/ia/indice';

const TIMEOUT_MS_POR_DEFECTO = 30_000;
const TAMANO_MAXIMO_BYTES_POR_DEFECTO = 5 * 1024 * 1024;
const TOKENS_MAXIMOS_RESPUESTA = 1_024;

export type CodigoErrorOcr =
  | 'configuracion_faltante'
  | 'comprobante_invalido'
  | 'comprobante_excede_limite'
  | 'tiempo_agotado'
  | 'proveedor_no_disponible'
  | 'respuesta_ilegible';

export class ErrorOcr extends Error {
  constructor(public readonly codigo: CodigoErrorOcr) {
    super(codigo);
    this.name = 'ErrorOcr';
  }
}

/** Dependencias inyectables para pruebas sin red ni secretos reales. */
export interface OpcionesOcr {
  fetchImpl?: typeof fetch;
  apiKey?: string;
  modelo?: string;
  timeoutMs?: number;
  tamanoMaximoBytes?: number;
}

const INSTRUCCION_SISTEMA = [
  'Eres un extractor de datos de comprobantes de gasto de una empresa CNC en Tijuana, México.',
  'Aceptas CFDI/tickets mexicanos y facturas o recibos estadounidenses.',
  'Responde únicamente un objeto JSON válido, sin texto adicional ni bloques de código.',
  'No inventes datos: si un campo no es legible, usa null.',
  'Los importes son números no negativos con punto decimal, nunca cadenas.',
  'Usa MXN o USD cuando la moneda esté indicada; si no aparece, usa null y explica la duda.',
  'fechaEmision debe ser ISO YYYY-MM-DD.',
  'confianza debe estar entre 0 y 1.',
].join(' ');

const ESQUEMA_SOLICITADO = `{
  "proveedorSugerido": string | null,
  "rfc": string | null,
  "folioFactura": string | null,
  "montoSubtotal": number | null,
  "montoIva": number | null,
  "montoTotal": number | null,
  "moneda": "MXN" | "USD" | null,
  "fechaEmision": "YYYY-MM-DD" | null,
  "confianza": number,
  "advertencias": string[]
}`;

function exigirEntornoServidor(): void {
  if (typeof window !== 'undefined') {
    throw new ErrorOcr('configuracion_faltante');
  }
}

export function calcularBytesBase64(contenidoBase64: string): number {
  const relleno = contenidoBase64.endsWith('==') ? 2 : contenidoBase64.endsWith('=') ? 1 : 0;
  return Math.floor((contenidoBase64.length * 3) / 4) - relleno;
}

/** Extrae el primer objeto JSON aunque el proveedor haya añadido cercas o texto. */
export function extraerObjetoJson(texto: string): unknown {
  const limpio = texto.replace(/```(?:json)?/gi, '').trim();
  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (inicio < 0 || fin <= inicio) throw new ErrorOcr('respuesta_ilegible');
  try {
    return JSON.parse(limpio.slice(inicio, fin + 1)) as unknown;
  } catch {
    throw new ErrorOcr('respuesta_ilegible');
  }
}

/** Traduce los códigos del cliente de IA a los del dominio de gastos. */
function traducirErrorIa(error: ErrorIa): ErrorOcr {
  switch (error.codigo) {
    case 'configuracion_faltante':
      return new ErrorOcr('configuracion_faltante');
    case 'tiempo_agotado':
      return new ErrorOcr('tiempo_agotado');
    case 'respuesta_ilegible':
      return new ErrorOcr('respuesta_ilegible');
    default:
      return new ErrorOcr('proveedor_no_disponible');
  }
}

/**
 * Extrae los datos de un comprobante con un modelo multimodal gratuito vía
 * OpenRouter (solo imágenes JPG/PNG/WEBP/GIF) y valida la salida con Zod.
 */
export async function extraerDatosComprobante(
  entrada: ComprobanteOCRInput,
  opciones: OpcionesOcr = {},
): Promise<DatosComprobanteOCR> {
  exigirEntornoServidor();
  const entradaValidada = esquemaComprobanteOCR.safeParse(entrada);
  if (!entradaValidada.success) throw new ErrorOcr('comprobante_invalido');

  const maximo = opciones.tamanoMaximoBytes ?? TAMANO_MAXIMO_BYTES_POR_DEFECTO;
  if (calcularBytesBase64(entradaValidada.data.contenidoBase64) > maximo) {
    throw new ErrorOcr('comprobante_excede_limite');
  }

  let texto: string;
  try {
    texto = await solicitarTextoConImagenes(
      {
        sistema: INSTRUCCION_SISTEMA,
        instruccion: `Devuelve solo este JSON:\n${ESQUEMA_SOLICITADO}`,
        imagenes: [{
          tipoMime: entradaValidada.data.tipoMime,
          contenidoBase64: entradaValidada.data.contenidoBase64,
        }],
      },
      {
        apiKey: opciones.apiKey,
        modelo: opciones.modelo,
        timeoutMs: opciones.timeoutMs ?? TIMEOUT_MS_POR_DEFECTO,
        tokensMaximos: TOKENS_MAXIMOS_RESPUESTA,
        fetchImpl: opciones.fetchImpl,
      },
    );
  } catch (error) {
    if (error instanceof ErrorIa) throw traducirErrorIa(error);
    throw new ErrorOcr('proveedor_no_disponible');
  }

  const datos = esquemaDatosComprobanteOCR.safeParse(extraerObjetoJson(texto));
  if (!datos.success) throw new ErrorOcr('respuesta_ilegible');
  return datos.data;
}
