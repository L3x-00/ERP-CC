'use client';

import {
  COLUMNAS_ESPACIO_OPERADOR,
  ETIQUETAS_COLUMNA,
  agruparProcesosPorOrden,
  agruparProcesosPorOrdenYColumna,
  type ColumnaEspacioOperador,
  type ProcesoEspacioOperador,
} from '@/modulos/produccion/tipos/indice';
import {
  agruparLotesPorOrden,
  claveLotePartida,
} from '@/modulos/produccion/servicios/lotes-tablero-servicio';
import { columnaOperadorLote } from '@/modulos/produccion/utilidades/columna-lote';
import { GrupoLotesOrden } from './grupo-lotes-orden';
import { cn } from '@/compartido/utilidades/cn';
import { horasLegibles } from '@/modulos/produccion/utilidades/formato-operador';
import type { LoteTablero } from '@/modulos/produccion/tipos/indice';
import { TarjetaOrdenOperador } from './tarjeta-orden-operador';

export interface PropsVistaKanbanOperador {
  procesos: ProcesoEspacioOperador[];
  /** Lotes creados que aún no han abierto sesión. */
  lotes?: readonly LoteTablero[];
  hoy: string;
  soloLectura: boolean;
  onAbrir: (proceso: ProcesoEspacioOperador) => void;
  onAbrirOrden: (ordenId: string) => void;
  /** Abre la ficha del lote para operarlo como una sola corrida. */
  onAbrirLote?: (lote: LoteTablero) => void;
  /** C15: continúa la sesión pausada sin abrir la ficha. */
  onReanudar?: (proceso: ProcesoEspacioOperador) => void;
  /** C15: cierra una pausa que el operador no retomará, sin producir. */
  onCerrarPausa?: (proceso: ProcesoEspacioOperador) => void;
  /** C20: declara piezas y hora real de una pausa automática por jornada. */
  onActualizarAvance?: (proceso: ProcesoEspacioOperador) => void;
}

const ESTILO_COLUMNA: Record<ColumnaEspacioOperador, string> = {
  aprobada: 'border-t-info bg-info-suave/30',
  bandeja: 'border-t-borde-fuerte bg-superficie-2/40',
  en_proceso: 'border-t-exito bg-exito-suave/30',
  pausada: 'border-t-advertencia bg-advertencia-suave/30',
  actualizar_avance: 'border-t-peligro bg-peligro-suave/30',
  lista: 'border-t-exito bg-exito-suave/20',
};

/**
 * C10/C20: Kanban de 6 columnas del piso, agrupado por orden e ítem. Se adapta al
 * ancho disponible (1 columna en móvil, hasta 6 en escritorio) para que el
 * operador no tenga que desplazarse horizontalmente.
 */
export function VistaKanbanOperador({
  procesos,
  lotes = [],
  hoy,
  soloLectura,
  onAbrir,
  onAbrirOrden,
  onAbrirLote,
  onReanudar,
  onCerrarPausa,
  onActualizarAvance,
}: PropsVistaKanbanOperador) {
  // El lote sustituye a la tarjeta de sus ítems en las columnas activas. Se
  // filtra solo el render: los procesos siguen completos para resúmenes,
  // sugerencias, calendario y acciones rápidas. «Actualizar avance» NO se
  // filtra: el avance pendiente de una pausa debe seguir siendo visible.
  const columnasConLote = new Set(['bandeja', 'en_proceso', 'pausada']);
  const clavesLote = new Set(
    (lotes ?? []).flatMap((lote) => lote.items.map((item) => claveLotePartida(item.partidaId, lote.procesoNombre))),
  );
  const gruposDelTablero = agruparProcesosPorOrdenYColumna(procesos);
  const grupoEsVisible = (grupo: (typeof gruposDelTablero)[number]): boolean => !(
    columnasConLote.has(grupo.columna)
    && clavesLote.size > 0
    && grupo.procesos.every((proceso) => clavesLote.has(claveLotePartida(proceso.partidaId, proceso.procesoNombre)))
  );
  // C15: la tarjeta completa vive en la columna principal. Si el lote ocultó
  // esa columna, se promueve la primera columna visible de la misma orden para
  // que siempre quede una tarjeta completa (con cliente, ruta y «Ver detalle»).
  const columnaPrincipalPorOrden = new Map<string, ColumnaEspacioOperador>();
  for (const grupo of agruparProcesosPorOrden(procesos)) {
    const visibles = gruposDelTablero
      .filter((actual) => actual.ordenId === grupo.ordenId && grupoEsVisible(actual))
      .sort((primero, segundo) => (
        COLUMNAS_ESPACIO_OPERADOR.indexOf(primero.columna) - COLUMNAS_ESPACIO_OPERADOR.indexOf(segundo.columna)
      ));
    const principalVisible = visibles.some((actual) => actual.columna === grupo.columna);
    const aprobadaVisible = visibles.some((actual) => actual.columna === 'aprobada');
    columnaPrincipalPorOrden.set(
      grupo.ordenId,
      principalVisible ? grupo.columna
        : aprobadaVisible ? 'aprobada'
          : visibles[0]?.columna ?? grupo.columna,
    );
  }
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      data-testid="vista-kanban-operador"
    >
      {COLUMNAS_ESPACIO_OPERADOR.map((columna) => {
        const lotesDelEstado = lotes?.filter((lote) => columnaOperadorLote(lote.estado) === columna) ?? [];
        const procesosVisibles = columnasConLote.has(columna) && clavesLote.size > 0
          ? procesos.filter((proceso) => !clavesLote.has(claveLotePartida(proceso.partidaId, proceso.procesoNombre)))
          : procesos;
        const ordenesDelEstado = agruparProcesosPorOrdenYColumna(procesosVisibles)
          .filter((grupo) => grupo.columna === columna);
        const procesosDelEstado = ordenesDelEstado.reduce(
          (total, grupo) => total + grupo.procesos.length,
          0,
        );
        const horas = ordenesDelEstado.reduce((total, grupo) => total + grupo.horas, 0)
          + lotesDelEstado.reduce((total, lote) => total + (lote.limiteHoras ?? 0), 0);
        return (
          <section
            key={columna}
            className={cn(
              'flex min-w-0 flex-col gap-2 rounded-lg border border-t-4 border-borde p-2',
              ESTILO_COLUMNA[columna],
            )}
            aria-label={`${ETIQUETAS_COLUMNA[columna]}: ${ordenesDelEstado.length} órdenes, ${procesosDelEstado} procesos, ${lotesDelEstado.length} lotes`}
            data-testid={`columna-${columna}`}
          >
            <header className="flex items-baseline justify-between gap-2 px-1">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-texto-primario">
                  {ETIQUETAS_COLUMNA[columna]}
                  <span className="ml-1.5 rounded-full bg-superficie px-1.5 py-0.5 text-xs tabular-nums text-texto-secundario">
                    {ordenesDelEstado.length + lotesDelEstado.length}
                  </span>
                </h3>
                <p className="text-[11px] text-texto-tenue">
                  {ordenesDelEstado.length} orden{ordenesDelEstado.length === 1 ? '' : 'es'} ·{' '}
                  {procesosDelEstado} proceso{procesosDelEstado === 1 ? '' : 's'}
                  {lotesDelEstado.length > 0 ? ` · ${lotesDelEstado.length} lote(s)` : ''}
                </p>
              </div>
              <span className="text-xs tabular-nums text-texto-tenue">{horasLegibles(horas)}</span>
            </header>
            {ordenesDelEstado.length === 0 && lotesDelEstado.length === 0 ? (
              <p className="rounded-md border border-dashed border-borde-fuerte/60 p-3 text-center text-xs text-texto-tenue">
                Sin órdenes
              </p>
            ) : (
              <ul className="grid min-w-0 gap-2">
                {agruparLotesPorOrden(lotesDelEstado).map((grupo) => (
                  <li key={grupo.ordenId} className="min-w-0">
                    <GrupoLotesOrden
                      grupo={grupo}
                      testIdPrefijo="tarjeta-lote-piso"
                      onAbrirOrden={onAbrirOrden}
                      onAbrirLote={onAbrirLote}
                    />
                  </li>
                ))}
                {ordenesDelEstado.map((grupo) => (
                  <li key={`${grupo.ordenId}:${columna}`} className="min-w-0">
                    <TarjetaOrdenOperador
                      grupo={grupo}
                      hoy={hoy}
                      compacta={columnaPrincipalPorOrden.get(grupo.ordenId) !== columna}
                      arrastrable={!soloLectura && columna !== 'lista' && columna !== 'actualizar_avance'}
                      onAbrir={onAbrir}
                      onAbrirOrden={onAbrirOrden}
                      onReanudar={onReanudar}
                      onCerrarPausa={onCerrarPausa}
                      onActualizarAvance={onActualizarAvance}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
