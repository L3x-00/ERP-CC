'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  guardarOperadorServicio,
  type OperadorGestionConfig,
} from '@/modulos/configuracion/servicios/operadores-servicio';
import { esquemaGuardarOperador } from '@/modulos/configuracion/validaciones/indice';

/** CFG-05: solo el admin activo administra identidades de piso. */
export async function guardarOperadorAccion(
  entrada: unknown,
): Promise<RespuestaAccion<OperadorGestionConfig>> {
  const analisis = esquemaGuardarOperador.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || usuario.rol !== 'admin' || !usuario.activo) {
    return { exito: false, error: 'Solo un administrador activo puede gestionar operadores' };
  }

  const datos = analisis.data;
  try {
    const { operador, activoAnterior } = await guardarOperadorServicio(usuario.id, datos);
    const accion = activoAnterior === null ? 'crear_operador'
      : activoAnterior && !operador.activo ? 'retirar_operador'
        : !activoAnterior && operador.activo ? 'reactivar_operador'
          : datos.pin ? 'cambiar_pin_operador' : 'editar_operador';
    await registrarLog(usuario, accion, 'configuracion', operador.id, {
      activo: operador.activo,
      pinCambiado: Boolean(datos.pin),
    });
    return { exito: true, datos: operador };
  } catch (error) {
    const codigo = error instanceof Error ? error.message : 'error_inesperado';
    console.error('[CONFIGURACION] Gestión de operador rechazada:', codigo);
    await registrarLog(usuario, 'guardar_operador_rechazado', 'configuracion', datos.id ?? usuario.id, {
      codigo: codigo === 'pin_duplicado' ? 'pin_duplicado' : 'error_servicio',
    });
    return {
      exito: false,
      error: codigo === 'pin_duplicado'
        ? 'Ese PIN ya pertenece a otro operador activo'
        : 'No se pudo guardar el operador',
    };
  }
}
