import 'server-only';
import { z } from 'zod';

/**
 * Envío de correo transaccional con la API v3 de Brevo.
 *
 * - Solo se ejecuta en el servidor; la clave nunca viaja al cliente.
 * - El remitente debe estar verificado en Brevo (Senders & Domains) o el
 *   proveedor rechazará el envío.
 * - Sin dependencias nuevas: `fetch` nativo con timeout por AbortController.
 * - Los errores que cruzan al llamador son códigos genéricos (`ErrorCorreo`);
 *   nunca se propaga ni registra el cuerpo de la respuesta del proveedor.
 */

const URL_ENVIO_BREVO = 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS_POR_DEFECTO = 15_000;
const REMITENTE_NOMBRE_POR_DEFECTO = 'ORCA MFG ERP';

export type CodigoErrorCorreo =
  | 'configuracion_faltante'
  | 'solicitud_invalida'
  | 'tiempo_agotado'
  | 'proveedor_no_disponible';

export class ErrorCorreo extends Error {
  constructor(public readonly codigo: CodigoErrorCorreo) {
    super(codigo);
    this.name = 'ErrorCorreo';
  }
}

const esquemaEnvio = z
  .object({
    destinatario: z.email('Correo destinatario inválido').max(254),
    nombreDestinatario: z.string().trim().min(1).max(120).optional(),
    asunto: z.string().trim().min(1).max(160),
    html: z.string().min(1).max(200_000),
    texto: z.string().max(20_000).optional(),
  })
  .strict();

export interface EntradaCorreo {
  destinatario: string;
  nombreDestinatario?: string;
  asunto: string;
  html: string;
  texto?: string;
}

/** Dependencias inyectables para pruebas sin red ni secretos reales. */
export interface OpcionesCorreo {
  fetchImpl?: typeof fetch;
  apiKey?: string;
  remitente?: string;
  remitenteNombre?: string;
  timeoutMs?: number;
}

export interface RespuestaCorreo {
  idMensaje: string | null;
}

function exigirEntornoServidor(): void {
  if (typeof window !== 'undefined') throw new ErrorCorreo('configuracion_faltante');
}

/**
 * Envía un correo transaccional y devuelve el identificador de Brevo.
 * Requiere `BREVO_API_KEY` y `CORREO_REMITENTE` (correo verificado).
 */
export async function enviarCorreoTransaccional(
  entrada: EntradaCorreo,
  opciones: OpcionesCorreo = {},
): Promise<RespuestaCorreo> {
  exigirEntornoServidor();

  const validada = esquemaEnvio.safeParse(entrada);
  if (!validada.success) throw new ErrorCorreo('solicitud_invalida');

  const apiKey = opciones.apiKey ?? process.env.BREVO_API_KEY;
  const remitente = opciones.remitente ?? process.env.CORREO_REMITENTE;
  if (!apiKey || !remitente) throw new ErrorCorreo('configuracion_faltante');

  const remitenteNombre = opciones.remitenteNombre
    ?? process.env.CORREO_REMITENTE_NOMBRE
    ?? REMITENTE_NOMBRE_POR_DEFECTO;
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS_POR_DEFECTO;
  const fetchImpl = opciones.fetchImpl ?? fetch;

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);

  try {
    const respuesta = await fetchImpl(URL_ENVIO_BREVO, {
      method: 'POST',
      signal: controlador.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { name: remitenteNombre, email: remitente },
        to: [{
          email: validada.data.destinatario,
          ...(validada.data.nombreDestinatario
            ? { name: validada.data.nombreDestinatario }
            : {}),
        }],
        subject: validada.data.asunto,
        htmlContent: validada.data.html,
        ...(validada.data.texto ? { textContent: validada.data.texto } : {}),
      }),
    });

    if (!respuesta.ok) throw new ErrorCorreo('proveedor_no_disponible');

    let cuerpo: unknown;
    try {
      cuerpo = await respuesta.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      cuerpo = null;
    }

    const idMensaje = (
      typeof cuerpo === 'object'
      && cuerpo !== null
      && typeof (cuerpo as { messageId?: unknown }).messageId === 'string'
    )
      ? (cuerpo as { messageId: string }).messageId
      : null;

    return { idMensaje };
  } catch (error) {
    if (error instanceof ErrorCorreo) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ErrorCorreo('tiempo_agotado');
    }
    throw new ErrorCorreo('proveedor_no_disponible');
  } finally {
    clearTimeout(temporizador);
  }
}
