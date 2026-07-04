import type { SesionOperador } from '@/modulos/autenticacion/tipos/indice';

/**
 * Sesión de operador de piso: cookie httpOnly firmada con HMAC-SHA256.
 * Usa Web Crypto API — compatible con Edge (middleware) y Node (Server Actions).
 */

function obtenerSecreto(): string {
  const secreto = process.env.SECRETO_SESION_OPERADOR;
  if (!secreto) {
    throw new Error('Falta variable de entorno SECRETO_SESION_OPERADOR');
  }
  return secreto;
}

function aBase64Url(bytes: Uint8Array): string {
  let binario = '';
  bytes.forEach((byte) => {
    binario += String.fromCharCode(byte);
  });
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function desdeBase64Url(texto: string): Uint8Array<ArrayBuffer> {
  const base64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base64);
  return Uint8Array.from(binario, (caracter) => caracter.charCodeAt(0));
}

async function obtenerClaveHmac(usos: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(obtenerSecreto()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usos,
  );
}

/**
 * Serializa sesión de operador a valor de cookie firmado: `payload.firma`.
 */
export async function serializarSesionOperador(sesion: SesionOperador): Promise<string> {
  const payload = aBase64Url(new TextEncoder().encode(JSON.stringify(sesion)));
  const clave = await obtenerClaveHmac(['sign']);
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(payload));
  return `${payload}.${aBase64Url(new Uint8Array(firma))}`;
}

/**
 * Deserializa y verifica cookie de sesión de operador.
 * @returns SesionOperador o null si firma inválida o formato corrupto.
 */
export async function deserializarSesionOperador(
  valorCookie: string,
): Promise<SesionOperador | null> {
  const partes = valorCookie.split('.');
  if (partes.length !== 2) {
    return null;
  }

  const [payload, firma] = partes;

  try {
    const clave = await obtenerClaveHmac(['verify']);
    const valida = await crypto.subtle.verify(
      'HMAC',
      clave,
      desdeBase64Url(firma),
      new TextEncoder().encode(payload),
    );
    if (!valida) {
      return null;
    }

    const sesion = JSON.parse(
      new TextDecoder().decode(desdeBase64Url(payload)),
    ) as SesionOperador;

    if (!sesion.usuarioId || !sesion.ultimaActividadEn || !sesion.timeoutMinutos) {
      return null;
    }

    return sesion;
  } catch {
    return null;
  }
}

/**
 * Verifica si la sesión de operador expiró por inactividad.
 */
export function sesionOperadorExpirada(sesion: SesionOperador, ahora: Date = new Date()): boolean {
  const ultimaActividad = new Date(sesion.ultimaActividadEn).getTime();
  const limite = ultimaActividad + sesion.timeoutMinutos * 60 * 1000;
  return ahora.getTime() > limite;
}
