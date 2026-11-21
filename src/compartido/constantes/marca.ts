/**
 * Identidad visual de la empresa para la interfaz y los documentos.
 *
 * El logo vive en `public/logo` y se distribuye con la aplicación, de modo que
 * cualquier documento generado conserva la marca aunque la configuración de
 * empresa no tenga una URL de logo capturada.
 */

/** Nombre oficial con el que se presenta la empresa en todo el sistema. */
export const NOMBRE_EMPRESA = 'CC Manufacturing Group';

/** Descripción corta usada en pantallas de acceso y metadatos. */
export const DESCRIPCION_EMPRESA = 'Sistema de gestión empresarial para manufactura CNC';

/** Logo principal (PNG con fondo transparente) para interfaz y encabezados. */
export const LOGO_EMPRESA_RUTA = '/logo/logosf.png';

/** Versión monocromática del logo, usada como marca de agua documental. */
export const LOGO_EMPRESA_MARCA_AGUA = '/logo/logosf.svg';

/** Color institucional verde de la marca (no altera el acento del sistema). */
export const COLOR_MARCA = '#109748';

/**
 * Devuelve la URL del logo configurado por la empresa o, si no existe, el
 * logo institucional incluido con la aplicación.
 */
export function resolverLogoDocumento(logoUrl: string | null | undefined): string {
  const limpio = typeof logoUrl === 'string' ? logoUrl.trim() : '';
  return limpio.length > 0 ? limpio : LOGO_EMPRESA_RUTA;
}
