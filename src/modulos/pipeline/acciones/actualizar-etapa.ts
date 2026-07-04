'use server';

import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { registrarLog } from '@/nucleo/auditoria/registrar-log';
import { generarFolioCnc } from '@/modulos/pipeline/servicios/generar-folio-cnc';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import { esReversion, esTransicionValida } from '@/modulos/pipeline/servicios/reglas-transicion';
import { esquemaTransicionEtapa } from '@/modulos/pipeline/validaciones/esquemas-transicion-etapa';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import type { TablesUpdate } from '@/compartido/tipos/supabase';

/**
 * Cambia la etapa de una oportunidad para avances NO terminales
 * (prospecto → contactado → cotizado → negociacion) y reversiones de admin.
 *
 * Ganar y perder NO se manejan aquí (usan `marcarGanadaAccion` /
 * `marcarPerdidaAccion`); la única excepción es retroceder DESDE una etapa
 * terminal hacia una etapa activa, que se trata como reversión de admin.
 */
export async function actualizarEtapaAccion(
  entrada: unknown,
): Promise<RespuestaAccion<{ folioCnc?: string | null }>> {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    return { exito: false, error: 'No autorizado' };
  }

  const analisis = esquemaTransicionEtapa.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { id, etapaDestino: hacia } = analisis.data;

  // Carga con cliente RLS: si el usuario no puede ver la oportunidad → null.
  const servidor = await crearClienteSupabaseServidor();
  const cargada = await obtenerOportunidadPorId(servidor, id);
  if (!cargada) {
    return { exito: false, error: 'No encontrada' };
  }
  const desde = cargada.oportunidad.etapa;

  // Escritura de columnas controladas (etapa/folio) vía cliente admin: la RLS y
  // un trigger impiden que un cliente autenticado las cambie directo; la
  // autorización ya se verificó con la carga RLS + los checks de rol de abajo.
  const admin = crearClienteSupabaseAdmin();

  const reversion = esReversion(desde, hacia);

  // Los destinos terminales solo se alcanzan por sus acciones específicas.
  // Una reversión (incl. salir de una etapa terminal) sí se procesa aquí.
  if (!reversion && (hacia === 'ganada' || hacia === 'perdida')) {
    return { exito: false, error: 'Usa la acción específica para ganar o perder' };
  }

  if (reversion) {
    if (usuario.rol !== 'admin') {
      return { exito: false, error: 'Solo un administrador puede retroceder una etapa' };
    }

    const { error } = await admin.from('pipeline').update({ etapa: hacia }).eq('id', id);
    if (error) {
      return { exito: false, error: 'No se pudo actualizar la etapa' };
    }

    await registrarLog(usuario, 'reversion_etapa', 'pipeline', id, { desde, hacia });
    return { exito: true, datos: { folioCnc: cargada.oportunidad.folioCnc } };
  }

  if (!esTransicionValida(desde, hacia)) {
    return { exito: false, error: 'Transición no permitida' };
  }

  const cambios: TablesUpdate<'pipeline'> = { etapa: hacia };
  let folioCncResultante: string | null = cargada.oportunidad.folioCnc;
  const ahora = new Date().toISOString();

  if (hacia === 'contactado') {
    cambios.fecha_ultimo_contacto = ahora;
  } else if (hacia === 'cotizado') {
    if (!cargada.oportunidad.correo) {
      return {
        exito: false,
        error: 'Falta el correo del contacto para cotizar (datos incompletos)',
      };
    }

    if (!cargada.oportunidad.folioCnc) {
      try {
        folioCncResultante = await generarFolioCnc(admin);
      } catch {
        return { exito: false, error: 'No se pudo generar el folio CNC' };
      }
      cambios.folio_cnc = folioCncResultante;
    }
    cambios.fecha_envio_cotizacion = ahora;
  }

  const { error } = await admin.from('pipeline').update(cambios).eq('id', id);
  if (error) {
    return { exito: false, error: 'No se pudo actualizar la etapa' };
  }

  await registrarLog(usuario, 'actualizar_etapa', 'pipeline', id, { desde, hacia });

  return { exito: true, datos: { folioCnc: folioCncResultante } };
}
