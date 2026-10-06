'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import type { ContinuidadFolioPeriodico } from '@/modulos/configuracion/tipos/continuidad-folios-periodico';
import {
  esquemaAjustarContinuidadPeriodico,
  esquemaConsultarContinuidadPeriodico,
} from '@/modulos/configuracion/validaciones/continuidad-folios-periodico';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { nuevoCorrelationId, registrarLog } from '@/nucleo/auditoria/registrar-log';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

async function usuarioConfiguracion() {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'configuracion'))) return null;
  return usuario;
}

/** Diagnóstico del periodo vigente; RFQ se contrasta con folios reales. */
export async function obtenerContinuidadFoliosPeriodicoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<ContinuidadFolioPeriodico>> {
  const validado = esquemaConsultarContinuidadPeriodico.safeParse(entrada);
  if (!validado.success) {
    return { exito: false, error: validado.error.issues[0]?.message ?? 'Tipo de folio inválido' };
  }
  const usuario = await usuarioConfiguracion();
  if (!usuario) return { exito: false, error: 'Sin permiso de Configuración' };

  const { data, error } = await crearClienteSupabaseAdmin().rpc(
    'consultar_continuidad_folio_periodico',
    { p_tipo: validado.data.tipo, p_actor_id: usuario.id },
  );
  const fila = data?.[0];
  if (error || !fila) {
    console.error('[CONFIGURACION] Error al consultar continuidad periódica:', error?.message);
    return { exito: false, error: 'No se pudo consultar la continuidad' };
  }

  return {
    exito: true,
    datos: {
      tipo: validado.data.tipo,
      periodo: fila.periodo,
      ultimoContador: fila.ultimo_contador,
      ultimoEmitido: fila.ultimo_emitido,
      siguiente: fila.siguiente,
    },
  };
}

/** Solo adelanta la reserva; la RPC rechaza cualquier retroceso real. */
export async function ajustarContinuidadFoliosPeriodicoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ ultimo: number }>> {
  const correlationId = nuevoCorrelationId();
  const validado = esquemaAjustarContinuidadPeriodico.safeParse(entrada);
  if (!validado.success) {
    return { exito: false, error: validado.error.issues[0]?.message ?? 'Periodo o último número inválido' };
  }
  const usuario = await usuarioConfiguracion();
  if (!usuario) return { exito: false, error: 'Sin permiso de Configuración' };

  const { data, error } = await crearClienteSupabaseAdmin().rpc(
    'ajustar_continuidad_folio_periodico',
    {
      p_tipo: validado.data.tipo,
      p_periodo: validado.data.periodo,
      p_ultimo: validado.data.ultimo,
      p_actor_id: usuario.id,
    },
  );
  if (error || data === null || data === undefined) {
    const codigo = error?.message ?? '';
    if (codigo.includes('folio_no_puede_retroceder')) {
      return { exito: false, error: 'El último número no puede ser menor al reservado o ya emitido' };
    }
    if (codigo.includes('tipo_folio_invalido') || codigo.includes('continuidad_folio_invalida')) {
      return { exito: false, error: 'Tipo o periodo de folio inválido' };
    }
    console.error('[CONFIGURACION] Error al ajustar continuidad periódica:', codigo);
    return { exito: false, error: 'No se pudo ajustar la continuidad' };
  }

  await registrarLog(usuario, 'ajustar_continuidad_folio_periodico', 'configuracion', usuario.id, {
    tipo: validado.data.tipo,
    periodo: validado.data.periodo,
    ultimo: data,
  }, correlationId);
  return { exito: true, datos: { ultimo: data } };
}
