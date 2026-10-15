import { formatearFecha } from '@/compartido/utilidades/formatear';
import type { EventoFicha } from '@/modulos/ordenes/tipos/ficha-orden';
import { claveValor } from '@/modulos/ordenes/utilidades/formato-ficha';

const ETIQUETAS_CAMBIO: Readonly<Record<string, string>> = {
  fecha_operativa: 'Fecha operativa',
  fecha_programada: 'Fecha programada',
  prioridad: 'Prioridad',
  notas: 'Notas',
  recurso_id: 'Recurso',
  turno: 'Turno',
  horas_estimadas: 'Horas estimadas',
  orden_prioridad: 'Prioridad de secuencia',
};

function ResumenCambio({ detalle }: { detalle: Record<string, unknown> }) {
  const anterior = typeof detalle.anterior === 'object' && detalle.anterior !== null
    ? detalle.anterior as Record<string, unknown>
    : null;
  const nuevo = typeof detalle.nuevo === 'object' && detalle.nuevo !== null
    ? detalle.nuevo as Record<string, unknown>
    : null;
  if (!anterior && !nuevo) return null;

  const claves = [...new Set([...Object.keys(anterior ?? {}), ...Object.keys(nuevo ?? {})])]
    .filter((clave) => clave !== 'programacion_id' && clave !== 'partida_id')
    .filter((clave) => claveValor(anterior?.[clave]) !== claveValor(nuevo?.[clave]));
  if (claves.length === 0) return null;

  return (
    <dl className="mt-2 grid gap-1 text-xs text-texto-secundario sm:grid-cols-2">
      {claves.map((clave) => (
        <div key={clave} className="flex flex-wrap gap-1">
          <dt className="font-medium text-texto-primario">{ETIQUETAS_CAMBIO[clave] ?? clave}:</dt>
          <dd>{anterior ? `${claveValor(anterior[clave])} → ` : ''}{claveValor(nuevo?.[clave])}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PanelActividadFicha({ eventos }: { eventos: EventoFicha[] }) {
  return (
    <section className="grid gap-2" data-testid="ficha-panel-actividad">
      {eventos.length === 0 ? (
        <p className="text-sm text-texto-secundario">Sin eventos de orden registrados.</p>
      ) : (
        <ol className="grid gap-2">
          {eventos.map((evento) => (
            <li key={evento.id} className="rounded-md border border-borde px-3 py-2 text-sm">
              <p className="font-medium text-texto-primario">{evento.tipo}</p>
              <p className="text-xs text-texto-secundario">
                {formatearFecha(evento.creadoEn)}{evento.actorNombre ? ` · ${evento.actorNombre}` : ''}
                {evento.motivo ? ` · ${evento.motivo}` : ''}
              </p>
              <ResumenCambio detalle={evento.detalle} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
