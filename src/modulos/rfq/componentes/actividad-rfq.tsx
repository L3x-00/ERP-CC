'use client';

import { useQuery } from '@tanstack/react-query';

import { formatearFecha, formatearHora } from '@/compartido/utilidades/formatear';
import { obtenerActividadAccion } from '@/modulos/auditoria/acciones/obtener-actividad';
import { etiquetaAccion, etiquetaModulo } from '@/modulos/auditoria/utilidades/actividad';

/** Pestaña Actividad: bitácora operativa del RFQ (módulo `logs`). */
export function ActividadRfq({ rfqId }: { rfqId: string }) {
  const consulta = useQuery({
    queryKey: ['rfq-actividad', rfqId],
    queryFn: () => obtenerActividadAccion({ recursoId: rfqId, limite: 30 }),
  });

  const registros = consulta.data?.exito ? (consulta.data.datos?.registros ?? []) : [];

  if (consulta.isLoading) {
    return <p className="text-sm text-texto-secundario">Cargando actividad…</p>;
  }
  if (consulta.isError || (consulta.data && !consulta.data.exito)) {
    return (
      <p role="alert" className="text-sm text-peligro-texto">
        No se pudo cargar la actividad del RFQ.
      </p>
    );
  }
  if (registros.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-borde px-4 py-6 text-center text-sm text-texto-secundario">
        Sin actividad registrada para este RFQ.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" data-testid="actividad-rfq">
      {registros.map((registro) => (
        <li
          key={registro.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borde bg-superficie px-3 py-2"
        >
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {etiquetaAccion(registro.accion)}
              <span className="ml-2 text-xs font-normal text-texto-secundario">
                {etiquetaModulo(registro.modulo)}
              </span>
            </span>
            <span className="text-xs text-texto-secundario">
              {registro.nombreUsuario} · {registro.rol}
            </span>
          </div>
          <span className="text-xs text-texto-secundario">
            {formatearFecha(registro.creadoEn)} {formatearHora(registro.creadoEn)}
          </span>
        </li>
      ))}
    </ul>
  );
}
