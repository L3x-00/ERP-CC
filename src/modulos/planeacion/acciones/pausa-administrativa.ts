'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { cerrarSesionSupervisorAccion } from '@/modulos/produccion/acciones/cerrar-sesion-supervisor';

type Resultado = { sesionId?: string; aprobada?: boolean };

/** PLAN-3: pausa una operación en curso con motivo administrativo legible. */
export async function pausarOperacionAdministrativaAccion(entrada: {
  programacionId: string;
  notas: string;
}): Promise<RespuestaAccion<Resultado>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || usuario.rol !== 'admin'
    || !(await can(usuario, 'gestionar_planeacion'))
    || !(await can(usuario, 'gestionar_produccion'))) {
    return { exito: false, error: 'Solo un administrador con acceso a Planeación y Producción puede pausar una operación en marcha' };
  }
  const admin = crearClienteSupabaseAdmin();
  const { data: sesion, error } = await admin
    .from('sesiones_trabajo')
    .select('id, piezas_producidas, estado_sesion')
    .eq('programacion_id', entrada.programacionId)
    .eq('estado_sesion', 'activa')
    .maybeSingle();
  if (error || !sesion) {
    return { exito: false, error: 'La operación ya no tiene una sesión en marcha. Actualiza la ficha.' };
  }

  const cierre = await cerrarSesionSupervisorAccion({
    sesionId: sesion.id,
    piezasProducidas: Number(sesion.piezas_producidas ?? 0),
    estadoDestino: 'pausada',
    motivoPausa: 'PAUSA_ADMIN',
    notas: entrada.notas,
  });
  if (!cierre.exito) return { exito: false, error: cierre.error };
  await registrarLog(usuario, 'pausa_administrativa_planeacion', 'planeacion', entrada.programacionId, {
    sesionId: sesion.id,
  }, nuevoCorrelationId());
  return { exito: true, datos: { sesionId: sesion.id } };
}

/** PLAN-3: el administrador autoriza que el operador reanude la pausa. */
export async function aprobarPausaAdministrativaAccion(entrada: {
  programacionId: string;
}): Promise<RespuestaAccion<Resultado>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'gestionar_planeacion'))) {
    return { exito: false, error: 'Sin permiso para aprobar la reanudación' };
  }
  const { data, error } = await crearClienteSupabaseAdmin()
    .rpc('aprobar_pausa_administrativa', {
      p_programacion_id: entrada.programacionId,
      p_actor_id: usuario.id,
    });
  if (error) return { exito: false, error: `No se pudo aprobar la reanudación: ${error.message}` };
  if (data !== true) {
    return { exito: false, error: 'La operación no tiene una pausa administrativa pendiente' };
  }
  return { exito: true, datos: { aprobada: true } };
}
