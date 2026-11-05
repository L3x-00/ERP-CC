'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/compartido/componentes/ui/dialog';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { formatearFecha, formatearHora, formatearNumero } from '@/compartido/utilidades/formatear';
import { ETIQUETAS_TIPO_INSPECCION } from '@/modulos/produccion/utilidades/indice';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';

import { firmarFotoInspeccionAccion, obtenerInspeccionesOrdenAccion } from '../acciones/consultas-b6';
import type { CorridaDetalle } from '../servicios/consultas-b6-servicio';
import { CLAVE_INSPECCIONES_ORDEN } from './claves-consulta';

/**
 * SII-B6.3: calidad por orden en solo lectura. Las inspecciones las registra el
 * operador desde su flujo de trabajo; aquí administración consulta el resumen y
 * las evidencias, sin formularios de captura paralelos.
 */
export function PanelCalidadProduccion({
  orden,
  corridas,
}: {
  orden: OrdenTableroProduccion | null;
  corridas: CorridaDetalle[];
}) {
  const [resumenId, setResumenId] = useState<string | null>(null);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: [...CLAVE_INSPECCIONES_ORDEN, orden?.id ?? 'sin-orden'],
    queryFn: async () => {
      if (!orden) return [];
      const respuesta = await obtenerInspeccionesOrdenAccion({ ordenId: orden.id });
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'La consulta no devolvió datos' : respuesta.error);
      }
      return respuesta.datos;
    },
    enabled: orden !== null,
  });
  const inspecciones = consulta.data ?? [];
  const seleccionada = inspecciones.find((inspeccion) => inspeccion.id === resumenId) ?? null;

  async function abrirFoto(archivoId: string): Promise<void> {
    setErrorFoto(null);
    const respuesta = await firmarFotoInspeccionAccion(archivoId);
    if (!respuesta.exito) {
      setErrorFoto(respuesta.error);
      return;
    }
    window.open(respuesta.datos?.url, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="rounded-lg border border-borde bg-superficie p-4" data-testid="panel-calidad">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-texto-primario">Calidad</h2>
          <p className="text-xs text-texto-secundario">
            Inspecciones registradas por el operador al liberar la primera pieza y al cerrar el proceso.
          </p>
        </div>
      </div>
      {!orden && <p className="mt-2 text-sm text-texto-secundario">Selecciona una orden del Kanban.</p>}
      {orden && corridas.length === 0 && (
        <p className="mt-2 text-sm text-texto-secundario">
          Crea o inicia una corrida para que el operador registre inspecciones de la orden {orden.folio}.
        </p>
      )}
      {consulta.isError && (
        <p role="alert" className="mt-2 text-sm text-peligro-texto">
          No se pudieron cargar las inspecciones. Vuelve a intentarlo.
        </p>
      )}
      {errorFoto ? (
        <p role="alert" className="mt-2 text-sm text-peligro-texto">{errorFoto}</p>
      ) : null}

      {orden && inspecciones.length === 0 && corridas.length > 0 && (
        <EstadoVacio
          titulo="Sin inspecciones"
          descripcion="El operador registrará la primera pieza y el cierre desde su sesión de trabajo."
        />
      )}

      {inspecciones.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2" data-testid="lista-inspecciones">
          {inspecciones.map((inspeccion) => (
            <li key={inspeccion.id} className="rounded-md border border-borde p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{ETIQUETAS_TIPO_INSPECCION[inspeccion.tipo]}</strong>
                  {' · '}{inspeccion.resultado === 'APROBADA' ? 'Aprobada' : 'Rechazada'}
                  {inspeccion.referencia !== null ? ` · ref ${inspeccion.referencia}` : ''}
                  {inspeccion.corridaCodigo ? ` · ${inspeccion.corridaCodigo}` : ''}
                </span>
                <span className="flex items-center gap-2 text-xs text-texto-secundario">
                  {formatearFecha(inspeccion.creadoEn)} {formatearHora(inspeccion.creadoEn)}
                  <Button
                    type="button"
                    tamano="sm"
                    variante="contorno"
                    onClick={() => setResumenId(inspeccion.id)}
                    data-testid={`ver-resumen-inspeccion-${inspeccion.id}`}
                  >
                    Ver resumen
                  </Button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={seleccionada !== null} onOpenChange={(abierto) => !abierto && setResumenId(null)}>
        <DialogContent data-testid="resumen-inspeccion" aria-label="Resumen de la inspección">
          <DialogHeader>
            <DialogTitle>Resumen de la inspección</DialogTitle>
            <DialogDescription>
              {seleccionada
                ? `${ETIQUETAS_TIPO_INSPECCION[seleccionada.tipo]} · ${formatearFecha(seleccionada.creadoEn)} ${formatearHora(seleccionada.creadoEn)}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {seleccionada ? (
            <div className="flex flex-col gap-3 text-sm">
              <dl className="grid grid-cols-2 gap-3 rounded-lg bg-superficie-2 p-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-texto-tenue">Resultado</dt>
                  <dd className="font-semibold text-texto-primario">
                    {seleccionada.resultado === 'APROBADA' ? 'Aprobada' : 'Rechazada'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-texto-tenue">Pieza</dt>
                  <dd className="text-texto-primario">{seleccionada.codigoItem || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-texto-tenue">Buenas</dt>
                  <dd className="text-texto-primario">{formatearNumero(seleccionada.cantidadOk, 0)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-texto-tenue">Con defecto</dt>
                  <dd className="text-texto-primario">{formatearNumero(seleccionada.cantidadNok, 0)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-texto-tenue">Retrabajo</dt>
                  <dd className="text-texto-primario">{formatearNumero(seleccionada.cantidadRetrabajo, 0)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-texto-tenue">Lote / partida</dt>
                  <dd className="text-texto-primario">
                    {[seleccionada.corridaCodigo, seleccionada.partidaCodigo].filter(Boolean).join(' · ') || '—'}
                  </dd>
                </div>
              </dl>
              {seleccionada.observaciones ? (
                <p className="whitespace-pre-line text-texto-secundario">{seleccionada.observaciones}</p>
              ) : null}
              {seleccionada.fotos.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {seleccionada.fotos.map((foto) => (
                    <button
                      key={foto.id}
                      type="button"
                      className="text-xs font-semibold text-acento-texto hover:underline"
                      onClick={() => void abrirFoto(foto.id)}
                    >
                      {foto.nombreOriginal}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-texto-tenue">Sin evidencia fotográfica.</p>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => setResumenId(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
