'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { formatearFecha, formatearHora, formatearNumero } from '@/compartido/utilidades/formatear';
import { obtenerResumenOrdenAccion } from '@/modulos/ordenes/acciones/obtener-resumen-orden';
import { obtenerUrlArchivoFichaAccion } from '@/modulos/ordenes/acciones/obtener-url-archivo-ficha';
import { formatearFechaCalendario } from '@/modulos/ordenes/utilidades/formato-ficha';
import {
  enlacePropuestaOrigen,
  enlaceRfqOrigen,
} from '@/modulos/ordenes/utilidades/enlaces-origen';
import type { ResumenOrden, SesionResumenOrden } from '@/modulos/ordenes/tipos/resumen-orden';

const ETIQUETA_PRIORIDAD: Record<string, string> = {
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

const ETIQUETA_SESION: Record<SesionResumenOrden['estadoSesion'], string> = {
  activa: 'Activa',
  pausada: 'Pausada',
  finalizada: 'Finalizada',
};

function Dato({ etiqueta, valor, testid }: { etiqueta: string; valor: string; testid?: string }) {
  return (
    <div className="rounded-md bg-superficie-2/60 p-2">
      <dt className="text-[11px] uppercase tracking-wide text-texto-tenue">{etiqueta}</dt>
      <dd className="text-sm font-semibold tabular-nums text-texto-primario" data-testid={testid}>
        {valor}
      </dd>
    </div>
  );
}

function horas(valor: number): string {
  return `${formatearNumero(valor, 1)} h`;
}

/**
 * C10.5: resumen interactivo de una orden sin salir de la cola. Reúne lo que se
 * capturó en RFQ/Propuesta/Planeación y Producción: origen comercial, partidas,
 * archivos, PDF, horas, eficiencia y sesiones, con acceso al documento y a la
 * nota de entrega. Los permisos y los folios se resuelven en servidor.
 */
export function ModalResumenOrden({
  abierto,
  ordenId,
  folio,
  onCerrar,
}: {
  abierto: boolean;
  ordenId: string;
  folio: string;
  onCerrar: () => void;
}) {
  const [abriendoArchivo, setAbriendoArchivo] = useState<string | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: ['ordenes', 'resumen', ordenId],
    queryFn: async (): Promise<ResumenOrden> => {
      const respuesta = await obtenerResumenOrdenAccion({ ordenId });
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'El resumen no devolvió datos' : respuesta.error);
      }
      return respuesta.datos;
    },
    enabled: abierto && ordenId !== '',
    staleTime: 30_000,
  });

  const resumen = consulta.data;
  const origen = resumen?.origen ?? null;
  const enlaceRfq = origen && resumen?.permisos.verRfq ? enlaceRfqOrigen(origen.rfqId) : null;
  const enlacePropuesta = origen && resumen?.permisos.verPropuesta
    ? enlacePropuestaOrigen(origen.propuestaId)
    : null;

  async function abrirArchivo(archivoId: string): Promise<void> {
    setErrorArchivo(null);
    setAbriendoArchivo(archivoId);
    try {
      const respuesta = await obtenerUrlArchivoFichaAccion({ ordenId, archivoId });
      if (!respuesta.exito || !respuesta.datos) {
        setErrorArchivo(respuesta.exito ? 'No se pudo abrir el archivo' : respuesta.error);
        return;
      }
      window.open(respuesta.datos.url, '_blank', 'noopener,noreferrer');
    } catch {
      setErrorArchivo('No se pudo abrir el archivo. Intenta de nuevo.');
    } finally {
      setAbriendoArchivo(null);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(valor) => (valor ? undefined : onCerrar())}>
      <DialogContent
        className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-4 overflow-y-auto"
        data-testid="modal-resumen-orden"
        aria-label={`Resumen de la orden ${folio}`}
      >
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base text-texto-secundario">
              {resumen?.orden.folioSii ?? resumen?.orden.folio ?? folio}
            </span>
            {resumen ? <BadgeEstado estado={resumen.orden.estadoSii} /> : null}
            {resumen?.orden.esInterna ? <Badge variante="neutro">TI</Badge> : null}
            {resumen ? (
              <Badge variante={resumen.orden.prioridad === 'urgente' ? 'peligro' : resumen.orden.prioridad === 'alta' ? 'alerta' : 'neutro'}>
                {ETIQUETA_PRIORIDAD[resumen.orden.prioridad] ?? resumen.orden.prioridad}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {resumen?.orden.clienteNombre ?? (resumen?.orden.esInterna ? 'Trabajo interno' : 'Cliente sin nombre')}
            {resumen?.orden.archivadaEn ? ' · Orden archivada' : ''}
          </DialogDescription>
        </DialogHeader>

        {consulta.isLoading ? (
          <p className="py-8 text-center text-sm text-texto-secundario" role="status">
            Cargando el resumen de {folio}…
          </p>
        ) : null}

        {consulta.isError ? (
          <div className="flex flex-col items-start gap-2 rounded-md bg-peligro-suave p-3 text-sm text-peligro-texto">
            <p role="alert">
              {consulta.error instanceof Error ? consulta.error.message : 'No se pudo cargar el resumen.'}
            </p>
            <Button variante="contorno" tamano="sm" onClick={() => void consulta.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : null}

        {resumen ? (
          <>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="resumen-datos">
              <Dato
                etiqueta="Fecha requerida"
                valor={resumen.orden.fechaRequerida
                  ? formatearFechaCalendario(resumen.orden.fechaRequerida)
                  : 'Sin fecha'}
                testid="resumen-fecha-requerida"
              />
              <Dato
                etiqueta="Fecha aprobación"
                valor={formatearFecha(resumen.orden.fechaAprobacion)}
                testid="resumen-fecha-aprobacion"
              />
              <Dato etiqueta="Horas estimadas" valor={horas(resumen.horas.estimadas)} testid="resumen-horas-estimadas" />
              <Dato etiqueta="Horas reales" valor={horas(resumen.horas.reales)} testid="resumen-horas-reales" />
              <Dato
                etiqueta="Eficiencia"
                valor={resumen.horas.eficiencia === null ? 'Sin tiempo real' : `${formatearNumero(resumen.horas.eficiencia, 1)} %`}
                testid="resumen-eficiencia"
              />
              <Dato etiqueta="Sesiones" valor={String(resumen.horas.sesiones)} testid="resumen-sesiones-total" />
            </dl>

            <section
              aria-label="Origen comercial"
              data-testid="resumen-origen"
              className="rounded-lg border border-borde p-3"
            >
              <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">
                Origen comercial
              </h3>
              {origen ? (
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                  <div className="min-w-0">
                    <dt className="text-texto-tenue">RFQ</dt>
                    <dd className="truncate font-mono">
                      {origen.rfqFolio === null
                        ? 'No disponible'
                        : enlaceRfq
                          ? <Link href={enlaceRfq} className="text-acento underline" prefetch={false}>{origen.rfqFolio}</Link>
                          : origen.rfqFolio}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-texto-tenue">Propuesta</dt>
                    <dd className="truncate font-mono">
                      {origen.propuestaFolio === null
                        ? 'No disponible'
                        : enlacePropuesta
                          ? <Link href={enlacePropuesta} className="text-acento underline" prefetch={false}>{origen.propuestaFolio}</Link>
                          : origen.propuestaFolio}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-texto-tenue">Revisión aceptada</dt>
                    <dd className="truncate font-mono">
                      {origen.revisionFolio ?? 'No disponible'}
                      {origen.revisionLetra ? <span className="font-sans text-texto-secundario"> · {origen.revisionLetra}</span> : null}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-texto-secundario">Sin origen comercial (orden interna o histórica).</p>
              )}
            </section>

            <section aria-label="Partidas" className="rounded-lg border border-borde p-3" data-testid="resumen-partidas">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">
                Partidas ({resumen.partidas.length})
              </h3>
              {resumen.partidas.length === 0 ? (
                <p className="mt-2 text-sm text-texto-secundario">Sin partidas registradas.</p>
              ) : (
                <ul className="mt-2 grid gap-1.5">
                  {resumen.partidas.map((partida) => (
                    <li key={partida.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-superficie-2/50 px-2 py-1.5 text-sm">
                      <span className="min-w-0">
                        <span className="font-mono font-semibold">{partida.codigoPieza}</span>
                        {partida.descripcion ? <span className="text-texto-secundario"> · {partida.descripcion}</span> : null}
                      </span>
                      <span className="shrink-0 tabular-nums text-texto-secundario">
                        {formatearNumero(partida.cantidadProducida, 0)}/{formatearNumero(partida.cantidadSolicitada, 0)} {partida.unidadMedida}
                        {partida.procesos.length > 0 ? ` · ${partida.procesos.join(', ')}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Documentos" className="rounded-lg border border-borde p-3" data-testid="resumen-archivos">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">
                Documentos ({resumen.archivos.length})
              </h3>
              <p className="mt-1 text-xs text-texto-secundario">
                Incluye planos del RFQ, el PDF de la propuesta aceptada y archivos de la orden. Se abren con URL firmada.
              </p>
              {errorArchivo ? <p role="alert" className="mt-2 text-sm text-peligro-texto">{errorArchivo}</p> : null}
              {resumen.archivos.length === 0 ? (
                <p className="mt-2 text-sm text-texto-secundario">Sin documentos congelados en la orden.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {resumen.archivos.map((archivo) => {
                    const nombre = archivo.nombreOriginal ?? archivo.nombreErp ?? 'Archivo sin nombre';
                    const esPdf = nombre.toLowerCase().endsWith('.pdf');
                    return (
                      <li key={archivo.archivoId}>
                        <button
                          type="button"
                          disabled={!archivo.disponible || abriendoArchivo === archivo.archivoId}
                          onClick={() => void abrirArchivo(archivo.archivoId)}
                          data-testid={`resumen-archivo-${archivo.archivoId}`}
                          className="inline-flex max-w-full items-center gap-2 rounded-md border border-borde bg-superficie px-2.5 py-1.5 text-left text-xs font-medium text-texto-primario transition-colors hover:bg-superficie-2 disabled:cursor-not-allowed disabled:opacity-50"
                          title={archivo.disponible ? `Abrir ${nombre}` : 'Archivo no disponible'}
                        >
                          <span aria-hidden>{esPdf ? '📄' : '📎'}</span>
                          <span className="max-w-56 truncate">{nombre}</span>
                          <span className="shrink-0 text-texto-tenue">{archivo.origen}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-label="Historial de sesiones" className="rounded-lg border border-borde p-3" data-testid="resumen-sesiones">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">
                Historial de sesiones ({resumen.sesiones.length})
              </h3>
              {resumen.sesiones.length === 0 ? (
                <p className="mt-2 text-sm text-texto-secundario">La orden aún no tiene sesiones de trabajo.</p>
              ) : (
                <ol className="mt-2 grid gap-2">
                  {resumen.sesiones.map((sesion) => (
                    <li key={sesion.id} className="rounded-md border border-borde p-2.5 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold">
                          {formatearFecha(sesion.fechaInicio)}
                          <span className="ml-2 font-normal text-texto-secundario">{sesion.operadorNombre}</span>
                          <span className="ml-2 font-normal tabular-nums text-texto-secundario">
                            {formatearHora(sesion.fechaInicio)}–{sesion.fechaFin ? formatearHora(sesion.fechaFin) : 'en curso'}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-exito-texto">
                          {horas(sesion.horasNetas)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-info-suave px-2 py-0.5 text-xs font-medium text-info-texto">
                          <span className="truncate">
                            {sesion.partidaCodigo} · {sesion.proceso}
                          </span>
                          <span className="shrink-0 tabular-nums">+{formatearNumero(sesion.piezasProducidas, 0)} pzas</span>
                        </span>
                        <Badge variante={sesion.estadoSesion === 'activa' ? 'exito' : sesion.estadoSesion === 'pausada' ? 'alerta' : 'neutro'}>
                          {ETIQUETA_SESION[sesion.estadoSesion]}
                        </Badge>
                      </div>
                      {sesion.motivoPausa ? <p className="mt-1 text-xs text-advertencia-texto">Incidencia: {sesion.motivoPausa}</p> : null}
                      {sesion.notas ? <p className="mt-1 whitespace-pre-wrap text-xs text-texto-secundario">{sesion.notas}</p> : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {resumen.orden.notas ? (
              <p className="rounded-md bg-superficie-2 p-3 text-sm text-texto-secundario">
                <span className="font-semibold text-texto-primario">Notas de la orden: </span>
                {resumen.orden.notas}
              </p>
            ) : null}
          </>
        ) : null}

        <DialogFooter className="static">
          {enlaceRfq ? (
            <Link
              href={enlaceRfq}
              prefetch={false}
              className="inline-flex h-9 items-center rounded-lg border border-borde-fuerte px-3 text-sm font-semibold text-texto-primario transition-colors hover:bg-superficie-2"
            >
              Ver RFQ
            </Link>
          ) : null}
          {enlacePropuesta ? (
            <Link
              href={enlacePropuesta}
              prefetch={false}
              className="inline-flex h-9 items-center rounded-lg border border-borde-fuerte px-3 text-sm font-semibold text-texto-primario transition-colors hover:bg-superficie-2"
            >
              Ver propuesta
            </Link>
          ) : null}
          <Link
            href={`/ordenes/${ordenId}?pestana=documento`}
            target="_blank"
            rel="noreferrer"
            data-testid="resumen-orden-servicio"
            className="inline-flex h-9 items-center rounded-lg border border-borde-fuerte px-3 text-sm font-semibold text-texto-primario transition-colors hover:bg-superficie-2"
          >
            Orden de servicio
          </Link>
          {resumen?.entrega ? (
            <Link
              href={`/entregas/${resumen.entrega.id}`}
              target="_blank"
              rel="noreferrer"
              data-testid="resumen-nota-entrega"
              className="inline-flex h-9 items-center rounded-lg border border-borde-fuerte px-3 text-sm font-semibold text-texto-primario transition-colors hover:bg-superficie-2"
            >
              Nota de entrega
            </Link>
          ) : (
            <Button variante="contorno" tamano="sm" disabled title="La orden aún no tiene notas de entrega">
              Nota de entrega
            </Button>
          )}
          <Button type="button" variante="contorno" onClick={onCerrar} data-testid="cerrar-resumen-orden">
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
