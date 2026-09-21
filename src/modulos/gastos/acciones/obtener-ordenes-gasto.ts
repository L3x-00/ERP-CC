'use server';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { esquemaBuscarOrdenesGasto } from '@/modulos/gastos/validaciones/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/** Orden elegible para vincular un gasto, con etiqueta legible (OBS-28). */
export type OrdenGastoOpcion = {
  id: string;
  etiqueta: string;
};

const LIMITE = 20;
const SELECCION = 'id, folio, estado, clientes(razon_social, nombre_comercial)';

function etiquetaDeOrden(orden: {
  folio: string;
  estado: string;
  clientes: { razon_social: string; nombre_comercial: string } | null;
}): string {
  const cliente =
    orden.clientes?.nombre_comercial || orden.clientes?.razon_social || 'Sin cliente';
  return `${orden.folio} · ${cliente} · ${orden.estado}`;
}

/**
 * OBS-28: órdenes para el selector del gasto. La búsqueda cubre **folio y
 * cliente**; sin término devuelve las más recientes. Se lee con el cliente
 * admin tras validar `registrar_gastos` porque el gasto es una función
 * financiera y solo se expone la etiqueta comercial, no las partidas.
 */
export async function obtenerOrdenesGastoAccion(
  entrada: unknown,
): Promise<RespuestaAccion<OrdenGastoOpcion[]>> {
  const analisis = esquemaBuscarOrdenesGasto.safeParse(entrada);
  if (!analisis.success) {
    return { exito: false, error: analisis.error.issues[0]?.message ?? 'Búsqueda inválida' };
  }

  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return { exito: false, error: 'No autorizado' };
  if (!(await can(usuario, 'registrar_gastos'))) {
    return { exito: false, error: 'Sin permiso para registrar gastos' };
  }

  try {
    const admin = crearClienteSupabaseAdmin();
    const termino = (analisis.data.busqueda ?? '').replace(/[\\%_,()]/g, '').trim();

    const [resultadoFolio, resultadoClientes] = await Promise.all([
      termino
        ? admin
            .from('ordenes_produccion')
            .select(SELECCION)
            .ilike('folio', `%${termino}%`)
            .order('creado_en', { ascending: false })
            .limit(LIMITE)
        : admin
            .from('ordenes_produccion')
            .select(SELECCION)
            .order('creado_en', { ascending: false })
            .limit(LIMITE),
      termino
        ? admin
            .from('clientes')
            .select('id')
            .or(`razon_social.ilike.%${termino}%,nombre_comercial.ilike.%${termino}%`)
            .limit(LIMITE)
        : Promise.resolve({ data: [] as { id: string }[], error: null }),
    ]);
    if (resultadoFolio.error) throw resultadoFolio.error;
    if (resultadoClientes.error) throw resultadoClientes.error;

    const idsClientes = (resultadoClientes.data ?? []).map((cliente) => cliente.id);
    const resultadoCliente = idsClientes.length
      ? await admin
          .from('ordenes_produccion')
          .select(SELECCION)
          .in('cliente_id', idsClientes)
          .order('creado_en', { ascending: false })
          .limit(LIMITE)
      : { data: [], error: null };
    if (resultadoCliente.error) throw resultadoCliente.error;

    const vistos = new Set<string>();
    const opciones: OrdenGastoOpcion[] = [];
    for (const orden of [...(resultadoFolio.data ?? []), ...(resultadoCliente.data ?? [])]) {
      if (vistos.has(orden.id)) continue;
      vistos.add(orden.id);
      opciones.push({ id: orden.id, etiqueta: etiquetaDeOrden(orden) });
    }

    return { exito: true, datos: opciones };
  } catch (error) {
    console.error('[GASTOS] Error al consultar órdenes para el selector:', error);
    return { exito: false, error: 'No se pudieron consultar las órdenes' };
  }
}
