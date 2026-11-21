import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

type Admin = SupabaseClient<Database>;

type EntradaNotificacionPlaneacion = {
  ordenId: string;
  partidaId: string;
  operadorId: string;
  operadorNombre: string;
  /** C22: abre Planeación con la solicitud ya localizada en el calendario. */
  reclamoId: string;
};

/** Destinatarios con permiso de Planeación y datos de la orden/partida. */
async function contextoNotificacion(
  admin: Admin,
  entrada: EntradaNotificacionPlaneacion,
): Promise<{ usuarios: { id: string }[]; identificacion: string } | null> {
  const [orden, partida, asignaciones] = await Promise.all([
    admin
      .from('ordenes_produccion')
      .select('folio, folio_sii')
      .eq('id', entrada.ordenId)
      .maybeSingle(),
    admin
      .from('partidas_orden_produccion')
      .select('codigo_pieza')
      .eq('id', entrada.partidaId)
      .maybeSingle(),
    admin
      .from('permisos_rol')
      .select('rol')
      .eq('permiso', 'gestionar_planeacion'),
  ]);

  const roles = [
    ...new Set(['admin', ...(asignaciones.data ?? []).map((fila) => fila.rol)]),
  ];
  const { data: usuarios } = await admin
    .from('usuarios')
    .select('id')
    .eq('activo', true)
    .in('rol', roles);
  if (!usuarios || usuarios.length === 0) return null;

  const folio = orden.data?.folio_sii || orden.data?.folio || 'sin folio';
  const identificacion = partida.data?.codigo_pieza
    ? `${folio} · ${partida.data.codigo_pieza}`
    : folio;
  return { usuarios, identificacion };
}

async function insertarNotificacion(
  admin: Admin,
  entrada: EntradaNotificacionPlaneacion,
  construir: (identificacion: string) => { titulo: string; mensaje: string },
): Promise<void> {
  const contexto = await contextoNotificacion(admin, entrada);
  if (!contexto) return;
  const { titulo, mensaje } = construir(contexto.identificacion);
  const { error } = await admin.from('notificaciones_usuario').insert(
    contexto.usuarios.map((usuario) => ({
      usuario_id: usuario.id,
      emisor_id: entrada.operadorId,
      tipo: 'alerta_sistema',
      titulo,
      mensaje,
      enlace: `/planeacion?reclamoId=${encodeURIComponent(entrada.reclamoId)}`,
    })),
  );
  if (error) {
    console.error('[PRODUCCION] No se pudo notificar a Planeación:', error.message);
  }
}

/**
 * C11/PLAN-2: al reclamar una orden, avisa a quien puede programar. Informativa:
 * un fallo no revierte el reclamo.
 */
export async function notificarSolicitudProgramacionServicio(
  admin: Admin,
  entrada: EntradaNotificacionPlaneacion,
): Promise<void> {
  try {
    await insertarNotificacion(
      admin,
      entrada,
      (identificacion) => ({
        titulo: 'Operador esperando programación',
        mensaje: `El operador ${entrada.operadorNombre} ha reclamado esta orden (${identificacion}). Programa la operación para que pueda trabajar.`,
      }),
    );
  } catch (error) {
    console.error('[PRODUCCION] Error al notificar el reclamo:', error);
  }
}

/** PLAN-2: al iniciar, el administrador ve quién ya está trabajando la orden. */
export async function notificarInicioProcesoServicio(
  admin: Admin,
  entrada: EntradaNotificacionPlaneacion,
): Promise<void> {
  try {
    await insertarNotificacion(
      admin,
      entrada,
      (identificacion) => ({
        titulo: 'Proceso iniciado por el operador',
        mensaje: `El operador ${entrada.operadorNombre} ha iniciado el proceso de la orden ${identificacion}.`,
      }),
    );
  } catch (error) {
    console.error('[PRODUCCION] Error al notificar el inicio:', error);
  }
}
