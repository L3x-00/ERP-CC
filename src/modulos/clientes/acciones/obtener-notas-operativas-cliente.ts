'use server';

import { z } from 'zod';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import type { NotaOperativaCliente } from '@/modulos/clientes/tipos/historial';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

const esquema = z.object({ clienteId: z.uuid('Cliente inválido') }).strict();

/** Órdenes del cliente que acotan la lectura de notas. */
const MAXIMO_ORDENES = 100;
/** Notas devueltas por origen antes del recorte final. */
const MAXIMO_NOTAS_POR_ORIGEN = 40;
/** Notas devueltas al historial. */
const MAXIMO_NOTAS = 40;

type NotaCruda = {
  id: string;
  fecha: string;
  autorId: string;
  ordenId: string;
  partidaId: string;
  texto: string;
  origen: 'sesion' | 'tiempo';
  accion: string | null;
};

function etiquetaAccion(accion: string | null): string | null {
  if (accion === null) return null;
  if (accion === 'pausa') return 'Pausa';
  if (accion === 'fin') return 'Cierre de tiempo';
  if (accion === 'inicio') return 'Inicio de tiempo';
  return accion;
}

/**
 * OBS-11: notas de taller (cierre de sesión y registros de tiempo con nota) de
 * las órdenes de un cliente, vinculadas automáticamente a su historial.
 *
 * Se leen con el cliente admin porque la RLS de producción no autoriza a un
 * usuario de `ver_clientes`; la acción comprueba ese permiso y devuelve solo
 * notas de órdenes del cliente solicitado. Son notas internas (D-14): no se
 * exponen al cliente ni se mezclan con comentarios comerciales.
 */
export async function obtenerNotasOperativasClienteAccion(
  entrada: unknown,
): Promise<RespuestaAccion<NotaOperativaCliente[]>> {
  const analisis = esquema.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'ver_clientes'))) {
    return { exito: false, error: 'Sin permiso para consultar el historial del cliente' };
  }

  try {
    const admin = crearClienteSupabaseAdmin();
    const { data: ordenes, error: errorOrdenes } = await admin
      .from('ordenes_produccion')
      .select('id, folio')
      .eq('cliente_id', analisis.data.clienteId)
      .order('creado_en', { ascending: false })
      .limit(MAXIMO_ORDENES);
    if (errorOrdenes) throw new Error(errorOrdenes.message);

    const ordenesFilas = ordenes ?? [];
    const ordenIds = ordenesFilas.map((orden) => orden.id);
    const folioPorOrden = new Map(ordenesFilas.map((orden) => [orden.id, orden.folio]));
    if (ordenIds.length === 0) return { exito: true, datos: [] };

    const { data: partidas, error: errorPartidas } = await admin
      .from('partidas_orden_produccion')
      .select('id, orden_id, codigo_pieza')
      .in('orden_id', ordenIds);
    if (errorPartidas) throw new Error(errorPartidas.message);

    const partidasFilas = partidas ?? [];
    const partidaIds = partidasFilas.map((partida) => partida.id);
    const ordenPorPartida = new Map(partidasFilas.map((partida) => [partida.id, partida.orden_id]));
    const codigoPorPartida = new Map(
      partidasFilas.map((partida) => [partida.id, partida.codigo_pieza]),
    );

    const [respuestaSesiones, respuestaTiempos] = await Promise.all([
      admin
        .from('sesiones_trabajo')
        .select('id, orden_id, partida_id, operador_id, notas, fecha_inicio, fecha_fin')
        .in('orden_id', ordenIds)
        .not('notas', 'is', null)
        .order('fecha_inicio', { ascending: false })
        .limit(MAXIMO_NOTAS_POR_ORIGEN),
      partidaIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : admin
            .from('registros_tiempo_operador')
            .select('id, partida_id, operador_id, notas, fecha_registro, accion')
            .in('partida_id', partidaIds)
            .not('notas', 'is', null)
            .order('fecha_registro', { ascending: false })
            .limit(MAXIMO_NOTAS_POR_ORIGEN),
    ]);

    if (respuestaSesiones.error || respuestaTiempos.error) {
      throw new Error(respuestaSesiones.error?.message ?? respuestaTiempos.error?.message);
    }

    const notas: NotaCruda[] = [
      ...(respuestaSesiones.data ?? []).map((sesion) => ({
        id: sesion.id,
        fecha: sesion.fecha_fin ?? sesion.fecha_inicio,
        autorId: sesion.operador_id,
        ordenId: sesion.orden_id,
        partidaId: sesion.partida_id,
        texto: (sesion.notas ?? '').trim(),
        origen: 'sesion' as const,
        accion: null,
      })),
      ...(respuestaTiempos.data ?? []).map((registro) => ({
        id: registro.id,
        fecha: registro.fecha_registro,
        autorId: registro.operador_id,
        ordenId: ordenPorPartida.get(registro.partida_id) ?? '',
        partidaId: registro.partida_id,
        texto: (registro.notas ?? '').trim(),
        origen: 'tiempo' as const,
        accion: registro.accion,
      })),
    ].filter((nota) => nota.texto !== '' && nota.ordenId !== '');

    const autorIds = [...new Set(notas.map((nota) => nota.autorId))];
    const { data: autores, error: errorAutores } = await admin
      .from('usuarios')
      .select('id, nombre_completo')
      .in('id', autorIds);
    if (errorAutores) throw new Error(errorAutores.message);
    const nombrePorAutor = new Map(
      (autores ?? []).map((autor) => [autor.id, autor.nombre_completo]),
    );

    const datos: NotaOperativaCliente[] = notas
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
      .slice(0, MAXIMO_NOTAS)
      .map((nota) => ({
        id: nota.id,
        origen: nota.origen,
        accion: etiquetaAccion(nota.accion),
        fecha: nota.fecha,
        autorId: nota.autorId,
        autorNombre: nombrePorAutor.get(nota.autorId) ?? 'Operador',
        ordenId: nota.ordenId,
        ordenFolio: folioPorOrden.get(nota.ordenId) ?? 'OP',
        partidaCodigo: codigoPorPartida.get(nota.partidaId) ?? null,
        texto: nota.texto,
      }));

    return { exito: true, datos };
  } catch (error) {
    console.error('[CLIENTES] Error al consultar notas operativas del cliente:', error);
    return { exito: false, error: 'No se pudieron consultar las notas de taller' };
  }
}
