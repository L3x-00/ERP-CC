'use client';

import { useCallback, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { obtenerArchivosSesionOrdenAccion, obtenerUrlArchivoSesionAccion } from '@/modulos/produccion/acciones/archivos-sesion';
import type { ArchivoSesionResumen } from '@/modulos/produccion/archivos-sesion-config';
import { CLAVE_ARCHIVOS_SESION } from '@/modulos/produccion/componentes/claves-consulta';
import { subirArchivoSesionDesdeNavegador } from '@/modulos/produccion/subir-archivo-sesion-cliente';
import { NotaEntregaDocumentoBoton } from '@/modulos/produccion/componentes/nota-entrega-documento-boton';
import {
  obtenerDocumentosOrdenAccion,
  type EntregablesOrden,
} from '@/modulos/produccion/acciones/obtener-documentos-orden';
import { obtenerUrlDocumentoOrdenAccion } from '@/modulos/produccion/acciones/obtener-url-documento-orden';
import {
  confirmarDocumentoOrdenAccion,
  descartarDocumentoOrdenAccion,
  prepararDocumentoOrdenAccion,
} from '@/modulos/produccion/acciones/subir-documento-orden';
import { subirArchivoDirecto } from '@/nucleo/almacenamiento/archivos/subida-navegador';

/** Clave de consulta de entregables; se invalida al subir o generar una nota. */
export const CLAVE_ENTREGABLES_ORDEN = ['produccion', 'entregables-orden'] as const;

function formatearTamano(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function etiquetaOrigenDocumento(origen: string, itemCodigo: string | null): string {
  if (origen === 'rfq_item') return itemCodigo ? `RFQ · ${itemCodigo}` : 'RFQ · ítem';
  if (origen === 'propuesta_item') return itemCodigo ? `Propuesta · ${itemCodigo}` : 'Propuesta · ítem';
  if (origen === 'rfq') return 'RFQ';
  if (origen === 'propuesta_revision') return 'Revisión aceptada';
  if (origen === 'propuesta') return 'Propuesta';
  if (origen === 'orden') return 'Orden';
  if (origen === 'orden_legacy') return 'Documento previo de la Orden';
  if (origen === 'rfq_legacy') return 'Carpeta de origen (Orden legada)';
  if (origen === 'snapshot') return 'Documento congelado';
  return 'Documento de origen';
}

function etiquetaVinculoDocumento(documento: EntregablesOrden['documentos'][number]): string {
  if (documento.congelado) return 'versión aceptada';
  if (documento.origen === 'orden') return 'agregado a la orden';
  if (documento.origen === 'orden_legacy') return 'agregado previamente a la orden';
  if (documento.origen === 'rfq_legacy') return 'origen de una orden legada';
  return '';
}

type MensajeInterfaz = { texto: string; tipo: 'estado' | 'error' };
type LinajeDocumentoOrden = { representante: EntregablesOrden['documentos'][number]; historicas: EntregablesOrden['documentos'] };

function agruparDocumentosOrden(
  documentos: EntregablesOrden['documentos'],
): LinajeDocumentoOrden[] {
  const grupos = new Map<string, EntregablesOrden['documentos']>();
  for (const documento of documentos) {
    const grupo = grupos.get(documento.linaje);
    if (grupo) grupo.push(documento);
    else grupos.set(documento.linaje, [documento]);
  }
  return [...grupos.values()].flatMap((grupo) => {
    const ordenadas = [...grupo].sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
    const representante = ordenadas.find((documento) => documento.vigente === true) ?? ordenadas[0];
    if (!representante) return [];
    return [{
      representante,
      historicas: ordenadas.filter((documento) => documento.id !== representante.id),
    }];
  });
}

function FilaDocumentoOrden({
  documento,
  onAbrir,
}: {
  documento: EntregablesOrden['documentos'][number];
  onAbrir: (archivoId: string) => Promise<void>;
}) {
  const origen = etiquetaOrigenDocumento(documento.origen, documento.itemCodigo);
  const vinculo = etiquetaVinculoDocumento(documento);
  return (
    <div className="flex items-center justify-between gap-2 text-sm" data-testid={`documento-orden-${documento.id}`}>
      <span className="min-w-0 flex-1 truncate" title={documento.nombre}>
        {documento.nombre}
        <span className="ml-2 text-xs text-texto-secundario">
          {formatearTamano(documento.tamano)}
          {` · ${origen}`}
          {documento.version !== null ? ` · v${documento.version}` : ''}
          {documento.vigente === false ? ' · histórica' : ''}
          {vinculo ? ` · ${vinculo}` : ''}
          {documento.creadoEn ? ` · ${formatearFecha(documento.creadoEn)}` : ''}
        </span>
        {!documento.disponible && (
          <span className="block text-xs font-medium text-peligro-texto" role="alert">
            Documento congelado no disponible; avisa a Comercial.
          </span>
        )}
      </span>
      {documento.disponible && (
        <Button
          type="button"
          variante="contorno"
          tamano="sm"
          aria-label={`Abrir ${documento.nombre}, ${origen}${documento.version !== null ? `, versión ${documento.version}` : ''}`}
          onClick={() => void onAbrir(documento.id)}
        >
          Abrir
        </Button>
      )}
    </div>
  );
}

/**
 * Entregables de producción de la orden seleccionada (OBS-06/ORD-09/OBS-13):
 * planos y documentos de la oportunidad, subida de archivos durante la
 * ejecución, y notas de entrega con su documento imprimible de conformidad.
 */
export function DocumentosOrdenPanel({
  ordenId,
  ordenFolio,
  sesionFinalId,
}: {
  ordenId: string | null;
  ordenFolio: string | null;
  sesionFinalId: string | null;
}) {
  const clienteConsultas = useQueryClient();
  const entradaArchivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState<MensajeInterfaz | null>(null);
  const [mensajeSalida, setMensajeSalida] = useState<MensajeInterfaz | null>(null);
  const [subiendoSalida, setSubiendoSalida] = useState(false);
  const [linajesAbiertos, setLinajesAbiertos] = useState<readonly string[]>([]);

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
  const linajesDocumentos = agruparDocumentosOrden(datos?.documentos ?? []);
  const consultaArchivos = useQuery({
    queryKey: [...CLAVE_ARCHIVOS_SESION, ordenId],
    queryFn: async (): Promise<ArchivoSesionResumen[]> => {
      const respuesta = await obtenerArchivosSesionOrdenAccion({ ordenId });
      if (!respuesta.exito || !respuesta.datos) throw new Error('No se pudieron consultar los archivos de salida');
      return respuesta.datos;
    },
    enabled: ordenId !== null,
    staleTime: 30_000,
  });
  const archivosSalida = (consultaArchivos.data ?? []).filter((archivo) => archivo.clase === 'salida_final');

  const refrescar = useCallback(async () => {
    await clienteConsultas.invalidateQueries({ queryKey: CLAVE_ENTREGABLES_ORDEN });
  }, [clienteConsultas]);

  const subir = useCallback(async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (!ordenId) return;
    const archivo = entradaArchivo.current?.files?.[0];
    if (!archivo) {
      setMensaje({ texto: 'Selecciona un archivo para subir', tipo: 'error' });
      return;
    }

    setSubiendo(true);
    setMensaje(null);
    // El binario sube directo a Storage (H-B1-29); las acciones solo ven metadatos.
    const destino = { ordenId, nombre: archivo.name };
    try {
      const { nombre } = await subirArchivoDirecto(archivo, {
        preparar: () => prepararDocumentoOrdenAccion({ ...destino, tamano: archivo.size, mime: archivo.type }),
        confirmar: (ruta) => confirmarDocumentoOrdenAccion({ ...destino, ruta }),
        descartar: (ruta) => descartarDocumentoOrdenAccion({ ruta }),
      });
      if (entradaArchivo.current) entradaArchivo.current.value = '';
      setMensaje({ texto: `Documento ${nombre} subido`, tipo: 'estado' });
      await refrescar().catch(() => console.error('[PRODUCCION] Documento subido; lista pendiente de actualizar'));
    } catch (error) {
      setMensaje({
        texto: error instanceof Error ? error.message : 'No se pudo subir el documento',
        tipo: 'error',
      });
    } finally {
      setSubiendo(false);
    }
  }, [ordenId, refrescar]);

  const abrirDocumento = useCallback(async (archivoId: string) => {
    if (!ordenId) return;
    const resultado = await obtenerUrlDocumentoOrdenAccion({ ordenId, archivoId });
    if (!resultado.exito || !resultado.datos) {
      setMensaje({
        texto: !resultado.exito ? resultado.error : 'No se pudo abrir el documento',
        tipo: 'error',
      });
      return;
    }
    window.open(resultado.datos.url, '_blank', 'noopener,noreferrer');
  }, [ordenId]);

  async function subirSalida(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!sesionFinalId) return;
    const formulario = evento.currentTarget;
    const archivo = new FormData(formulario).get('archivoSalida');
    if (!(archivo instanceof File)) {
      setMensajeSalida({ texto: 'Selecciona un archivo de salida final', tipo: 'error' });
      return;
    }
    setSubiendoSalida(true);
    setMensajeSalida(null);
    try {
      await subirArchivoSesionDesdeNavegador(sesionFinalId, 'salida_final', archivo);
      formulario.reset();
      setMensajeSalida({ texto: 'Archivo de salida final asociado', tipo: 'estado' });
      await clienteConsultas.invalidateQueries({ queryKey: CLAVE_ARCHIVOS_SESION }).catch(() => {
        setMensajeSalida({ texto: 'Archivo asociado; actualiza la lista para verlo', tipo: 'estado' });
      });
    } catch (error) {
      setMensajeSalida({
        texto: error instanceof Error ? error.message : 'No se pudo subir la salida final',
        tipo: 'error',
      });
    } finally {
      setSubiendoSalida(false);
    }
  }

  async function abrirSalida(id: string): Promise<void> {
    if (!ordenId) return;
    const resultado = await obtenerUrlArchivoSesionAccion({ ordenId, archivoId: id });
    if (!resultado.exito || !resultado.datos) {
      setMensajeSalida({
        texto: resultado.exito ? 'No se pudo abrir el archivo' : resultado.error,
        tipo: 'error',
      });
      return;
    }
    window.open(resultado.datos.url, '_blank', 'noopener,noreferrer');
  }

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
        Planos y documentos de origen/orden, archivos de cada sesión y salida final se muestran por separado.
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
              <h3 className="text-sm font-semibold text-texto-primario">Planos y documentos del cliente/orden</h3>
              <span className="text-xs text-texto-secundario">
                {datos.orden.cotizacionFolio
                  ? `Origen ${datos.orden.cotizacionFolio}`
                  : 'Sin cotización de origen'}
              </span>
            </div>

            {linajesDocumentos.length === 0 ? (
              <p className="text-sm text-texto-secundario">Sin documentos en la carpeta de la orden.</p>
            ) : (
              <ul className="flex flex-col gap-1.5" data-testid="lista-documentos-orden">
                {linajesDocumentos.map(({ representante, historicas }) => (
                  <li
                    key={representante.id}
                    className="flex flex-col gap-1.5 border-b border-borde/60 pb-1.5"
                  >
                    <FilaDocumentoOrden documento={representante} onAbrir={abrirDocumento} />
                    {historicas.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <Button
                          type="button"
                          variante="fantasma"
                          tamano="sm"
                          className="self-start"
                          aria-expanded={linajesAbiertos.includes(representante.linaje)}
                          aria-controls={`versiones-orden-${representante.id}`}
                          onClick={() => setLinajesAbiertos((abiertos) =>
                            abiertos.includes(representante.linaje)
                              ? abiertos.filter((linaje) => linaje !== representante.linaje)
                              : [...abiertos, representante.linaje])}
                        >
                          {linajesAbiertos.includes(representante.linaje)
                            ? 'Ocultar versiones'
                            : `Ver versiones (${historicas.length})`}
                        </Button>
                        {linajesAbiertos.includes(representante.linaje) && (
                          <ul id={`versiones-orden-${representante.id}`} className="flex flex-col gap-1.5 border-l border-borde pl-3">
                            {historicas.map((historica) => (
                              <li key={historica.id}>
                                <FilaDocumentoOrden documento={historica} onAbrir={abrirDocumento} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <form className="flex flex-wrap items-end gap-2" onSubmit={subir} data-testid="subir-documento-orden">
              <label className="grid flex-1 gap-1 text-sm font-medium text-texto-secundario">
                Nuevo documento (PDF, DXF, DWG, plano o imagen, hasta 20 MiB)
                <Input
                  ref={entradaArchivo}
                  type="file"
                  accept=".pdf,.dxf,.dwg,.step,.stp,.igs,.iges,.eps,.ai,.png,.jpg,.jpeg,.webp"
                  aria-label="Archivo de la orden"
                />
              </label>
              <Button type="submit" tamano="sm" disabled={subiendo}>
                {subiendo ? 'Subiendo…' : 'Subir'}
              </Button>
            </form>
            {mensaje && (
              <p
                role={mensaje.tipo === 'error' ? 'alert' : 'status'}
                className={mensaje.tipo === 'error' ? 'text-sm text-peligro-texto' : 'text-sm text-texto-primario'}
              >
                {mensaje.texto}
              </p>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <h3 className="text-sm font-semibold text-texto-primario">
              Salida y notas de entrega {ordenFolio ? `· ${ordenFolio}` : ''}
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
            <div className="border-t border-borde pt-3">
              <h4 className="text-sm font-semibold">Archivos de salida final</h4>
              {consultaArchivos.isError ? <p role="alert" className="mt-1 text-sm text-peligro-texto">No se pudieron cargar los archivos de salida.</p> : null}
              {archivosSalida.length === 0 ? <p className="mt-1 text-sm text-texto-secundario">Sin archivos de salida final.</p> : null}
              {archivosSalida.length > 0 ? <ul className="mt-2 grid gap-2">
                {archivosSalida.map((archivo) => (
                  <li key={archivo.id} className="flex min-w-0 items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate" title={archivo.nombre}>{archivo.nombre}</span>
                    <Button type="button" variante="contorno" tamano="sm" onClick={() => void abrirSalida(archivo.id)}>Abrir en lectura</Button>
                  </li>
                ))}
              </ul> : null}
              {sesionFinalId ? <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={subirSalida}>
                <label className="grid min-w-0 flex-1 gap-1 text-xs text-texto-secundario">
                  Adjuntar salida final (hasta 20 MiB)
                  <Input name="archivoSalida" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.dxf,.dwg,.step,.stp,.igs,.iges,.eps,.ai" aria-label="Archivo de salida final" />
                </label>
                <Button type="submit" tamano="sm" disabled={subiendoSalida}>
                  {subiendoSalida ? 'Subiendo…' : 'Subir salida'}
                </Button>
              </form> : <p className="mt-2 text-xs text-texto-secundario">Disponible cuando la orden tenga una sesión finalizada.</p>}
              {mensajeSalida ? (
                <p
                  role={mensajeSalida.tipo === 'error' ? 'alert' : 'status'}
                  className={mensajeSalida.tipo === 'error'
                    ? 'mt-2 text-sm text-peligro-texto'
                    : 'mt-2 text-sm text-texto-secundario'}
                >
                  {mensajeSalida.texto}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
