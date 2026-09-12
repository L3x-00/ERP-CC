import 'server-only';

/**
 * Cliente mínimo de OpenRouter (API compatible con OpenAI) para tareas de
 * visión: recibe imágenes en Base64 y devuelve el texto del modelo.
 *
 * - Solo se ejecuta en el servidor; la clave nunca viaja al cliente.
 * - Sin dependencias nuevas: usa `fetch` nativo con timeout por AbortController.
 * - Los errores que cruzan al llamador son códigos genéricos (`ErrorIa`), nunca
 *   el cuerpo de la respuesta del proveedor.
 */

const URL_CHAT_COMPLETIONS = 'https://openrouter.ai/api/v1/chat/completions';
const TITULO_APLICACION = 'ORCA MFG ERP';
const TIMEOUT_MS_POR_DEFECTO = 30_000;
const TOKENS_MAXIMOS_POR_DEFECTO = 1_024;

/**
 * Modelo gratuito multimodal por defecto. Es configurable con
 * `OPENROUTER_MODEL`; alternativas gratuitas verificadas en OpenRouter:
 * - `google/gemma-4-26b-a4b-it:free`
 * - `google/gemma-4-31b-it:free`
 * - `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`
 * - `openrouter/free` (enrutador que elige un modelo gratuito compatible)
 */
export const MODELO_VISION_POR_DEFECTO = 'google/gemma-4-26b-a4b-it:free';

export type CodigoErrorIa =
  | 'configuracion_faltante'
  | 'solicitud_invalida'
  | 'tiempo_agotado'
  | 'proveedor_no_disponible'
  | 'respuesta_ilegible';

export class ErrorIa extends Error {
  constructor(public readonly codigo: CodigoErrorIa) {
    super(codigo);
    this.name = 'ErrorIa';
  }
}

export interface ImagenIa {
  tipoMime: string;
  contenidoBase64: string;
}

export interface SolicitudVisionIa {
  sistema: string;
  instruccion: string;
  imagenes: ImagenIa[];
}

/** Dependencias inyectables para pruebas sin red ni secretos reales. */
export interface OpcionesIa {
  fetchImpl?: typeof fetch;
  apiKey?: string;
  modelo?: string;
  timeoutMs?: number;
  tokensMaximos?: number;
}

function exigirEntornoServidor(): void {
  if (typeof window !== 'undefined') throw new ErrorIa('configuracion_faltante');
}

/** Extrae el texto del formato OpenAI; soporta `content` como cadena o partes. */
function obtenerTextoRespuesta(cuerpo: unknown): string {
  if (typeof cuerpo !== 'object' || cuerpo === null) throw new ErrorIa('respuesta_ilegible');
  const elecciones = (cuerpo as { choices?: unknown }).choices;
  if (!Array.isArray(elecciones) || elecciones.length === 0) {
    throw new ErrorIa('respuesta_ilegible');
  }
  const mensaje = (elecciones[0] as { message?: unknown }).message;
  if (typeof mensaje !== 'object' || mensaje === null) throw new ErrorIa('respuesta_ilegible');
  const contenido = (mensaje as { content?: unknown }).content;

  const texto = typeof contenido === 'string'
    ? contenido
    : Array.isArray(contenido)
      ? contenido
          .map((parte) => (
            typeof parte === 'object'
            && parte !== null
            && typeof (parte as { text?: unknown }).text === 'string'
              ? (parte as { text: string }).text
              : ''
          ))
          .join('\n')
      : '';

  const limpio = texto.trim();
  if (!limpio) throw new ErrorIa('respuesta_ilegible');
  return limpio;
}

/**
 * Envía una instrucción con imágenes a OpenRouter y devuelve el texto plano.
 * Las imágenes se adjuntan como data URLs (`data:<mime>;base64,<datos>`).
 */
export async function solicitarTextoConImagenes(
  solicitud: SolicitudVisionIa,
  opciones: OpcionesIa = {},
): Promise<string> {
  exigirEntornoServidor();
  if (!solicitud.instruccion.trim() || solicitud.imagenes.length === 0) {
    throw new ErrorIa('solicitud_invalida');
  }

  const apiKey = opciones.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new ErrorIa('configuracion_faltante');
  const modelo = opciones.modelo ?? process.env.OPENROUTER_MODEL ?? MODELO_VISION_POR_DEFECTO;
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS_POR_DEFECTO;
  const tokensMaximos = opciones.tokensMaximos ?? TOKENS_MAXIMOS_POR_DEFECTO;
  const fetchImpl = opciones.fetchImpl ?? fetch;

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);

  try {
    const respuesta = await fetchImpl(URL_CHAT_COMPLETIONS, {
      method: 'POST',
      signal: controlador.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'x-title': TITULO_APLICACION,
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: tokensMaximos,
        messages: [
          { role: 'system', content: solicitud.sistema },
          {
            role: 'user',
            content: [
              ...solicitud.imagenes.map((imagen) => ({
                type: 'image_url',
                image_url: {
                  url: `data:${imagen.tipoMime};base64,${imagen.contenidoBase64}`,
                },
              })),
              { type: 'text', text: solicitud.instruccion },
            ],
          },
        ],
      }),
    });

    if (!respuesta.ok) throw new ErrorIa('proveedor_no_disponible');

    let cuerpo: unknown;
    try {
      cuerpo = await respuesta.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new ErrorIa('respuesta_ilegible');
    }

    return obtenerTextoRespuesta(cuerpo);
  } catch (error) {
    if (error instanceof ErrorIa) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ErrorIa('tiempo_agotado');
    }
    throw new ErrorIa('proveedor_no_disponible');
  } finally {
    clearTimeout(temporizador);
  }
}
