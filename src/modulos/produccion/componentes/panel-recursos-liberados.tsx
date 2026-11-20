'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';
import { formatearFecha, formatearHora } from '@/compartido/utilidades/formatear';
import {
  mensajeFalloConfirmacionRecurso,
  mensajeLiberacionRecurso,
} from '@/modulos/produccion/utilidades/mensajes-reclamo-recurso';

import { reclamarRecursoAccion } from '../acciones/indice';
import { obtenerRecursosLiberablesAccion } from '../acciones/consultas-b6';
import type { RecursoLiberable } from '../servicios/consultas-b6-servicio';
import { CLAVE_RECURSOS_LIBERABLES } from './claves-consulta';

type MensajeRecursos = { texto: string; tipo: 'error' | 'estado' };

/**
 * SII-B6.2/C22: máquinas liberadas ≥60 min por pausa DUDA/MATERIAL. Cada fila
 * abre el detalle de la sesión pausada; reclamar libera la máquina y devuelve
 * la operación a Planeación para que el operador la vea de nuevo.
 */
export function PanelRecursosLiberados() {
  const enrutador = useRouter();
  const clienteConsultas = useQueryClient();
  const [mensaje, setMensaje] = useState<MensajeRecursos | null>(null);
  const [reclamando, setReclamando] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<RecursoLiberable | null>(null);
  // C31/A1: un doble clic debe llegar al servidor con el MISMO correlation.
  const correlaciones = useRef<Record<string, string>>({});

  const consulta = useQuery({
    queryKey: CLAVE_RECURSOS_LIBERABLES,
    queryFn: async () => {
      const resultado = await obtenerRecursosLiberablesAccion();
      if (!resultado.exito || !resultado.datos) {
        throw new Error(resultado.exito ? 'La consulta no devolvió datos' : resultado.error);
      }
      return resultado.datos;
    },
    refetchInterval: 60_000,
  });

  async function reclamar(recurso: RecursoLiberable): Promise<void> {
    setMensaje(null);
    setReclamando(recurso.sesionId);
    const correlationId = correlaciones.current[recurso.sesionId] ?? crypto.randomUUID();
    correlaciones.current[recurso.sesionId] = correlationId;
    try {
      const resultado = await reclamarRecursoAccion({
        recursoId: recurso.recursoId,
        sesionId: recurso.sesionId,
        correlationId,
      });
      setMensaje(resultado.exito
        ? {
            texto: mensajeLiberacionRecurso(
              resultado.datos!,
              recurso.recursoCodigo,
              recurso.ordenFolio,
            ),
            tipo: 'estado',
          }
        : { texto: resultado.error, tipo: 'error' });
      if (resultado.exito) {
        delete correlaciones.current[recurso.sesionId];
        setDetalle(null);
      } else {
        delete correlaciones.current[recurso.sesionId];
      }
      await clienteConsultas.invalidateQueries({ queryKey: CLAVE_RECURSOS_LIBERABLES });
    } catch {
      delete correlaciones.current[recurso.sesionId];
      setMensaje({
        texto: mensajeFalloConfirmacionRecurso(recurso.recursoCodigo),
        tipo: 'error',
      });
    } finally {
      setReclamando(null);
    }
  }

  const liberables = consulta.data ?? [];

  return (
    <section className="rounded-lg border border-borde bg-superficie p-4" data-testid="panel-recursos-liberados">
      <h2 className="text-base font-semibold text-texto-primario">Máquinas liberadas</h2>
      <p className="mt-1 text-xs text-texto-secundario">
        Pausas DUDA/MATERIAL de más de 60 minutos. Reclamar libera la máquina y
        devuelve la operación a Planeación para que otro operador la retome. Toca una fila
        para ver el detalle.
      </p>
      {consulta.isLoading && <Skeleton className="mt-3 h-16" />}
      {consulta.isError && (
        <p role="alert" className="mt-2 text-sm text-peligro-texto">
          {consulta.error instanceof Error ? consulta.error.message : 'No se pudieron cargar los recursos'}
        </p>
      )}
      {mensaje !== null && (
        <p
          role={mensaje.tipo === 'error' ? 'alert' : 'status'}
          className={mensaje.tipo === 'error' ? 'mt-2 text-sm text-peligro-texto' : 'mt-2 text-sm text-exito-texto'}
        >
          {mensaje.texto}
        </p>
      )}
      {!consulta.isLoading && !consulta.isError && liberables.length === 0 && (
        <p className="mt-2 text-xs text-texto-tenue" data-testid="sin-recursos-liberables">
          Sin máquinas liberables por ahora.
        </p>
      )}
      {liberables.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {liberables.map((recurso) => (
            <li
              key={recurso.sesionId}
              className="rounded-md border border-borde p-3 text-sm"
              data-testid={`recurso-liberable-${recurso.recursoCodigo}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setDetalle(recurso)}
                  aria-label={`Ver detalle de ${recurso.recursoNombre} para ${recurso.ordenFolio}`}
                  className="min-w-0 flex-1 rounded-md text-left transition-colors hover:bg-superficie-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
                >
                  <span className="block">
                    <strong>{recurso.recursoNombre}</strong>
                    <span className="font-mono text-xs text-texto-secundario"> ({recurso.recursoCodigo})</span>
                    {' · '}{recurso.ordenFolio} · {recurso.partidaCodigo}
                    {recurso.operacionNombre ? ` · ${recurso.operacionNombre}` : ''}
                  </span>
                  <span className="mt-1 block text-xs text-texto-secundario">
                    {recurso.operadorNombre} · {recurso.motivoNombre}
                    {recurso.pausadaDesde
                      ? ` · pausada el ${formatearFecha(recurso.pausadaDesde)} a las ${formatearHora(recurso.pausadaDesde)}`
                      : ''}
                  </span>
                </button>
                <Button
                  type="button"
                  tamano="sm"
                  disabled={reclamando === recurso.sesionId}
                  data-testid={`reclamar-recurso-${recurso.recursoCodigo}`}
                  onClick={() => void reclamar(recurso)}
                >
                  {reclamando === recurso.sesionId ? 'Reclamando…' : 'Reclamar'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={detalle !== null} onOpenChange={(abierto) => { if (!abierto) setDetalle(null); }}>
        <DialogContent data-testid="detalle-recurso-liberado" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Máquina liberada · {detalle?.recursoCodigo}</DialogTitle>
            <DialogDescription>
              {detalle?.recursoNombre} · {detalle?.ordenFolio} · {detalle?.partidaCodigo}
            </DialogDescription>
          </DialogHeader>
          {detalle ? (
            <div className="flex flex-col gap-3 text-sm">
              <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
                <dt className="text-texto-secundario">Operación</dt>
                <dd>{detalle.operacionNombre ?? 'Programación heredada sin ruteo'}</dd>
                <dt className="text-texto-secundario">Operador</dt>
                <dd>{detalle.operadorNombre}</dd>
                <dt className="text-texto-secundario">Motivo de pausa</dt>
                <dd>{detalle.motivoNombre}</dd>
                <dt className="text-texto-secundario">Pausada desde</dt>
                <dd>
                  {detalle.pausadaDesde
                    ? `${formatearFecha(detalle.pausadaDesde)} a las ${formatearHora(detalle.pausadaDesde)}`
                    : 'Sin fecha registrada'}
                </dd>
              </dl>
              <p className="rounded-base border border-borde bg-superficie-2/40 px-3 py-2 text-xs text-texto-secundario">
                Reclamar libera esta máquina y regresa la operación a Planeación como
                «programada». La pausa queda en el historial del operador con su motivo y sus
                horas; no se borra ningún dato.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variante="contorno"
                  tamano="sm"
                  onClick={() => {
                    const ordenId = detalle.ordenId;
                    setDetalle(null);
                    enrutador.push(`/produccion?ordenId=${ordenId}`);
                  }}
                >
                  Abrir orden en Producción
                </Button>
                <Button
                  type="button"
                  tamano="sm"
                  disabled={reclamando === detalle.sesionId}
                  onClick={() => void reclamar(detalle)}
                >
                  {reclamando === detalle.sesionId ? 'Reclamando…' : 'Reclamar y liberar'}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
