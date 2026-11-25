import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';
import { obtenerRentabilidadOrdenServicio } from '@/modulos/gastos/servicios/indice';
import type {
  TotalesCorrida,
  TotalesCorridasOrden,
} from '@/modulos/produccion/tipos/totales-corrida';

type Admin = SupabaseClient<Database>;

function numero(valor: unknown): number {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
}

function redondear(valor: number): number {
  return Math.round(valor * 10_000) / 10_000;
}

/**
 * C4: tiempos, material y costos agregados POR CORRIDA, sin reparto entre
 * ítems. Solo lectura: no escribe ni recalcula tiempos reales por partida.
 */
export async function obtenerTotalesCorridasOrdenServicio(
  admin: Admin,
  entrada: { ordenId: string; incluirCostos: boolean },
): Promise<TotalesCorridasOrden> {
  const { data: corridas, error: errorCorridas } = await admin
    .from('corridas')
    .select('id, codigo, estado')
    .eq('orden_id', entrada.ordenId)
    .order('codigo');
  if (errorCorridas) throw new Error(errorCorridas.message);

  const ids = (corridas ?? []).map((corrida) => corrida.id);
  const [sesiones, consumos] = await Promise.all([
    ids.length > 0
      ? admin
          .from('sesiones_trabajo')
          .select('id, corrida_id, horas_netas, piezas_producidas, costo_hora_interno, sesion_invalida')
          .in('corrida_id', ids)
      : Promise.resolve({ data: [] as never[], error: null }),
    ids.length > 0
      ? admin
          .from('registros_consumo_material')
          .select('corrida_id, cantidad_usada, cantidad_scrap, costo_unitario_momento')
          .in('corrida_id', ids)
      : Promise.resolve({ data: [] as never[], error: null }),
  ]);
  if (sesiones.error) throw new Error(sesiones.error.message);
  if (consumos.error) throw new Error(consumos.error.message);

  const idsSesiones = (sesiones.data ?? []).map((sesion) => sesion.id);
  const { data: filasItem, error: errorItem } = idsSesiones.length > 0
    ? await admin
        .from('sesion_item_tiempos')
        .select('sesion_id, piezas')
        .in('sesion_id', idsSesiones)
    : { data: [] as never[], error: null };
  if (errorItem) throw new Error(errorItem.message);
  const piezasPorSesion = new Map<string, number>();
  for (const fila of filasItem ?? []) {
    piezasPorSesion.set(fila.sesion_id, (piezasPorSesion.get(fila.sesion_id) ?? 0) + numero(fila.piezas));
  }

  const acumulados = new Map<string, TotalesCorrida>();
  for (const corrida of corridas ?? []) {
    acumulados.set(corrida.id, {
      corridaId: corrida.id,
      codigo: corrida.codigo,
      estado: corrida.estado,
      horasTotales: 0,
      piezasProducidas: 0,
      cantidadMaterial: 0,
      costoMaterialMxn: entrada.incluirCostos ? 0 : null,
      costoTiempoMxn: entrada.incluirCostos ? 0 : null,
      costoTotalMxn: entrada.incluirCostos ? 0 : null,
    });
  }

  for (const sesion of sesiones.data ?? []) {
    const total = acumulados.get(sesion.corrida_id ?? '');
    if (!total || sesion.sesion_invalida) continue;
    total.horasTotales = redondear(total.horasTotales + numero(sesion.horas_netas));
    // En lotes integrados las piezas por ítem ya incluyen la partida principal;
    // sumar también la sesión duplicaría ese ítem.
    total.piezasProducidas += piezasPorSesion.has(sesion.id)
      ? piezasPorSesion.get(sesion.id)!
      : numero(sesion.piezas_producidas);
    if (entrada.incluirCostos) {
      total.costoTiempoMxn = redondear(
        (total.costoTiempoMxn ?? 0) + numero(sesion.horas_netas) * numero(sesion.costo_hora_interno),
      );
    }
  }

  for (const consumo of consumos.data ?? []) {
    const total = acumulados.get(consumo.corrida_id ?? '');
    if (!total) continue;
    total.cantidadMaterial = redondear(
      total.cantidadMaterial + numero(consumo.cantidad_usada) + numero(consumo.cantidad_scrap),
    );
    if (entrada.incluirCostos) {
      total.costoMaterialMxn = redondear(
        (total.costoMaterialMxn ?? 0)
          + (numero(consumo.cantidad_usada) + numero(consumo.cantidad_scrap))
            * numero(consumo.costo_unitario_momento),
      );
    }
  }

  const lista = [...acumulados.values()];
  if (entrada.incluirCostos) {
    for (const total of lista) {
      total.costoTotalMxn = redondear((total.costoMaterialMxn ?? 0) + (total.costoTiempoMxn ?? 0));
    }
  }

  let costoTotalOrdenMxn: number | null = null;
  let ordenSinDesglose = false;
  if (entrada.incluirCostos) {
    try {
      const rentabilidad = await obtenerRentabilidadOrdenServicio(admin, entrada.ordenId);
      costoTotalOrdenMxn = rentabilidad.costoTotalMxn;
    } catch {
      // La orden existe pero Finanzas no puede calcular el costo sin desglose.
      ordenSinDesglose = true;
    }
  }

  return { corridas: lista, costoTotalOrdenMxn, ordenSinDesglose };
}
