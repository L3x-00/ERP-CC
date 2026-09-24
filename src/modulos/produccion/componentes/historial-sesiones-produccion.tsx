import { formatearFecha, formatearHora, formatearNumero } from '@/compartido/utilidades/formatear';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';

const MOTIVOS: Record<string, string> = {
  falta_informacion: 'Falta de información', material_pendiente: 'Material pendiente',
  aprobacion_cliente: 'Aprobación de cliente', problema_tecnico: 'Problema técnico',
  mantenimiento: 'Mantenimiento', otro: 'Otro',
};

/** Historial inmutable de intervalos de trabajo; nunca mezcla piezas con operaciones únicas. */
export function HistorialSesionesProduccion({ orden, responsables }: {
  orden: OrdenTableroProduccion | null;
  responsables: Readonly<Record<string, string>>;
}) {
  const sesiones = [...(orden?.sesiones ?? [])]
    .sort((primera, segunda) => segunda.fechaInicio.localeCompare(primera.fechaInicio));
  return (
    <section aria-labelledby="titulo-historial-sesiones" className="rounded-lg border border-borde bg-superficie p-4">
      <h2 id="titulo-historial-sesiones" className="text-base font-semibold">Historial de sesiones</h2>
      {!orden ? <p className="mt-2 text-sm text-texto-secundario">Selecciona una orden para consultar sus sesiones.</p> : null}
      {orden && sesiones.length === 0 ? <p className="mt-2 text-sm text-texto-secundario">La orden aún no tiene sesiones de trabajo.</p> : null}
      {sesiones.length > 0 ? (
        <ol className="mt-3 grid gap-3 lg:grid-cols-2">
          {sesiones.map((sesion) => (
            <li key={sesion.id} className="rounded-md border border-borde p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <strong>{responsables[sesion.operadorId] ?? 'Operador histórico'}</strong>
                <span className="text-texto-secundario">{sesion.estadoSesion === 'activa' ? 'Activa' : sesion.estadoSesion === 'pausada' ? 'Pausada' : 'Finalizada'}</span>
              </div>
              <p className="mt-1 text-texto-secundario">
                {formatearFecha(sesion.fechaInicio)} · {formatearHora(sesion.fechaInicio)}–{sesion.fechaFin ? formatearHora(sesion.fechaFin) : 'en curso'}
              </p>
              <p className="mt-1 tabular-nums">{formatearNumero(sesion.horasNetas)} h netas · {formatearNumero(sesion.piezasProducidas)} piezas producidas</p>
              {sesion.motivoPausa ? <p className="mt-1">Incidencia: {MOTIVOS[sesion.motivoPausa] ?? sesion.motivoPausa}</p> : null}
              {sesion.notas ? <p className="mt-1 whitespace-pre-wrap text-texto-secundario">Notas: {sesion.notas}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
