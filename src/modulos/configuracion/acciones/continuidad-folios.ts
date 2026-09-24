'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const periodo = z.string().regex(/^(0[1-9]|1[0-2])[0-9]{2}$/);
const esquemaConsultar = z.object({ periodo }).strict();
const esquemaAjustar = z.object({ periodo, ultimo: z.number().int().min(0).max(9999) }).strict();

export interface ContinuidadFolioCnc {
  periodo: string;
  ultimoContador: number;
  ultimoEmitido: number;
  siguiente: number | null;
}

async function usuarioConfiguracion() {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'configuracion'))) return null;
  return usuario;
}

/** El contador y el máximo realmente emitido se consultan por separado. */
export async function obtenerContinuidadFoliosAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ContinuidadFolioCnc>> {
  const validado = esquemaConsultar.safeParse(entrada);
  if (!validado.success) return { exito: false, error: 'Periodo inválido' };
  const usuario = await usuarioConfiguracion();
  if (!usuario) return { exito: false, error: 'Sin permiso de Configuración' };

  const { data, error } = await crearClienteSupabaseAdmin().rpc('consultar_continuidad_folio_cnc', {
    p_periodo: validado.data.periodo, p_actor_id: usuario.id,
  });
  const fila = data?.[0];
  if (error || !fila) return { exito: false, error: 'No se pudo consultar la continuidad' };
  return { exito: true, datos: {
    periodo: validado.data.periodo,
    ultimoContador: fila.ultimo_contador,
    ultimoEmitido: fila.ultimo_emitido,
    siguiente: fila.siguiente,
  } };
}

/** Solo adelanta la reserva; PostgreSQL serializa el ajuste con el generador. */
export async function ajustarContinuidadFoliosAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ ultimo: number }>> {
  const validado = esquemaAjustar.safeParse(entrada);
  if (!validado.success) return { exito: false, error: 'Periodo o último número inválido' };
  const usuario = await usuarioConfiguracion();
  if (!usuario) return { exito: false, error: 'Sin permiso de Configuración' };

  const { data, error } = await crearClienteSupabaseAdmin().rpc('ajustar_continuidad_folio_cnc', {
    p_periodo: validado.data.periodo,
    p_ultimo: validado.data.ultimo,
    p_actor_id: usuario.id,
  });
  if (error || data === null) {
    return { exito: false, error: error?.message.includes('folio_no_puede_retroceder')
      ? 'El último número no puede ser menor al reservado o ya emitido'
      : 'No se pudo ajustar la continuidad' };
  }
  await registrarLog(usuario, 'ajustar_continuidad_folio_cnc', 'configuracion', usuario.id, {
    periodo: validado.data.periodo, ultimo: data,
  });
  return { exito: true, datos: { ultimo: data } };
}
