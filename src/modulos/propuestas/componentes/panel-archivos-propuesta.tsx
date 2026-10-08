'use client';

import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Select } from '@/compartido/componentes/ui/input';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { firmarArchivoPropuestaAccion } from '@/modulos/propuestas/acciones/firmar-archivo-propuesta';
import {
  confirmarArchivoPropuestaAccion,
  descartarSubidaArchivoPropuestaAccion,
  prepararSubidaArchivoPropuestaAccion,
} from '@/modulos/propuestas/acciones/subir-archivo-propuesta';
import { subirArchivoDirecto } from '@/nucleo/almacenamiento/archivos/subida-navegador';
import { validarSubidaArchivo } from '@/nucleo/almacenamiento/archivos/validaciones';
import type { ArchivoPropuesta } from '@/modulos/propuestas/servicios/obtener-propuesta';
import type { PropuestaItem, RevisionPropuesta } from '@/modulos/propuestas/tipos/indice';
import { claveDetallePropuesta } from './claves-consulta';

/** Extensiones del perfil `propuesta_revision` de `PERFILES_ARCHIVO` (incluye CAD). */
const EXTENSIONES_ACEPTADAS =
  '.pdf,.dxf,.dwg,.step,.stp,.igs,.iges,.eps,.ai,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.doc,.docx';

/** Versiones de un mismo documento: la mostrada por defecto y su historial. */
type LinajeArchivoPropuesta = { representante: ArchivoPropuesta; historicas: ArchivoPropuesta[] };

/**
 * Agrupa por linaje documental (DC-04): `entidad + entidadId + tema +
 * nombreErp`. Las filas sin `nombreErp` (metadata legada) quedan cada una en su
 * propio linaje para no fusionar documentos distintos por error.
 */
function agruparLinajes(archivos: readonly ArchivoPropuesta[]): LinajeArchivoPropuesta[] {
  const grupos = new Map<string, ArchivoPropuesta[]>();
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

  const linajes: LinajeArchivoPropuesta[] = [];
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

/**
 * SII-B4.8/4.11: archivos de la revisión: heredados del RFQ (sin duplicar),
 * propios (subida en DRAFT) y por ítem, con lectura por URL firmada corta.
 * CLI-06: la versión vigente se muestra por defecto y «Ver versiones» revela el
 * historial del linaje en solo lectura (sin quitar ni eliminar).
 */
export function PanelArchivosPropuesta({
  revision,
  archivosPropios,
  archivosHeredados,
  archivosPorItem,
  items,
  puedeSubir,
}: {
  revision: RevisionPropuesta;
  archivosPropios: ArchivoPropuesta[];
  archivosHeredados: ArchivoPropuesta[];
  archivosPorItem: ArchivoPropuesta[];
  items: PropuestaItem[];
  puedeSubir: boolean;
}) {
  const queryClient = useQueryClient();
  const [tema, setTema] = useState<'general' | 'tecnico'>('general');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [versionSelector, setVersionSelector] = useState(0);
  const [mensaje, setMensaje] = useState<string | null>(null);
  // El rechazo al abrir se muestra aparte del formulario: este solo existe en
  // DRAFT y el error de lectura también aplica a revisiones ya enviadas.
  const [errorApertura, setErrorApertura] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [linajesAbiertos, setLinajesAbiertos] = useState<readonly string[]>([]);

  const esBorrador = revision.estado === 'DRAFT';
  const itemsRevision = items.filter((item) => item.revisionId === revision.id);
  const idsItemsRevision = new Set(itemsRevision.map((item) => item.id));
  const idsItemsRfqRevision = new Set(
    itemsRevision.flatMap((item) => (item.rfqItemId ? [item.rfqItemId] : [])),
  );
  const propiosRevision = archivosPropios.filter((fila) => fila.entidadId === revision.id);
  const heredadosRevision = archivosHeredados.filter(
    (fila) => fila.entidad !== 'rfq_item' || idsItemsRfqRevision.has(fila.entidadId),
  );
  const archivosItemsRevision = archivosPorItem.filter((fila) =>
    idsItemsRevision.has(fila.entidadId),
  );

  async function ver(id: string): Promise<void> {
    setErrorApertura(null);
    // La propuesta abierta acompaña a la firma: el servidor rechaza un archivo
    // que no cuelgue de su árbol documental (H-2).
    const respuesta = await firmarArchivoPropuestaAccion({
      propuestaId: revision.propuestaId,
      archivoId: id,
    });
    if (!respuesta.exito) {
      setErrorApertura(respuesta.error);
      return;
    }
    window.open(respuesta.datos?.url, '_blank', 'noopener,noreferrer');
  }

  async function subir(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!archivo) {
      setMensaje('Selecciona un archivo');
      return;
    }
    const validacion = validarSubidaArchivo('propuesta_revision', {
      nombre: archivo.name,
      tamano: archivo.size,
    });
    if (!validacion.ok) {
      setMensaje(validacion.error);
      return;
    }
    setSubiendo(true);
    setMensaje(null);
    // El binario sube directo a Storage (H-B1-29); las acciones solo ven metadatos.
    const destino = { revisionId: revision.id, tema, nombreArchivo: archivo.name };
    try {
      await subirArchivoDirecto(archivo, {
        preparar: () =>
          prepararSubidaArchivoPropuestaAccion({ ...destino, tamano: archivo.size, mime: archivo.type }),
        confirmar: (ruta) => confirmarArchivoPropuestaAccion({ ...destino, ruta }),
        descartar: (ruta) => descartarSubidaArchivoPropuestaAccion({ ruta }),
      });
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo subir el archivo');
      return;
    } finally {
      setSubiendo(false);
    }
    setArchivo(null);
    setVersionSelector((version) => version + 1);
    setMensaje('Archivo subido.');
    await queryClient.invalidateQueries({ queryKey: claveDetallePropuesta(revision.propuestaId) });
  }

  function codigoItem(entidadId: string): string {
    return items.find((item) => item.id === entidadId)?.codigo ?? 'Ítem';
  }

  function alternarLinaje(id: string): void {
    setLinajesAbiertos((abiertos) =>
      abiertos.includes(id) ? abiertos.filter((abierto) => abierto !== id) : [...abiertos, id],
    );
  }

  function renderizarLinajes(
    archivos: readonly ArchivoPropuesta[],
    chip: (archivo: ArchivoPropuesta) => string,
  ): React.ReactNode[] {
    return agruparLinajes(archivos).map((linaje) => (
      <LinajeArchivo
        key={linaje.representante.id}
        linaje={linaje}
        chip={chip}
        abierto={linajesAbiertos.includes(linaje.representante.id)}
        onAlternar={alternarLinaje}
        onVer={ver}
      />
    ));
  }

  return (
    <section className="flex flex-col gap-4" data-testid="panel-archivos-propuesta">
      {esBorrador && puedeSubir && (
        <form onSubmit={subir} className="flex flex-wrap items-end gap-2 rounded-lg border border-borde p-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Tipo</span>
            <Select
              value={tema}
              onChange={(evento) => setTema(evento.target.value as 'general' | 'tecnico')}
              aria-label="Tipo de archivo de propuesta"
            >
              <option value="general">General</option>
              <option value="tecnico">Técnico</option>
            </Select>
          </label>
          <input
            key={versionSelector}
            type="file"
            aria-label="Archivo de la propuesta"
            accept={EXTENSIONES_ACEPTADAS}
            aria-describedby="archivo-propuesta-ayuda"
            onChange={(evento) => setArchivo(evento.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <Button type="submit" tamano="sm" disabled={subiendo}>
            {subiendo ? 'Subiendo…' : 'Subir archivo'}
          </Button>
          {mensaje && (
            <span role="status" className="text-xs text-texto-secundario">
              {mensaje}
            </span>
          )}
          <p id="archivo-propuesta-ayuda" className="basis-full text-xs text-texto-secundario">
            Formatos aceptados: PDF, DXF, DWG, STEP/STP, IGS/IGES, EPS/AI, imágenes y hojas de
            cálculo. Hasta 20 MiB por archivo. Repetir el mismo nombre crea una versión nueva y
            conserva la anterior en «Ver versiones».
          </p>
        </form>
      )}

      {errorApertura && (
        <p role="alert" className="text-sm text-peligro-texto">
          {errorApertura}
        </p>
      )}

      <Grupo titulo="De la revisión" vacio="Sin archivos propios.">
        {renderizarLinajes(propiosRevision, (fila) =>
          fila.temaCodigo === 'tecnico' ? 'Técnico' : 'General',
        )}
      </Grupo>

      <Grupo titulo="Heredados del RFQ" vacio="Sin archivos heredados.">
        {renderizarLinajes(heredadosRevision, (fila) =>
          fila.entidad === 'rfq_item' ? 'Origen: RFQ · Ítem' : 'Origen: RFQ',
        )}
      </Grupo>

      <Grupo titulo="Por ítem de la propuesta" vacio="Sin archivos por ítem.">
        {renderizarLinajes(archivosItemsRevision, (fila) => `Ítem ${codigoItem(fila.entidadId)}`)}
      </Grupo>
    </section>
  );
}

/** Linaje de un documento: versión mostrada + historial expandible, sin borrado. */
function LinajeArchivo({
  linaje,
  chip,
  abierto,
  onAlternar,
  onVer,
}: {
  linaje: LinajeArchivoPropuesta;
  chip: (archivo: ArchivoPropuesta) => string;
  abierto: boolean;
  onAlternar: (id: string) => void;
  onVer: (id: string) => Promise<void>;
}) {
  const { representante, historicas } = linaje;
  return (
    <li className="flex flex-col gap-1 py-2">
      <FilaArchivo archivo={representante} chip={chip(representante)} onVer={onVer} />
      {historicas.length > 0 && (
        <>
          <Button
            variante="fantasma"
            tamano="sm"
            className="self-start"
            aria-expanded={abierto}
            aria-controls={`versiones-propuesta-${representante.id}`}
            onClick={() => onAlternar(representante.id)}
          >
            {abierto ? 'Ocultar versiones' : `Ver versiones (${historicas.length})`}
          </Button>
          {abierto && (
            <ul
              id={`versiones-propuesta-${representante.id}`}
              className="flex flex-col border-l border-borde pl-3"
            >
              {historicas.map((historica) => (
                <li key={historica.id} className="py-1">
                  <FilaArchivo archivo={historica} chip={chip(historica)} onVer={onVer} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

function Grupo({
  titulo,
  vacio,
  children,
}: {
  titulo: string;
  vacio: string;
  children: React.ReactNode;
}) {
  const tieneHijos = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-texto-primario">{titulo}</h3>
      {tieneHijos ? (
        <ul className="flex flex-col divide-y divide-borde">{children}</ul>
      ) : (
        <p className="text-sm text-texto-secundario">{vacio}</p>
      )}
    </div>
  );
}

function FilaArchivo({
  archivo,
  chip,
  onVer,
}: {
  archivo: ArchivoPropuesta;
  chip: string;
  onVer: (id: string) => Promise<void>;
}) {
  return (
    <div
      data-testid={`archivo-propuesta-${archivo.id}`}
      className="flex items-center justify-between gap-2 text-sm"
    >
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{archivo.nombreOriginal}</span>
        <span className="text-xs text-texto-secundario">
          {chip} · v{archivo.version} · {archivo.vigente ? 'Vigente' : 'Histórica'} ·{' '}
          {formatearFecha(archivo.creadoEn)}
        </span>
      </div>
      <Button
        variante="fantasma"
        tamano="sm"
        aria-label={`Ver ${archivo.nombreOriginal}, versión ${archivo.version}`}
        onClick={() => void onVer(archivo.id)}
      >
        Ver
      </Button>
    </div>
  );
}
