'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/compartido/componentes/ui/button';
import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { obtenerAdjuntosAccion } from '@/modulos/pipeline/acciones/obtener-adjuntos';
import { obtenerUrlAdjuntoAccion } from '@/modulos/pipeline/acciones/obtener-url-adjunto';
import { eliminarAdjuntoAccion } from '@/modulos/pipeline/acciones/eliminar-adjunto';
import { agregarArchivoAdjuntoAccion } from '@/modulos/pipeline/acciones/agregar-archivo-adjunto';

const EXTENSIONES = '.pdf,.dxf,.dwg,.step,.stp,.igs,.iges,.eps,.ai,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.doc,.docx';

/** Clave de consulta compartida por el panel y por el adjuntado desde el cotizador. */
export function claveAdjuntos(pipelineId: string): readonly [string, string, string] {
  return ['oportunidad', pipelineId, 'adjuntos'];
}

function formatearTamano(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Adjuntos de una oportunidad (RFQ-19, OBS-06, DOC-04): lista con nombre,
 * tamaño y fecha; subida múltiple, apertura por URL firmada y retiro. En modo
 * consulta solo permite abrir. La seguridad la impone la RLS del bucket, acotada
 * por carpeta = `pipelineId`.
 */
export function PanelAdjuntos({ pipelineId, soloLectura = false }: { pipelineId: string; soloLectura?: boolean }) {
  const clienteConsultas = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const clave = claveAdjuntos(pipelineId);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: clave,
    queryFn: async () => {
      const respuesta = await obtenerAdjuntosAccion(pipelineId);
      if (!respuesta.exito) throw new Error(respuesta.error);
      return respuesta.datos;
    },
  });

  async function subir(archivos: FileList | null): Promise<void> {
    if (!archivos || archivos.length === 0) return;
    setOcupado(true);
    setError(null);
    try {
      const resultados = await Promise.all(
        Array.from(archivos).map((archivo) => {
          const formData = new FormData();
          formData.set('pipelineId', pipelineId);
          formData.set('archivo', archivo);
          return agregarArchivoAdjuntoAccion(formData);
        }),
      );
      const fallo = resultados.find((resultado) => !resultado.exito);
      if (fallo && !fallo.exito) setError(fallo.error);
      await clienteConsultas.invalidateQueries({ queryKey: clave });
    } catch {
      setError('No se pudieron subir los archivos');
    } finally {
      setOcupado(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function abrir(ruta: string): Promise<void> {
    setError(null);
    const respuesta = await obtenerUrlAdjuntoAccion({ pipelineId, ruta });
    if (respuesta.exito && respuesta.datos) window.open(respuesta.datos.url, '_blank', 'noopener,noreferrer');
    else setError(respuesta.exito ? 'No se pudo generar el enlace' : respuesta.error);
  }

  async function quitar(ruta: string): Promise<void> {
    setOcupado(true);
    setError(null);
    try {
      const respuesta = await eliminarAdjuntoAccion({ pipelineId, ruta });
      if (!respuesta.exito) setError(respuesta.error);
      else await clienteConsultas.invalidateQueries({ queryKey: clave });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="grid gap-2" aria-label="Adjuntos de la oportunidad">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-texto-primario">Planos y adjuntos</h3>
        {!soloLectura && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              accept={EXTENSIONES}
              onChange={(evento) => void subir(evento.target.files)}
            />
            <Button type="button" variante="contorno" tamano="sm" disabled={ocupado} onClick={() => inputRef.current?.click()}>
              {ocupado ? 'Subiendo…' : 'Adjuntar archivos'}
            </Button>
          </>
        )}
      </div>

      {isLoading && <Skeleton className="h-10 rounded-lg" />}

      {isError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-lg border border-peligro/30 bg-peligro-suave px-3 py-2 text-sm text-peligro-texto"
        >
          <span>No se pudieron cargar los adjuntos.</span>
          <Button type="button" variante="contorno" tamano="sm" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      )}

      {data && data.length === 0 && <p className="text-sm text-texto-secundario">Sin adjuntos.</p>}

      {data && data.length > 0 && (
        <ul className="grid gap-1">
          {data.map((adjunto) => (
            <li
              key={adjunto.ruta}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borde bg-superficie p-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate font-medium text-texto-primario">{adjunto.nombre}</span>
              <span className="text-xs tabular-nums text-texto-secundario">
                {[formatearTamano(adjunto.tamano), adjunto.creadoEn ? formatearFecha(adjunto.creadoEn) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <div className="flex gap-1">
                <Button type="button" variante="contorno" tamano="sm" onClick={() => void abrir(adjunto.ruta)}>
                  Abrir
                </Button>
                {!soloLectura && (
                  <Button type="button" variante="destructivo" tamano="sm" disabled={ocupado} onClick={() => void quitar(adjunto.ruta)}>
                    Quitar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm text-peligro-texto">
          {error}
        </p>
      )}
    </section>
  );
}
