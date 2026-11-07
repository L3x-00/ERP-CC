'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/compartido/componentes/ui/dialog';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { formatearFecha, formatearHora, formatearNumero } from '@/compartido/utilidades/formatear';
import { registrarInspeccionAccion } from '@/modulos/produccion/acciones/registrar-inspeccion';
import { ETIQUETAS_TIPO_INSPECCION } from '@/modulos/produccion/utilidades/indice';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';

import {
  firmarFotoInspeccionAccion,
  obtenerInspeccionesOrdenAccion,
  obtenerPendientesCalidadAccion,
} from '../acciones/consultas-b6';
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
  const [partidaRevalidar, setPartidaRevalidar] = useState('');
  const [aprobadas, setAprobadas] = useState('0');
  const [scrapRevalidar, setScrapRevalidar] = useState('0');
  const [mensajeRevalidar, setMensajeRevalidar] = useState<
    { tipo: 'ok' | 'error'; texto: string } | null
  >(null);
  const [revalidando, setRevalidando] = useState(false);
  const queryClient = useQueryClient();

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

  const pendientes = useQuery({
    queryKey: [...CLAVE_INSPECCIONES_ORDEN, 'pendientes', orden?.id ?? 'sin-orden'],
    queryFn: async () => {
      if (!orden) return [];
      const respuesta = await obtenerPendientesCalidadAccion({ ordenId: orden.id });
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'La consulta no devolvió datos' : respuesta.error);
      }
      return respuesta.datos;
    },
    enabled: orden !== null,
  });
  const pendientesCalidad = pendientes.data ?? [];
  const partidaSeleccionada = pendientesCalidad.find(
    (partida) => partida.partidaId === partidaRevalidar,
  ) ?? pendientesCalidad[0] ?? null;

  async function revalidar(): Promise<void> {
    if (!orden || !partidaSeleccionada || revalidando) return;
    const recuperadas = Number(aprobadas);
    const scrap = Number(scrapRevalidar);
    if (!Number.isFinite(recuperadas) || !Number.isFinite(scrap)
      || recuperadas < 0 || scrap < 0 || recuperadas + scrap <= 0) {
      setMensajeRevalidar({ tipo: 'error', texto: 'Indica las piezas recuperadas o el scrap.' });
      return;
    }
    if (recuperadas + scrap > partidaSeleccionada.cantidadNokPendiente) {
      setMensajeRevalidar({
        tipo: 'error',
        texto: `Solo hay ${formatearNumero(partidaSeleccionada.cantidadNokPendiente, 0)} piezas pendientes.`,
      });
      return;
    }
    setRevalidando(true);
    const respuesta = await registrarInspeccionAccion({
      ordenId: orden.id,
      partidaId: partidaSeleccionada.partidaId,
      codigoItem: partidaSeleccionada.codigoItem,
      tipo: 'REVALIDACION',
      resultado: 'APROBADA',
      cantidadInspeccionada: recuperadas + scrap,
      cantidadOk: recuperadas,
      cantidadNok: 0,
      cantidadRetrabajo: 0,
      cantidadScrap: scrap,
      observaciones: 'Revalidación de piezas recuperables',
    });
    setRevalidando(false);
    if (!respuesta.exito) {
      setMensajeRevalidar({ tipo: 'error', texto: respuesta.error });
      return;
    }
    setMensajeRevalidar({
      tipo: 'ok',
      texto: `${formatearNumero(recuperadas, 0)} piezas vuelven a ser conformes${scrap > 0 ? ` y ${formatearNumero(scrap, 0)} van a scrap` : ''}.`,
    });
    setAprobadas('0');
    setScrapRevalidar('0');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: CLAVE_INSPECCIONES_ORDEN }),
      queryClient.invalidateQueries({ queryKey: [...CLAVE_INSPECCIONES_ORDEN, 'pendientes'] }),
    ]);
  }

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

      {orden && pendientesCalidad.length > 0 ? (
        <div className="mt-4 rounded-lg border border-advertencia/40 bg-advertencia-suave p-3" data-testid="panel-revalidacion">
          <h3 className="text-sm font-semibold text-advertencia-texto">Piezas recuperables pendientes</h3>
          <p className="mt-1 text-xs text-texto-secundario">
            Las piezas NOK no son conformes ni entregables. Al revalidarlas vuelven a contar como conformes.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <label className="text-xs font-medium text-texto-secundario">
              Ítem
              <Select
                className="mt-1"
                value={partidaSeleccionada?.partidaId ?? ''}
                onChange={(evento) => setPartidaRevalidar(evento.target.value)}
                data-testid="revalidar-partida"
              >
                {pendientesCalidad.map((partida) => (
                  <option key={partida.partidaId} value={partida.partidaId}>
                    {partida.codigoItem} · {formatearNumero(partida.cantidadNokPendiente, 0)} pendientes
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs font-medium text-texto-secundario">
              Recuperadas OK
              <Input
                className="mt-1"
                type="number"
                min="0"
                step="1"
                value={aprobadas}
                onChange={(evento) => setAprobadas(evento.target.value)}
                data-testid="revalidar-aprobadas"
              />
            </label>
            <label className="text-xs font-medium text-texto-secundario">
              Scrap definitivo
              <Input
                className="mt-1"
                type="number"
                min="0"
                step="1"
                value={scrapRevalidar}
                onChange={(evento) => setScrapRevalidar(evento.target.value)}
                data-testid="revalidar-scrap"
              />
            </label>
            <div className="flex items-end">
              <Button type="button" onClick={() => void revalidar()} disabled={revalidando} data-testid="revalidar-calidad">
                {revalidando ? 'Revalidando…' : 'Revalidar'}
              </Button>
            </div>
          </div>
          {mensajeRevalidar ? (
            <p
              role={mensajeRevalidar.tipo === 'error' ? 'alert' : 'status'}
              className={`mt-2 text-xs ${mensajeRevalidar.tipo === 'error' ? 'text-peligro-texto' : 'text-exito-texto'}`}
              data-testid="mensaje-revalidacion"
            >
              {mensajeRevalidar.texto}
            </p>
          ) : null}
        </div>
      ) : null}

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
