'use client';

import { useCallback, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { NotaEntregaDocumentoBoton } from '@/modulos/produccion/componentes/nota-entrega-documento-boton';
import {
  obtenerDocumentosOrdenAccion,
  type EntregablesOrden,
} from '@/modulos/produccion/acciones/obtener-documentos-orden';
import { obtenerUrlDocumentoOrdenAccion } from '@/modulos/produccion/acciones/obtener-url-documento-orden';
import { subirDocumentoOrdenAccion } from '@/modulos/produccion/acciones/subir-documento-orden';

/** Clave de consulta de entregables; se invalida al subir o generar una nota. */
export const CLAVE_ENTREGABLES_ORDEN = ['produccion', 'entregables-orden'] as const;

function formatearTamano(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Entregables de producción de la orden seleccionada (OBS-06/ORD-09/OBS-13):
 * planos y documentos de la oportunidad, subida de archivos durante la
 * ejecución, y notas de entrega con su documento imprimible de conformidad.
 */
export function DocumentosOrdenPanel({
  ordenId,
  ordenFolio,
}: {
  ordenId: string | null;
  ordenFolio: string | null;
}) {
  const clienteConsultas = useQueryClient();
  const entradaArchivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: [...CLAVE_ENTREGABLES_ORDEN, ordenId],
    queryFn: async (): Promise<EntregablesOrden> => {
      const respuesta = await obtenerDocumentosOrdenAccion({ ordenId });
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'Los entregables no devolvieron datos' : respuesta.error);
      }
      return respuesta.datos;
    },
    enabled: ordenId !== null,
    staleTime: 30_000,
  });
  const datos = consulta.data ?? null;

  const refrescar = useCallback(async () => {
    await clienteConsultas.invalidateQueries({ queryKey: CLAVE_ENTREGABLES_ORDEN });
  }, [clienteConsultas]);

  const subir = useCallback(async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (!ordenId) return;
    const archivo = entradaArchivo.current?.files?.[0];
    if (!archivo) {
      setMensaje('Selecciona un archivo para subir');
      return;
    }

    const formulario = new FormData();
    formulario.set('ordenId', ordenId);
    formulario.set('archivo', archivo);

    setSubiendo(true);
    setMensaje(null);
    try {
      const resultado = await subirDocumentoOrdenAccion(formulario);
      if (!resultado.exito) {
        setMensaje(resultado.error ?? 'No se pudo subir el documento');
        return;
      }
      if (entradaArchivo.current) entradaArchivo.current.value = '';
      setMensaje(`Documento ${resultado.datos?.nombre ?? ''} subido`);
      await refrescar().catch(() => console.error('[PRODUCCION] Documento subido; lista pendiente de actualizar'));
    } catch (error) {
      console.error('[PRODUCCION] Error de comunicación al subir documento:', error);
      setMensaje('No se pudo comunicar la subida; vuelve a intentarlo');
    } finally {
      setSubiendo(false);
    }
  }, [ordenId, refrescar]);

  const abrirDocumento = useCallback(async (ruta: string) => {
    if (!ordenId) return;
    const resultado = await obtenerUrlDocumentoOrdenAccion({ ordenId, ruta });
    if (!resultado.exito || !resultado.datos) {
      setMensaje(!resultado.exito ? resultado.error : 'No se pudo abrir el documento');
      return;
    }
    window.open(resultado.datos.url, '_blank', 'noopener,noreferrer');
  }, [ordenId]);

  return (
    <section
      className="rounded-lg border border-borde bg-superficie p-4"
      aria-labelledby="titulo-entregables"
      data-testid="panel-documentos-orden"
    >
      <h2 id="titulo-entregables" className="text-base font-semibold text-texto-primario">
        Entregables de producción
      </h2>
      <p className="mt-1 text-sm text-texto-secundario">
        Planos y documentos de la orden, más las notas de entrega con su confirmación imprimible.
      </p>

      {!ordenId && (
        <p className="mt-4 text-sm text-texto-secundario">Selecciona una orden para ver sus entregables.</p>
      )}

      {ordenId && consulta.isLoading && (
        <p className="mt-4 text-sm text-texto-secundario">Cargando entregables…</p>
      )}
      {ordenId && consulta.isError && (
        <p role="alert" className="mt-4 text-sm text-peligro-texto">
          No se pudieron cargar los entregables de la orden.
        </p>
      )}

      {ordenId && datos && (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-texto-primario">Planos y documentos</h3>
              <span className="text-xs text-texto-secundario">
                {datos.orden.cotizacionFolio
                  ? `Origen ${datos.orden.cotizacionFolio}`
                  : 'Sin cotización de origen'}
              </span>
            </div>

            {datos.documentos.length === 0 ? (
              <p className="text-sm text-texto-secundario">Sin documentos en la carpeta de la orden.</p>
            ) : (
              <ul className="flex flex-col gap-1.5" data-testid="lista-documentos-orden">
                {datos.documentos.map((documento) => (
                  <li
                    key={documento.ruta}
                    className="flex items-center justify-between gap-2 border-b border-borde/60 pb-1.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate" title={documento.nombre}>
                      {documento.nombre}
                      <span className="ml-2 text-xs text-texto-secundario">
                        {formatearTamano(documento.tamano)}
                        {documento.creadoEn ? ` · ${formatearFecha(documento.creadoEn)}` : ''}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variante="contorno"
                      tamano="sm"
                      onClick={() => void abrirDocumento(documento.ruta)}
                    >
                      Abrir
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {datos.orden.cotizacionId ? (
              <form className="flex flex-wrap items-end gap-2" onSubmit={subir} data-testid="subir-documento-orden">
                <label className="grid flex-1 gap-1 text-sm font-medium text-texto-secundario">
                  Nuevo documento (PDF, plano o imagen, hasta 20 MB)
                  <Input ref={entradaArchivo} type="file" aria-label="Archivo de la orden" />
                </label>
                <Button type="submit" tamano="sm" disabled={subiendo}>
                  {subiendo ? 'Subiendo…' : 'Subir'}
                </Button>
              </form>
            ) : (
              <p className="text-xs text-texto-secundario">
                La orden no tiene cotización de origen; no hay carpeta donde guardar documentos.
              </p>
            )}
            {mensaje && (
              <p role="status" className="text-sm text-texto-primario">
                {mensaje}
              </p>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <h3 className="text-sm font-semibold text-texto-primario">
              Notas de entrega {ordenFolio ? `· ${ordenFolio}` : ''}
            </h3>
            {datos.notas.length === 0 ? (
              <p className="text-sm text-texto-secundario">Aún no hay entregas registradas para la orden.</p>
            ) : (
              <ul className="flex flex-col gap-1.5" data-testid="lista-notas-entrega">
                {datos.notas.map((nota) => (
                  <li
                    key={nota.id}
                    className="flex items-center justify-between gap-2 border-b border-borde/60 pb-1.5 text-sm"
                    data-testid={`nota-entrega-${nota.folio}`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-mono">{nota.folio}</span>
                      <span className="ml-2 text-xs text-texto-secundario">
                        {nota.esParcial ? 'Parcial' : 'Total'} · {formatearFecha(nota.creadoEn)} ·
                        recibió {nota.recibidoPor}
                      </span>
                    </span>
                    <NotaEntregaDocumentoBoton notaId={nota.id} folio={nota.folio} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
