import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

type Admin = SupabaseClient<Database>;

/**
 * C11: al reclamar una orden, avisa a quien puede programar para que la ordene
 * en Planeación. La notificación es informativa: un fallo no revierte el reclamo.
 */
export async function notificarSolicitudProgramacionServicio(
  admin: Admin,
  entrada: {
    ordenId: string;
    partidaId: string;
    operadorId: string;
    operadorNombre: string;
  },
): Promise<void> {
  try {
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

    if (!usuarios || usuarios.length === 0) return;

    const folio = orden.data?.folio_sii || orden.data?.folio || 'sin folio';
    const identificacion = partida.data?.codigo_pieza
      ? `${folio} · ${partida.data.codigo_pieza}`
      : folio;
    const mensaje =
      `El operador ${entrada.operadorNombre} solicita la programación de esta orden ` +
      `(${identificacion}) para iniciar con la preparación.`;

    const { error } = await admin.from('notificaciones_usuario').insert(
      usuarios.map((usuario) => ({
        usuario_id: usuario.id,
        emisor_id: entrada.operadorId,
        tipo: 'alerta_sistema',
        titulo: 'Solicitud de programación',
        mensaje,
        enlace: '/planeacion',
      })),
    );

    if (error) {
      console.error('[PRODUCCION] No se pudo notificar la solicitud de programación:', error.message);
    }
  } catch (error) {
    console.error('[PRODUCCION] Error al notificar la solicitud de programación:', error);
  }
}
