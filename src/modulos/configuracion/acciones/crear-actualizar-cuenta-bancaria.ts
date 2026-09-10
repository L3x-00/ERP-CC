'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import {
  guardarCuentaBancariaServicio,
} from '@/modulos/configuracion/servicios/indice';
import type { CuentaBancaria } from '@/modulos/configuracion/tipos/indice';
import { esquemaGuardarCuentaBancaria } from '@/modulos/configuracion/validaciones/indice';
import { ejecutarAccionConfiguracion } from './utilidades-acciones';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

export async function crearActualizarCuentaBancariaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<CuentaBancaria>> {
  const analisis = esquemaGuardarCuentaBancaria.safeParse(entrada);
  if (!analisis.success) return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'configuracion'))) return { exito: false, error: 'Sin permiso para configurar el sistema' };

  return ejecutarAccionConfiguracion(
    usuario,
    analisis.data.id ? 'actualizar_cuenta_bancaria' : 'crear_cuenta_bancaria',
    analisis.data.id ?? usuario.id,
    () => guardarCuentaBancariaServicio(crearClienteSupabaseAdmin(), analisis.data),
    { moneda: analisis.data.moneda, activa: analisis.data.activa, tieneClabe: Boolean(analisis.data.clabe) },
  );
}
