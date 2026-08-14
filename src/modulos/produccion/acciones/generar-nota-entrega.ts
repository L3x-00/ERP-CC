'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  generarNotaEntregaServicio,
  mensajeErrorEntrega,
  type NotaEntregaGenerada,
} from '@/modulos/produccion/servicios/indice';
import { esquemaCrearNotaEntrega } from '@/modulos/produccion/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export async function generarNotaEntregaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<NotaEntregaGenerada>> {
  const analisis = esquemaCrearNotaEntrega.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'gestionar_produccion'))) {
    return { exito: false, error: 'Sin permiso para generar notas de entrega' };
  }

  try {
    const nota = await generarNotaEntregaServicio(crearClienteSupabaseAdmin(), {
      ...analisis.data,
      creadoPor: usuario.id,
    });
    await registrarLog(usuario, 'generar_nota_entrega', 'produccion', nota.id, {
      ordenId: analisis.data.ordenId,
      folio: nota.folio,
      esParcial: nota.esParcial,
      cantidadPartidas: analisis.data.partidas.length,
    });
    return { exito: true, datos: nota };
  } catch (error) {
    console.error('[PRODUCCION] Error al generar nota de entrega:', error);
    await registrarLog(usuario, 'nota_entrega_rechazada', 'produccion', analisis.data.ordenId, {
      cantidadPartidas: analisis.data.partidas.length,
    });
    return { exito: false, error: mensajeErrorEntrega(error) };
  }
}
