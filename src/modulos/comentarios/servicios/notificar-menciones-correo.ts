import 'server-only';
import type { ComentarioRegistro } from '@/modulos/comentarios/tipos/indice';
import {
  enviarCorreoTransaccional,
  ErrorCorreo,
  type OpcionesCorreo,
} from '@/nucleo/correo/indice';
import type { ClienteComentarios } from './comentarios-servicio';
import { escaparTextoComentario } from './parser-menciones';

const LONGITUD_MAXIMA_EXTRACTO = 500;
const COLORES = {
  fondo: '#f8f9fa',
  superficie: '#ffffff',
  superficie2: '#f1f3f5',
  borde: '#e2e8f0',
  texto: '#1e293b',
  secundario: '#64748b',
  tenue: '#94a3b8',
  acento: '#3b82f6',
} as const;

export interface DatosMencionCorreo {
  autorId: string;
  autorNombre: string;
  comentario: Pick<ComentarioRegistro, 'entidadTipo' | 'entidadId' | 'contenido'>;
  mencionesIds: string[];
}

export interface OpcionesNotificacionCorreo extends OpcionesCorreo {
  sitioUrl?: string | null;
}

export interface ResumenNotificacionCorreo {
  enviados: number;
  fallidos: number;
}

/** Enlace interno por entidad; coincide con el que genera el trigger de menciones. */
export function construirEnlaceEntidad(
  entidadTipo: ComentarioRegistro['entidadTipo'],
  entidadId: string,
): string | null {
  switch (entidadTipo) {
    case 'orden':
      return `/ordenes?ordenId=${entidadId}`;
    case 'cotizacion':
      return `/pipeline?cotizacionId=${entidadId}`;
    case 'cliente':
      return `/clientes?clienteId=${entidadId}`;
    default:
      return null;
  }
}

/** URL pública del ERP para enlaces en correos; `null` si aún no está configurada. */
export function resolverSitioPublico(): string | null {
  const configurado = process.env.NEXT_PUBLIC_SITIO_URL?.trim();
  if (configurado) return configurado.replace(/\/+$/, '');

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return host ? `https://${host}` : null;
  }

  return null;
}

/** Construye asunto, HTML y texto del aviso de mención (escapado, sin HTML libre). */
export function construirCorreoMencion(entrada: {
  autorNombre: string;
  contenido: string;
  enlace: string | null;
}): { asunto: string; html: string; texto: string } {
  const autor = escaparTextoComentario(entrada.autorNombre);
  const extracto = escaparTextoComentario(
    entrada.contenido.length > LONGITUD_MAXIMA_EXTRACTO
      ? `${entrada.contenido.slice(0, LONGITUD_MAXIMA_EXTRACTO - 1)}…`
      : entrada.contenido,
  );
  const boton = entrada.enlace
    ? `<a href="${escaparTextoComentario(entrada.enlace)}" style="display:inline-block;background:${COLORES.acento};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 20px;border-radius:8px">Ver comentario</a>`
    : '';

  const html = [
    '<!doctype html>',
    '<html lang="es"><body style="margin:0;padding:24px;background:', COLORES.fondo,
    ';font-family:\'Segoe UI\',Arial,sans-serif;color:', COLORES.texto, '">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">',
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${COLORES.superficie};border:1px solid ${COLORES.borde};border-radius:12px">`,
    `<tr><td style="padding:20px 24px;border-bottom:1px solid ${COLORES.borde};font-size:16px;font-weight:600">ORCA MFG ERP</td></tr>`,
    '<tr><td style="padding:24px">',
    `<p style="margin:0 0 8px;font-size:14px;color:${COLORES.secundario}">Te mencionaron en un comentario</p>`,
    `<p style="margin:0 0 16px;font-size:16px;font-weight:600">${autor}</p>`,
    `<blockquote style="margin:0 0 20px;padding:12px 16px;background:${COLORES.superficie2};border-left:3px solid ${COLORES.acento};border-radius:4px;font-size:14px;line-height:1.5">${extracto}</blockquote>`,
    boton,
    '</td></tr>',
    `<tr><td style="padding:16px 24px;border-top:1px solid ${COLORES.borde};font-size:12px;color:${COLORES.tenue}">Enviado automáticamente por ORCA MFG ERP.</td></tr>`,
    '</table></td></tr></table></body></html>',
  ].join('');

  const texto = [
    `${entrada.autorNombre} te mencionó en ORCA MFG ERP:`,
    '',
    `"${entrada.contenido}"`,
    ...(entrada.enlace ? ['', `Ver comentario: ${entrada.enlace}`] : []),
  ].join('\n');

  return {
    asunto: `${entrada.autorNombre} te mencionó en ORCA MFG ERP`,
    html,
    texto,
  };
}

/**
 * Envía el aviso por correo a los usuarios mencionados activos (excepto al
 * autor). Nunca lanza: los fallos se cuentan y se registran sin datos
 * sensibles; un correo caído jamás debe tumbar la creación del comentario.
 */
export async function notificarMencionesPorCorreo(
  cliente: ClienteComentarios,
  datos: DatosMencionCorreo,
  opciones: OpcionesNotificacionCorreo = {},
): Promise<ResumenNotificacionCorreo> {
  const destinatariosIds = [...new Set(datos.mencionesIds)].filter((id) => id !== datos.autorId);
  if (destinatariosIds.length === 0) return { enviados: 0, fallidos: 0 };

  let enviados = 0;
  let fallidos = 0;

  try {
    const { data, error } = await cliente
      .from('usuarios')
      .select('id, email, nombre_completo')
      .in('id', destinatariosIds)
      .eq('activo', true);

    if (error || !data) return { enviados: 0, fallidos: destinatariosIds.length };

    const sitio = opciones.sitioUrl ?? resolverSitioPublico();
    const enlaceRelativo = construirEnlaceEntidad(
      datos.comentario.entidadTipo,
      datos.comentario.entidadId,
    );
    const enlace = enlaceRelativo && sitio ? `${sitio}${enlaceRelativo}` : null;

    for (const fila of data) {
      try {
        const correo = construirCorreoMencion({
          autorNombre: datos.autorNombre,
          contenido: datos.comentario.contenido,
          enlace,
        });
        await enviarCorreoTransaccional(
          {
            destinatario: fila.email,
            nombreDestinatario: fila.nombre_completo,
            ...correo,
          },
          opciones,
        );
        enviados += 1;
      } catch (error) {
        fallidos += 1;
        if (error instanceof ErrorCorreo) {
          console.error('[COMENTARIOS] Correo de mención no enviado:', fila.id, error.codigo);
        } else {
          console.error('[COMENTARIOS] Correo de mención no enviado:', fila.id);
        }
      }
    }

    return { enviados, fallidos };
  } catch (error) {
    console.error('[COMENTARIOS] Error al resolver destinatarios de menciones:', error);
    return { enviados, fallidos: fallidos + destinatariosIds.length };
  }
}
