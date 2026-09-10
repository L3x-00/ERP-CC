import {
  esquemaComprobanteOCR,
  esquemaDatosComprobanteOCR,
  type ComprobanteOCRInput,
  type TipoMimeComprobante,
} from '@/modulos/gastos/validaciones/gastos';
import type { DatosComprobanteOCR } from '@/modulos/gastos/tipos/gastos';

const URL_MENSAJES_ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const VERSION_API_ANTHROPIC = '2023-06-01';
const MODELO_POR_DEFECTO = 'claude-3-5-haiku-20241022';
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

const MIMES_IMAGEN: readonly TipoMimeComprobante[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

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

function obtenerTextoRespuesta(cuerpo: unknown): string {
  if (typeof cuerpo !== 'object' || cuerpo === null) throw new ErrorOcr('respuesta_ilegible');
  const contenido = (cuerpo as { content?: unknown }).content;
  if (!Array.isArray(contenido)) throw new ErrorOcr('respuesta_ilegible');
  const texto = contenido
    .map((bloque) => {
      if (typeof bloque !== 'object' || bloque === null) return '';
      const textoBloque = bloque as { type?: unknown; text?: unknown };
      return textoBloque.type === 'text' && typeof textoBloque.text === 'string'
        ? textoBloque.text
        : '';
    })
    .join('\n')
    .trim();
  if (!texto) throw new ErrorOcr('respuesta_ilegible');
  return texto;
}

function construirContenido(entrada: ComprobanteOCRInput): Record<string, unknown> {
  const fuente = {
    type: 'base64',
    media_type: entrada.tipoMime,
    data: entrada.contenidoBase64,
  };
  return MIMES_IMAGEN.includes(entrada.tipoMime)
    ? { type: 'image', source: fuente }
    : { type: 'document', source: fuente };
}

/** Llama Anthropic solo desde servidor y valida por completo la salida sugerida. */
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

  const apiKey = opciones.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ErrorOcr('configuracion_faltante');
  const modelo = opciones.modelo ?? process.env.ANTHROPIC_MODEL ?? MODELO_POR_DEFECTO;
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS_POR_DEFECTO;
  const fetchImpl = opciones.fetchImpl ?? fetch;
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);

  try {
    const respuesta = await fetchImpl(URL_MENSAJES_ANTHROPIC, {
      method: 'POST',
      signal: controlador.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': VERSION_API_ANTHROPIC,
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: TOKENS_MAXIMOS_RESPUESTA,
        system: INSTRUCCION_SISTEMA,
        messages: [{
          role: 'user',
          content: [
            construirContenido(entradaValidada.data),
            { type: 'text', text: `Devuelve solo este JSON:\n${ESQUEMA_SOLICITADO}` },
          ],
        }],
      }),
    });
    if (!respuesta.ok) throw new ErrorOcr('proveedor_no_disponible');
    let cuerpo: unknown;
    try {
      cuerpo = await respuesta.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new ErrorOcr('respuesta_ilegible');
    }

    const datos = esquemaDatosComprobanteOCR.safeParse(
      extraerObjetoJson(obtenerTextoRespuesta(cuerpo)),
    );
    if (!datos.success) throw new ErrorOcr('respuesta_ilegible');
    return datos.data;
  } catch (error) {
    if (error instanceof ErrorOcr) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ErrorOcr('tiempo_agotado');
    }
    throw new ErrorOcr('proveedor_no_disponible');
  } finally {
    clearTimeout(temporizador);
  }
}
