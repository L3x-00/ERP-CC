'use client';

import { Button } from '@/compartido/componentes/ui/button';
import type {
  BolsaPlaneacion,
  PartidaBolsa,
  SugerenciaBolsa,
} from '@/modulos/planeacion/servicios/indice';

export type ResultadoAsignarSugerencia = { exito: true } | { exito: false; error: string };

export interface PropsPanelBolsaPlaneacion {
  bolsa: BolsaPlaneacion;
  procesando: boolean;
  mensaje: string | null;
  error: string | null;
  onAsignar: (sugerencia: SugerenciaBolsa) => Promise<ResultadoAsignarSugerencia>;
}

function ItemBolsa({ partida }: { partida: PartidaBolsa }) {
  return (
    <li className="flex flex-col gap-0.5 rounded-base border border-borde p-2 text-xs">
      <span className="font-mono text-[11px] font-medium">{partida.folio} · {partida.codigoPieza}</span>
      <span className="text-texto-secundario">
        {partida.horas} h · {partida.areaCodigo ?? 'área por definir'}
        {partida.procesos.length > 0 ? ` · ${partida.procesos.join(', ')}` : ''}
      </span>
    </li>
  );
}

/**
 * PLA-05: bolsa de liberación. Muestra pausadas sin planear, trabajo activo sin
 * fecha hoy y sugerencias que caben en la capacidad libre; asignar reutiliza la
 * RPC transaccional de programación, que revalida capacidad y candados.
 */
export function PanelBolsaPlaneacion({
  bolsa,
  procesando,
  mensaje,
  error,
  onAsignar,
}: PropsPanelBolsaPlaneacion) {
  const total = bolsa.pausadasSinPlan.length + bolsa.activasSinFechaHoy.length
    + bolsa.sugerencias.length;

  return (
    <section
      className="mt-4 border-t border-borde pt-4"
      aria-labelledby="titulo-bolsa-planeacion"
      data-testid="bolsa-planeacion"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 id="titulo-bolsa-planeacion" className="text-sm font-medium">
          Trabajo por liberar
        </h2>
        <span className="text-xs text-texto-secundario">{total} pendiente(s)</span>
      </header>
      {mensaje ? <p role="status" className="mt-2 text-xs text-exito-texto">{mensaje}</p> : null}
      {error ? <p role="alert" className="mt-2 text-xs text-peligro-texto">{error}</p> : null}

      <section className="mt-3" aria-label="Órdenes pausadas sin planear" data-testid="bolsa-pausadas">
        <h3 className="text-xs font-semibold text-texto-secundario">
          Pausadas sin planear ({bolsa.pausadasSinPlan.length})
        </h3>
        {bolsa.pausadasSinPlan.length === 0 ? (
          <p className="mt-1 text-xs text-texto-tenue">Sin órdenes pausadas pendientes de plan.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {bolsa.pausadasSinPlan.map((partida) => (
              <ItemBolsa key={partida.partidaId} partida={partida} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-3" aria-label="Trabajo activo sin fecha hoy" data-testid="bolsa-hoy">
        <h3 className="text-xs font-semibold text-texto-secundario">
          Activas sin fecha hoy ({bolsa.activasSinFechaHoy.length})
        </h3>
        {bolsa.activasSinFechaHoy.length === 0 ? (
          <p className="mt-1 text-xs text-texto-tenue">Todo el trabajo activo tiene plan de hoy.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {bolsa.activasSinFechaHoy.map((partida) => (
              <ItemBolsa key={partida.partidaId} partida={partida} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-3" aria-label="Sugerencias de asignación" data-testid="bolsa-sugerencias">
        <h3 className="text-xs font-semibold text-texto-secundario">
          Caben en capacidad libre ({bolsa.sugerencias.length})
        </h3>
        {bolsa.sugerencias.length === 0 ? (
          <p className="mt-1 text-xs text-texto-tenue">
            No hay partidas sin planear que quepan en la capacidad registrada.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-2">
            {bolsa.sugerencias.map((sugerencia) => (
              <li
                key={sugerencia.partidaId}
                data-testid={`bolsa-sugerencia-${sugerencia.partidaId}`}
                className="flex flex-col gap-1 rounded-base border border-borde p-2 text-xs"
              >
                <span className="font-mono text-[11px] font-medium">
                  {sugerencia.folio} · {sugerencia.codigoPieza}
                </span>
                <span className="text-texto-secundario">
                  {sugerencia.recursoCodigo} · {sugerencia.fecha} / {sugerencia.turno} ·{' '}
                  {sugerencia.horas} h (quedan {sugerencia.horasDisponibles.toFixed(2)} h)
                </span>
                <Button
                  type="button"
                  variante="contorno"
                  tamano="sm"
                  className="self-start"
                  data-testid={`asignar-sugerencia-${sugerencia.partidaId}`}
                  disabled={procesando}
                  onClick={() => void onAsignar(sugerencia)}
                >
                  Asignar aquí
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
