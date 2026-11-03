'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Input } from '@/compartido/componentes/ui/input';
import { descargarUrlFirmada } from '@/compartido/utilidades/descargar-archivo';
import { formatearFecha, formatearHora, formatearNumero } from '@/compartido/utilidades/formatear';
import type { ArchivoSesionResumen } from '@/modulos/produccion/archivos-sesion-config';
import {
  obtenerArchivosSesionOrdenAccion,
  obtenerUrlArchivoSesionAccion,
} from '@/modulos/produccion/acciones/archivos-sesion';
import { CLAVE_ARCHIVOS_SESION } from '@/modulos/produccion/componentes/claves-consulta';
import { subirArchivoSesionDesdeNavegador } from '@/modulos/produccion/subir-archivo-sesion-cliente';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';

const MOTIVOS: Record<string, string> = {
  falta_informacion: 'Falta de información',
  material_pendiente: 'Material pendiente',
  aprobacion_cliente: 'Aprobación de cliente',
  problema_tecnico: 'Problema técnico',
  mantenimiento: 'Mantenimiento',
  otro: 'Otro',
};

function etiquetaEstado(estado: string): string {
  if (estado === 'activa') return 'Activa';
  if (estado === 'pausada') return 'Pausada';
  return 'Finalizada';
}

/**
 * Historial inmutable de intervalos de trabajo. La tabla resume cada sesión y
 * el detalle completo (incidencias, notas y archivos) se consulta en un modal;
 * así el panel deja de crecer con cada turno y conserva el contexto a un clic.
 */
export function HistorialSesionesProduccion({ orden, responsables, soloLectura = false }: {
  orden: OrdenTableroProduccion | null;
  responsables: Readonly<Record<string, string>>;
  /** Orden concluida: consulta los archivos de cada sesión, pero no adjunta nuevos. */
  soloLectura?: boolean;
}) {
  const clienteConsultas = useQueryClient();
  const [subiendoSesionId, setSubiendoSesionId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ sesionId: string; texto: string } | null>(null);
  const [sesionAbiertaId, setSesionAbiertaId] = useState<string | null>(null);
  const consulta = useQuery({
    queryKey: [...CLAVE_ARCHIVOS_SESION, orden?.id],
    queryFn: async (): Promise<ArchivoSesionResumen[]> => {
      const respuesta = await obtenerArchivosSesionOrdenAccion({ ordenId: orden?.id });
      if (!respuesta.exito || !respuesta.datos) throw new Error('No se pudieron consultar los archivos de sesión');
      return respuesta.datos;
    },
    enabled: orden !== null,
    staleTime: 30_000,
  });
  const archivosPorSesion = new Map<string, ArchivoSesionResumen[]>();
  for (const archivo of consulta.data ?? []) {
    const actuales = archivosPorSesion.get(archivo.sesionId) ?? [];
    if (archivo.clase === 'sesion') actuales.push(archivo);
    archivosPorSesion.set(archivo.sesionId, actuales);
  }

  async function subir(evento: FormEvent<HTMLFormElement>, sesionId: string): Promise<void> {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const archivo = new FormData(formulario).get('archivo');
    if (!(archivo instanceof File)) {
      setMensaje({ sesionId, texto: 'Selecciona un archivo de hasta 20 MiB' });
      return;
    }
    setSubiendoSesionId(sesionId);
    setMensaje(null);
    try {
      await subirArchivoSesionDesdeNavegador(sesionId, 'sesion', archivo);
      formulario.reset();
      setMensaje({ sesionId, texto: 'Archivo asociado a la sesión' });
      await clienteConsultas.invalidateQueries({ queryKey: CLAVE_ARCHIVOS_SESION }).catch(() => {
        setMensaje({ sesionId, texto: 'Archivo asociado; actualiza la lista para verlo' });
      });
    } catch (error) {
      setMensaje({ sesionId, texto: error instanceof Error ? error.message : 'No se pudo subir el archivo' });
    } finally {
      setSubiendoSesionId(null);
    }
  }

  async function abrir(archivoId: string, descargar = false): Promise<void> {
    if (!orden) return;
    const resultado = await obtenerUrlArchivoSesionAccion(
      descargar ? { ordenId: orden.id, archivoId, descargar: true } : { ordenId: orden.id, archivoId },
    );
    if (!resultado.exito || !resultado.datos) {
      setMensaje({ sesionId: '', texto: resultado.exito ? 'No se pudo abrir el archivo' : resultado.error });
      return;
    }
    if (descargar) {
      descargarUrlFirmada(resultado.datos.url);
      return;
    }
    window.open(resultado.datos.url, '_blank', 'noopener,noreferrer');
  }

  const sesiones = [...(orden?.sesiones ?? [])]
    .sort((primera, segunda) => segunda.fechaInicio.localeCompare(primera.fechaInicio));
  const sesionAbierta = sesiones.find((sesion) => sesion.id === sesionAbiertaId) ?? null;
  const archivosSesionAbierta = sesionAbierta ? archivosPorSesion.get(sesionAbierta.id) ?? [] : [];

  return (
    <section aria-labelledby="titulo-historial-sesiones" className="rounded-lg border border-borde bg-superficie p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="titulo-historial-sesiones" className="text-base font-semibold">Historial de sesiones</h2>
          <p className="mt-1 text-xs text-texto-secundario">
            Cada fila resume un turno de trabajo. Ábrela para ver notas, incidencias y archivos.
          </p>
        </div>
        {soloLectura ? (
          <p className="text-xs text-texto-secundario" data-testid="sesion-solo-lectura">
            Vista de consulta: los archivos quedan en solo lectura.
          </p>
        ) : null}
      </div>
      {!orden ? <p className="mt-2 text-sm text-texto-secundario">Selecciona una orden para consultar sus sesiones.</p> : null}
      {orden && sesiones.length === 0 ? <p className="mt-2 text-sm text-texto-secundario">La orden aún no tiene sesiones de trabajo.</p> : null}
      {orden && consulta.isError ? <p role="alert" className="mt-2 text-sm text-peligro-texto">No se pudieron cargar los archivos de sesión.</p> : null}
      {mensaje?.sesionId === '' ? <p role="alert" className="mt-2 text-sm text-peligro-texto">{mensaje.texto}</p> : null}

      {sesiones.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-sm" data-testid="tabla-historial-sesiones">
            <caption className="sr-only">Resumen de sesiones de trabajo de la orden</caption>
            <thead>
              <tr className="border-b border-borde text-left text-xs uppercase tracking-wide text-texto-secundario">
                <th scope="col" className="py-2 pr-3 font-medium">Operador</th>
                <th scope="col" className="py-2 pr-3 font-medium">Periodo</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Horas</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Piezas</th>
                <th scope="col" className="py-2 pr-3 font-medium">Estado</th>
                <th scope="col" className="py-2 pr-3 font-medium">Archivos</th>
                <th scope="col" className="py-2 text-right font-medium"><span className="sr-only">Detalle</span></th>
              </tr>
            </thead>
            <tbody>
              {sesiones.map((sesion) => {
                const archivos = archivosPorSesion.get(sesion.id) ?? [];
                const incidencia = sesion.motivoPausa
                  ? MOTIVOS[sesion.motivoPausa] ?? sesion.motivoPausa
                  : null;
                return (
                  <tr
                    key={sesion.id}
                    data-testid={`sesion-resumen-${sesion.id}`}
                    tabIndex={0}
                    role="button"
                    aria-label={`Abrir detalle de la sesión de ${responsables[sesion.operadorId] ?? 'operador'}`}
                    onClick={() => {
                      setMensaje(null);
                      setSesionAbiertaId(sesion.id);
                    }}
                    onKeyDown={(evento) => {
                      if (evento.key === 'Enter' || evento.key === ' ') {
                        evento.preventDefault();
                        setMensaje(null);
                        setSesionAbiertaId(sesion.id);
                      }
                    }}
                    className="cursor-pointer border-b border-borde/70 align-top transition-colors last:border-b-0 hover:bg-superficie-2/60 focus-visible:bg-superficie-2/60 focus-visible:outline-none"
                  >
                    <td className="py-2 pr-3">
                      <p className="font-medium text-texto-primario">
                        {responsables[sesion.operadorId] ?? 'Operador histórico'}
                      </p>
                      {sesion.notas ? (
                        <p className="mt-0.5 max-w-[18rem] truncate text-xs text-texto-secundario" title={sesion.notas}>
                          {sesion.notas}
                        </p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-texto-secundario">
                      {formatearFecha(sesion.fechaInicio)}
                      <br />
                      {formatearHora(sesion.fechaInicio)}–{sesion.fechaFin ? formatearHora(sesion.fechaFin) : 'en curso'}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                      {formatearNumero(sesion.horasNetas)} h
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                      {formatearNumero(sesion.piezasProducidas)}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-xs">
                      <span className={sesion.estadoSesion === 'activa'
                        ? 'rounded-full bg-exito-suave px-2 py-0.5 font-medium text-exito-texto'
                        : 'text-texto-secundario'}>
                        {etiquetaEstado(sesion.estadoSesion)}
                      </span>
                      {incidencia ? (
                        <p className="mt-0.5 text-[11px] text-texto-secundario">{incidencia}</p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-texto-secundario">
                      {archivos.length} archivo{archivos.length === 1 ? '' : 's'}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right">
                      <span className="text-xs font-semibold text-acento">Ver detalle</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <Dialog
        open={sesionAbierta !== null}
        onOpenChange={(abierto) => {
          if (!abierto) {
            setSesionAbiertaId(null);
            setMensaje(null);
          }
        }}
      >
        <DialogContent
          className="flex max-h-[90vh] max-w-2xl flex-col gap-4 overflow-hidden"
          data-testid="detalle-sesion-trabajo"
        >
          <DialogHeader>
            <DialogTitle>
              Sesión de {sesionAbierta ? responsables[sesionAbierta.operadorId] ?? 'operador histórico' : 'trabajo'}
            </DialogTitle>
            <DialogDescription>
              {sesionAbierta
                ? `${formatearFecha(sesionAbierta.fechaInicio)} · ${formatearHora(sesionAbierta.fechaInicio)}–${sesionAbierta.fechaFin ? formatearHora(sesionAbierta.fechaFin) : 'en curso'}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {sesionAbierta ? (
            <div className="min-h-0 flex-1 overflow-y-auto scroll-sutil pr-1">
              <dl className="grid grid-cols-2 gap-3 rounded-lg bg-superficie-2 p-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-texto-secundario">Estado</dt>
                  <dd className="font-medium">{etiquetaEstado(sesionAbierta.estadoSesion)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-texto-secundario">Horas netas</dt>
                  <dd className="font-medium tabular-nums">{formatearNumero(sesionAbierta.horasNetas)} h</dd>
                </div>
                <div>
                  <dt className="text-xs text-texto-secundario">Piezas</dt>
                  <dd className="font-medium tabular-nums">{formatearNumero(sesionAbierta.piezasProducidas)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-texto-secundario">Archivos</dt>
                  <dd className="font-medium tabular-nums">{archivosSesionAbierta.length}</dd>
                </div>
              </dl>

              {sesionAbierta.motivoPausa ? (
                <p className="mt-3 text-sm">
                  <span className="text-texto-secundario">Incidencia: </span>
                  {MOTIVOS[sesionAbierta.motivoPausa] ?? sesionAbierta.motivoPausa}
                </p>
              ) : null}
              {sesionAbierta.notas ? (
                <div className="mt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-texto-secundario">Notas</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{sesionAbierta.notas}</p>
                </div>
              ) : null}

              <div className="mt-4 border-t border-borde pt-3">
                <h3 className="text-sm font-medium">Archivos de esta sesión</h3>
                {archivosSesionAbierta.length === 0
                  ? <p className="mt-1 text-sm text-texto-secundario">Sin archivos asociados.</p>
                  : <ul className="mt-2 grid gap-2">
                    {archivosSesionAbierta.map((archivo) => (
                      <li key={archivo.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-borde p-2">
                        <span className="min-w-0 truncate" title={archivo.nombre}>{archivo.nombre}</span>
                        <span className="flex shrink-0 gap-1">
                          <Button type="button" variante="contorno" tamano="sm" onClick={() => void abrir(archivo.id)}>
                            Abrir en lectura
                          </Button>
                          <Button
                            type="button"
                            variante="fantasma"
                            tamano="sm"
                            aria-label={`Descargar ${archivo.nombre}`}
                            onClick={() => void abrir(archivo.id, true)}
                          >
                            Descargar
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>}
                {soloLectura ? (
                  <p className="mt-2 text-xs text-texto-secundario">
                    Vista de consulta: los archivos de la sesión quedan en solo lectura.
                  </p>
                ) : (
                  <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(evento) => void subir(evento, sesionAbierta.id)}>
                    <label className="grid min-w-0 flex-1 gap-1 text-xs text-texto-secundario">
                      Adjuntar a esta sesión (hasta 20 MiB)
                      <Input
                        name="archivo"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.dxf,.dwg,.step,.stp,.igs,.iges,.eps,.ai"
                        aria-label={`Archivo para sesión ${formatearFecha(sesionAbierta.fechaInicio)}`}
                      />
                    </label>
                    <Button type="submit" tamano="sm" disabled={subiendoSesionId !== null}>
                      {subiendoSesionId === sesionAbierta.id ? 'Subiendo…' : 'Subir archivo'}
                    </Button>
                  </form>
                )}
                {mensaje?.sesionId === sesionAbierta.id ? (
                  <p role="status" className="mt-1 text-texto-secundario">{mensaje.texto}</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
