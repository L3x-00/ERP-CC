'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_SESION_OPERADOR } from '@/nucleo/autenticacion/constantes';
import { obtenerContextoSesionOperadorActiva } from '@/nucleo/autenticacion/obtener-operador-sesion';
import {
  deserializarSesionOperador,
  sesionOperadorEsDelegada,
} from '@/nucleo/autenticacion/sesion';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';

/** Sale de la terminal o de la vista delegada sin cerrar la sesion administrativa. */
export async function cerrarVistaOperadorAccion(): Promise<never> {
  const almacenCookies = await cookies();
  const valorCookie = almacenCookies.get(COOKIE_SESION_OPERADOR)?.value;
  const sesion = valorCookie ? await deserializarSesionOperador(valorCookie) : null;
  const esDelegada = sesion ? sesionOperadorEsDelegada(sesion) : false;

  try {
    const contexto = await obtenerContextoSesionOperadorActiva();
    if (contexto?.administrador && esDelegada) {
      await registrarLog(
        contexto.administrador,
        'cerrar_vista_operador',
        'autenticacion',
        contexto.operador.id,
        {
          operadorNombre: contexto.operador.nombreCompleto,
          motivo: contexto.sesion.motivoDelegacion,
          expiraEn: contexto.sesion.expiraEn,
        },
      );
    } else if (contexto && !esDelegada) {
      await registrarLog(
        contexto.operador,
        'cerrar_sesion_pin',
        'autenticacion',
        contexto.operador.id,
      );
    }
  } catch (error) {
    console.error('[AUTENTICACION] No se pudo auditar la salida de la vista operador:', error);
  }

  almacenCookies.delete(COOKIE_SESION_OPERADOR);
  redirect(esDelegada ? '/produccion' : '/operador');
}
