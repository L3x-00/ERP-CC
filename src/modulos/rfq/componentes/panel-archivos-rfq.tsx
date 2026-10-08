'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { formatearFecha, formatearHora } from '@/compartido/utilidades/formatear';
import { ETIQUETAS_ESTADO_RFQ } from '@/modulos/rfq/utilidades/estados';
import type { Rfq } from '@/modulos/rfq/tipos/indice';
import { subirArchivoDirecto } from '@/nucleo/almacenamiento/archivos/subida-navegador';
import { validarSubidaArchivo } from '@/nucleo/almacenamiento/archivos/validaciones';

import {
  confirmarArchivoRfqAccion,
  descartarSubidaArchivoRfqAccion,
  firmarArchivoRfqAccion,
  listarArchivosRfqAccion,
  prepararSubidaArchivoRfqAccion,
  type ArchivoRfq,
} from '../acciones/archivos-rfq';

const CLASES = ['CAD', 'DIBUJO', 'IMAGEN', 'ESPECIFICACIONES', 'OTROS'] as const;

/** Extensiones del perfil `rfq`/`rfq_item` de `PERFILES_ARCHIVO` (incluye CAD). */
const EXTENSIONES_ACEPTADAS =
  '.pdf,.dxf,.dwg,.step,.stp,.igs,.iges,.eps,.ai,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.doc,.docx';

/** Versiones de un mismo documento: la mostrada por defecto y su historial. */
type LinajeArchivoRfq = { representante: ArchivoRfq; historicas: ArchivoRfq[] };

/**
 * Agrupa por linaje documental (DC-04): `entidad + entidadId + tema +
 * nombreErp`. Las filas sin `nombreErp` (metadata legada) quedan cada una en su
 * propio linaje para no fusionar documentos distintos por error.
 */
function agruparLinajes(archivos: readonly ArchivoRfq[]): LinajeArchivoRfq[] {
  const grupos = new Map<string, ArchivoRfq[]>();
  for (const archivo of archivos) {
    const clave = [
      archivo.entidad,
      archivo.entidadId,
      archivo.temaCodigo ?? '',
      archivo.nombreErp ?? `#${archivo.id}`,
    ].join('|');
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(archivo);
    else grupos.set(clave, [archivo]);
  }

  const linajes: LinajeArchivoRfq[] = [];
  for (const grupo of grupos.values()) {
    const ordenadas = [...grupo].sort((a, b) => b.version - a.version);
    const representante = ordenadas.find((archivo) => archivo.vigente) ?? ordenadas[0];
    if (!representante) continue;
    linajes.push({
      representante,
      historicas: ordenadas.filter((archivo) => archivo.id !== representante.id),
    });
  }
  return linajes;
}

/** Pestaña Archivos: generales (`rfq`) y por ítem (`rfq_item`) del modelo E3. */
export function PanelArchivosRfq({ rfq, onCambio }: { rfq: Rfq; onCambio?: () => void }) {
  const clienteConsultas = useQueryClient();
  const [clase, setClase] = useState<(typeof CLASES)[number]>('CAD');
  const [itemId, setItemId] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [versionSelector, setVersionSelector] = useState(0);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [linajesAbiertos, setLinajesAbiertos] = useState<readonly string[]>([]);

  const listado = useQuery({
    queryKey: ['rfq-archivos', rfq.id],
    queryFn: () => listarArchivosRfqAccion({ rfqId: rfq.id }),
  });
  const archivos = listado.data?.exito ? (listado.data.datos ?? []) : [];

  // El binario sube directo a Storage con URL firmada (H-B1-29); las acciones
  // solo reciben metadatos y el servidor revalida el objeto real al confirmar.
  const subida = useMutation({
    mutationFn: (entrada: { clase: (typeof CLASES)[number]; itemId: string; archivo: File }) => {
      const destino = {
        rfqId: rfq.id,
        clase: entrada.clase,
        nombre: entrada.archivo.name,
        ...(entrada.itemId ? { itemId: entrada.itemId } : {}),
      };
      return subirArchivoDirecto(entrada.archivo, {
        preparar: () =>
          prepararSubidaArchivoRfqAccion({
            ...destino,
            tamano: entrada.archivo.size,
            mime: entrada.archivo.type,
          }),
        confirmar: (ruta) => confirmarArchivoRfqAccion({ ...destino, ruta }),
        descartar: (ruta) => descartarSubidaArchivoRfqAccion({ ruta }),
      });
    },
    onSuccess: () => {
      setMensaje(null);
      setArchivo(null);
      setVersionSelector((version) => version + 1);
      void clienteConsultas.invalidateQueries({ queryKey: ['rfq-archivos', rfq.id] });
      void clienteConsultas.invalidateQueries({ queryKey: ['rfq', rfq.id] });
      onCambio?.();
    },
    onError: (error) => {
      setMensaje(error instanceof Error ? error.message : 'No se pudo subir el archivo');
    },
  });

  function manejarEnvio(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    if (!archivo) {
      setMensaje('Selecciona un archivo');
      return;
    }
    const validacion = validarSubidaArchivo(itemId ? 'rfq_item' : 'rfq', {
      nombre: archivo.name,
      tamano: archivo.size,
    });
    if (!validacion.ok) {
      setMensaje(validacion.error);
      return;
    }
    setMensaje(null);
    subida.mutate({ clase, itemId, archivo });
  }

  async function abrirArchivo(archivoId: string): Promise<void> {
    const respuesta = await firmarArchivoRfqAccion({ rfqId: rfq.id, archivoId });
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    window.open(respuesta.datos?.url, '_blank', 'noopener,noreferrer');
  }

  function alternarLinaje(id: string): void {
    setLinajesAbiertos((abiertos) =>
      abiertos.includes(id) ? abiertos.filter((abierto) => abierto !== id) : [...abiertos, id],
    );
  }

  const itemsActivos = rfq.items.filter((item) => item.estado === 'activo');
  const linajes = agruparLinajes(archivos);

  return (
    <div className="flex flex-col gap-4" data-testid="panel-archivos-rfq">
      <form
        onSubmit={manejarEnvio}
        className="grid gap-3 rounded-lg border border-borde bg-superficie p-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="grid gap-1 text-sm font-medium" htmlFor="archivo-clase">
          Tipo
          <Select
            id="archivo-clase"
            value={clase}
            onChange={(evento) => setClase(evento.target.value as (typeof CLASES)[number])}
          >
            {CLASES.map((opcion) => (
              <option key={opcion} value={opcion}>
                {opcion}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="archivo-item">
          Vínculo
          <Select
            id="archivo-item"
            value={itemId}
            onChange={(evento) => setItemId(evento.target.value)}
          >
            <option value="">General del RFQ</option>
            {itemsActivos.map((item) => (
              <option key={item.id} value={item.id}>
                {item.codigo} — {item.descripcion}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="archivo-input">
          Archivo
          <Input
            key={versionSelector}
            id="archivo-input"
            type="file"
            accept={EXTENSIONES_ACEPTADAS}
            aria-describedby="archivo-rfq-ayuda"
            onChange={(evento) => setArchivo(evento.target.files?.[0] ?? null)}
          />
        </label>
        <div className="flex items-end">
          <Button type="submit" tamano="lg" disabled={subida.isPending}>
            {subida.isPending ? 'Subiendo…' : 'Subir archivo'}
          </Button>
        </div>
      </form>

      <p id="archivo-rfq-ayuda" className="text-xs text-texto-secundario">
        Formatos aceptados: PDF, DXF, DWG, STEP/STP, IGS/IGES, EPS/AI, imágenes y hojas de cálculo.
        Hasta 20 MiB por archivo (el binario sube directo a Storage). Volver a subir el mismo nombre
        crea una versión nueva; la anterior se conserva en «Ver versiones».
      </p>

      {mensaje !== null && (
        <p role="alert" className="text-sm text-peligro-texto">
          {mensaje}
        </p>
      )}

      {listado.isLoading && <p className="text-sm text-texto-secundario">Cargando archivos…</p>}

      {!listado.isLoading && linajes.length === 0 && (
        <p className="rounded-lg border border-dashed border-borde px-4 py-6 text-center text-sm text-texto-secundario">
          Sin archivos cargados.
        </p>
      )}

      {linajes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {linajes.map((linaje) => (
            <li
              key={linaje.representante.id}
              className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie px-3 py-2"
            >
              <FilaArchivoRfq archivo={linaje.representante} onAbrir={abrirArchivo} />
              {linaje.historicas.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Button
                    variante="fantasma"
                    tamano="sm"
                    className="self-start"
                    aria-expanded={linajesAbiertos.includes(linaje.representante.id)}
                    aria-controls={`versiones-rfq-${linaje.representante.id}`}
                    onClick={() => alternarLinaje(linaje.representante.id)}
                  >
                    {linajesAbiertos.includes(linaje.representante.id)
                      ? 'Ocultar versiones'
                      : `Ver versiones (${linaje.historicas.length})`}
                  </Button>
                  {linajesAbiertos.includes(linaje.representante.id) && (
                    <ul
                      id={`versiones-rfq-${linaje.representante.id}`}
                      className="flex flex-col gap-2 border-l border-borde pl-3"
                    >
                      {linaje.historicas.map((historica) => (
                        <li key={historica.id}>
                          <FilaArchivoRfq archivo={historica} onAbrir={abrirArchivo} />
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

      <p className="text-xs text-texto-secundario">
        Estado del RFQ: {ETIQUETAS_ESTADO_RFQ[rfq.estadoRfq]}. El archivo técnico
        (CAD/DIBUJO/ESPECIFICACIONES) es obligatorio para LISTO cuando algún proceso activo lo exige.
      </p>
    </div>
  );
}

/** Fila de un archivo concreto: metadata y apertura por URL firmada. Sin borrado. */
function FilaArchivoRfq({
  archivo,
  onAbrir,
}: {
  archivo: ArchivoRfq;
  onAbrir: (archivoId: string) => Promise<void>;
}) {
  return (
    <div
      data-testid={`archivo-rfq-${archivo.id}`}
      className="flex flex-wrap items-center justify-between gap-2"
    >
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{archivo.nombreOriginal}</span>
        <span className="text-xs text-texto-secundario">
          {archivo.clase}
          {archivo.itemCodigo ? ` · ${archivo.itemCodigo}` : ' · General'}
          {` · v${archivo.version}`}
          {archivo.vigente ? ' · Vigente' : ' · Histórica'}
          {' · '}
          {formatearFecha(archivo.creadoEn)} {formatearHora(archivo.creadoEn)}
        </span>
      </div>
      <Button
        variante="contorno"
        tamano="sm"
        aria-label={`Abrir ${archivo.nombreOriginal}, versión ${archivo.version}`}
        onClick={() => void onAbrir(archivo.id)}
      >
        Abrir
      </Button>
    </div>
  );
}
