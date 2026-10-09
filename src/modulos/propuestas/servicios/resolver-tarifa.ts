import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';

/** Tarifa por hora resuelta para un renglón de ruteo (C3.2/DC-07). */
export type TarifaResuelta = {
  tarifa: number;
  moneda: 'MXN' | 'USD';
  fuente: 'GRUPO' | 'RECURSO';
  grupoEquipoId: string | null;
  recursoId: string | null;
};

export type ResultadoTarifa = { ok: true; datos: TarifaResuelta } | { ok: false; error: string };

function leerDetalle(detalle: string | null | undefined): Record<string, unknown> {
  if (!detalle) return {};
  try {
    const valor: unknown = JSON.parse(detalle);
    return valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Traduce el bloqueo de costeo a un mensaje que dice exactamente qué
 * configurar. Función pura para poder probarla sin base de datos.
 */
export function mensajeTarifaFaltante(codigo: string, detalle?: string | null): string {
  const datos = leerDetalle(detalle);
  if (codigo.includes('tarifa_no_configurada')) {
    const grupo = typeof datos.grupo === 'string' ? `«${datos.grupo}»` : 'del equipo';
    return `El grupo de equipo ${grupo} no tiene tarifa por hora. Configúrala en Configuración → Catálogos base → Tarifas por grupo de equipo.`;
  }
  if (codigo.includes('tarifa_sin_grupo')) {
    const recurso = typeof datos.recurso === 'string' ? `«${datos.recurso}»` : '';
    return `La máquina ${recurso} no tiene grupo de equipo ni tarifa propia. Asígnale un grupo o una tarifa propia en Configuración.`.replace('  ', ' ');
  }
  if (codigo.includes('grupo_equipo_invalido')) return 'El grupo de equipo del ruteo no existe.';
  if (codigo.includes('recurso_inexistente')) return 'La máquina del ruteo no existe.';
  return 'No se pudo resolver la tarifa por hora del ruteo.';
}

/** Resuelve la tarifa de un renglón: override de la máquina > tarifa del grupo. */
export async function resolverTarifaHora(
  admin: SupabaseClient<Database>,
  entrada: { grupoEquipoId: string | null; recursoId?: string | null },
): Promise<ResultadoTarifa> {
  const { data, error } = await admin.rpc('resolver_tarifa_hora', {
    p_grupo_equipo_id: entrada.grupoEquipoId as string,
    ...(entrada.recursoId ? { p_recurso_id: entrada.recursoId } : {}),
  });
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: mensajeTarifaFaltante(error?.message ?? '', error?.details) };
  }
  const fila = data as Record<string, unknown>;
  return {
    ok: true,
    datos: {
      tarifa: Number(fila.tarifa),
      moneda: fila.moneda === 'USD' ? 'USD' : 'MXN',
      fuente: fila.fuente === 'RECURSO' ? 'RECURSO' : 'GRUPO',
      grupoEquipoId: typeof fila.grupo_equipo_id === 'string' ? fila.grupo_equipo_id : null,
      recursoId: typeof fila.recurso_id === 'string' ? fila.recurso_id : null,
    },
  };
}
