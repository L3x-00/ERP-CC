'use client';

import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/compartido/componentes/ui/badge';
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
  revisiones,
  archivosPropios,
  archivosHeredados,
  archivosPorItem,
  items,
  puedeSubir,
}: {
  revision: RevisionPropuesta;
  revisiones: RevisionPropuesta[];
  archivosPropios: ArchivoPropuesta[];
  archivosHeredados: ArchivoPropuesta[];
  archivosPorItem: ArchivoPropuesta[];
  items: PropuestaItem[];
  puedeSubir: boolean;
}) {
  const queryClient = useQueryClient();
  const [tema, setTema] = useState<'general' | 'tecnico'>('general');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [destinoItemId, setDestinoItemId] = useState('');
  const [versionSelector, setVersionSelector] = useState(0);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  // El rechazo al abrir se muestra aparte del formulario: este solo existe en
  // DRAFT y el error de lectura también aplica a revisiones ya enviadas.
  const [errorApertura, setErrorApertura] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [linajesAbiertos, setLinajesAbiertos] = useState<readonly string[]>([]);

  const esBorrador = revision.estado === 'DRAFT';
  const itemsRevision = items.filter((item) => item.revisionId === revision.id);
  // C3.1: las filas de revisión e ítem cambian de UUID en cada copia profunda.
  // La lectura histórica se resuelve hasta la revisión abierta (nunca desde una
  // futura) y, para ítems, por el código ITxx estable de la propuesta.
  const revisionesVisibles = revisiones.filter((fila) => fila.letra <= revision.letra);
  const idsRevisionesVisibles = new Set(revisionesVisibles.map((fila) => fila.id));
  const codigosItemsRevision = new Set(itemsRevision.map((item) => item.codigo));
  const itemsLinajeVisibles = items.filter(
    (item) => idsRevisionesVisibles.has(item.revisionId) && codigosItemsRevision.has(item.codigo),
  );
  const idsItemsLinajeVisibles = new Set(itemsLinajeVisibles.map((item) => item.id));
  const idsItemsRfqRevision = new Set(
    itemsRevision.flatMap((item) => (item.rfqItemId ? [item.rfqItemId] : [])),
  );
  const propiosRevision = archivosPropios.filter((fila) =>
    idsRevisionesVisibles.has(fila.entidadId),
  );
  const heredadosRevision = archivosHeredados.filter(
    (fila) => fila.entidad !== 'rfq_item' || idsItemsRfqRevision.has(fila.entidadId),
  );
  const archivosItemsRevision = archivosPorItem.filter((fila) =>
    idsItemsLinajeVisibles.has(fila.entidadId),
  );
  // C3.1: solo un ítem activo de esta revisión admite destino nuevo; los
  // archivos de un ítem dado de baja siguen visibles en su grupo histórico.
  const itemsDestino = itemsRevision.filter((item) => item.activo);
  const destinoItem = itemsDestino.some((item) => item.id === destinoItemId) ? destinoItemId : '';
  const entidadDestino = destinoItem ? 'propuesta_item' : 'propuesta_revision';

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
    if (subiendo) return;
    setMensaje(null);
    setErrorSubida(null);
    if (!archivo) {
      setErrorSubida('Selecciona un archivo');
      return;
    }
    // El perfil depende del destino: la cabecera valida como
    // `propuesta_revision` y el ítem como `propuesta_item`.
    const validacion = validarSubidaArchivo(entidadDestino, {
      nombre: archivo.name,
      tamano: archivo.size,
    });
    if (!validacion.ok) {
      setErrorSubida(validacion.error);
      return;
    }
    setSubiendo(true);
    // El binario sube directo a Storage (H-B1-29); las acciones solo ven metadatos.
    const destino = {
      revisionId: revision.id,
      ...(destinoItem ? { itemId: destinoItem } : {}),
      tema,
      nombreArchivo: archivo.name,
    };
    try {
      await subirArchivoDirecto(archivo, {
        preparar: () =>
          prepararSubidaArchivoPropuestaAccion({ ...destino, tamano: archivo.size, mime: archivo.type }),
        confirmar: (ruta) => confirmarArchivoPropuestaAccion({ ...destino, ruta }),
        descartar: (ruta) => descartarSubidaArchivoPropuestaAccion({ ruta }),
      });
    } catch (error) {
      setErrorSubida(error instanceof Error ? error.message : 'No se pudo subir el archivo');
      return;
    } finally {
      setSubiendo(false);
    }
    setArchivo(null);
    setVersionSelector((version) => version + 1);
    setMensaje('Archivo subido.');
    await queryClient.invalidateQueries({ queryKey: claveDetallePropuesta(revision.propuestaId) });
  }

  /** Etiqueta el código estable y la revisión física donde se adjuntó. */
  function etiquetaItem(entidadId: string): string {
    const item = items.find((candidato) => candidato.id === entidadId);
    if (!item) return 'Ítem';
    const letraOrigen = revisiones.find((fila) => fila.id === item.revisionId)?.letra;
    const itemVigente = itemsRevision.find((candidato) => candidato.codigo === item.codigo);
    const baja = itemVigente?.activo === false ? ' · dado de baja' : '';
    return `Ítem ${item.codigo}${letraOrigen ? ` · Rev ${letraOrigen}` : ''}${baja}`;
  }

  /** Etiqueta el tipo y la revisión física de un archivo de cabecera. */
  function etiquetaRevision(archivo: ArchivoPropuesta): string {
    const letraOrigen = revisiones.find((fila) => fila.id === archivo.entidadId)?.letra;
    const tipo = archivo.temaCodigo === 'tecnico' ? 'Técnico' : 'General';
    return `${tipo}${letraOrigen ? ` · Rev ${letraOrigen}` : ''}`;
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
        <form onSubmit={subir} className="flex flex-col gap-3 rounded-lg border border-borde p-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold text-texto-primario">
              Subir archivo a {destinoItem ? 'un ítem' : `la revisión ${revision.folioRevision}`}
            </h3>
            <p className="text-xs text-texto-secundario">
              El destino identifica a quién pertenece el documento; los archivos anteriores se
              conservan por revisión y los del RFQ se heredan sin duplicarse.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Destino</span>
              <Select
                value={destinoItem}
                onChange={(evento) => setDestinoItemId(evento.target.value)}
                aria-label="Destino del archivo"
                disabled={subiendo}
              >
                <option value="">Revisión {revision.letra}</option>
                {itemsDestino.map((item) => (
                  <option key={item.id} value={item.id}>
                    Ítem {item.codigo} · {item.descripcion}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Tipo</span>
              <Select
                value={tema}
                onChange={(evento) => setTema(evento.target.value as 'general' | 'tecnico')}
                aria-label="Tipo de archivo de propuesta"
                disabled={subiendo}
              >
                <option value="general">General (comercial)</option>
                <option value="tecnico">Técnico (CAD/planos)</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Archivo</span>
              <input
                key={versionSelector}
                type="file"
                aria-label="Archivo de la propuesta"
                accept={EXTENSIONES_ACEPTADAS}
                aria-describedby="archivo-propuesta-ayuda"
                onChange={(evento) => setArchivo(evento.target.files?.[0] ?? null)}
                disabled={subiendo}
                className="text-sm"
              />
            </label>
            <Button type="submit" tamano="sm" disabled={subiendo}>
              {subiendo ? 'Subiendo…' : 'Subir archivo'}
            </Button>
            {mensaje && (
              <span role="status" className="text-xs text-texto-secundario">
                {mensaje}
              </span>
            )}
            {errorSubida && (
              <span role="alert" className="text-xs text-peligro-texto">
                {errorSubida}
              </span>
            )}
          </div>
          <p id="archivo-propuesta-ayuda" className="text-xs text-texto-secundario">
            Formatos aceptados: PDF, DXF, DWG, STEP/STP, IGS/IGES, EPS/AI, imágenes y hojas de
            cálculo. Hasta 20 MiB por archivo. Repetir el mismo nombre en el mismo destino crea
            una versión nueva y conserva la anterior en «Ver versiones».
          </p>
        </form>
      )}

      {errorApertura && (
        <p role="alert" className="text-sm text-peligro-texto">
          {errorApertura}
        </p>
      )}

      <Grupo titulo="De la revisión" vacio="Sin archivos propios.">
        {renderizarLinajes(propiosRevision, etiquetaRevision)}
      </Grupo>

      <Grupo titulo="Heredados del RFQ" vacio="Sin archivos heredados.">
        {renderizarLinajes(heredadosRevision, (fila) =>
          fila.entidad === 'rfq_item' ? 'Origen: RFQ · Ítem' : 'Origen: RFQ',
        )}
      </Grupo>

      <Grupo titulo="Por ítem de la propuesta" vacio="Sin archivos por ítem.">
        {renderizarLinajes(archivosItemsRevision, (fila) => etiquetaItem(fila.entidadId))}
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
  const cantidad = Array.isArray(children) ? children.length : children ? 1 : 0;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-texto-primario">
        {titulo}
        {cantidad > 0 ? (
          <span className="ml-1.5 text-xs font-normal text-texto-tenue">({cantidad})</span>
        ) : null}
      </h3>
      {cantidad > 0 ? (
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
  const variante =
    archivo.entidad === 'propuesta_item' ||
    archivo.entidad === 'rfq_item' ||
    archivo.temaCodigo === 'tecnico'
      ? 'info'
      : 'neutro';
  return (
    <div
      data-testid={`archivo-propuesta-${archivo.id}`}
      className="flex items-center justify-between gap-2 py-2 text-sm"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-medium">{archivo.nombreOriginal}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-texto-secundario">
          <Badge variante={variante}>{chip}</Badge>
          <Badge variante="neutro">v{archivo.version}</Badge>
          <span>{archivo.vigente ? 'Vigente' : 'Histórica'}</span>
          <span>{formatearFecha(archivo.creadoEn)}</span>
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
