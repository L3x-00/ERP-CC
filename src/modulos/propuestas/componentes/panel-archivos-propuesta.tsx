'use client';

import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { Select } from '@/compartido/componentes/ui/input';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { firmarArchivoPropuestaAccion } from '@/modulos/propuestas/acciones/firmar-archivo-propuesta';
import { retirarArchivoPropuestaAccion } from '@/modulos/propuestas/acciones/retirar-archivo-propuesta';
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
 * historial del linaje en solo lectura.
 * Obs. cliente 2026-10-13 (6): la subida acepta varios archivos a la vez
 * (`allSettled`, un fallo no bloquea a los demás) y los archivos propios de una
 * revisión en borrador ofrecen «Quitar» (retiro trazable, sin borrado).
 */
export function PanelArchivosPropuesta({
  revision,
  revisiones,
  archivosPropios,
  archivosHeredados,
  archivosPorItem,
  items,
  puedeSubir,
  faltaArchivo = false,
}: {
  revision: RevisionPropuesta;
  revisiones: RevisionPropuesta[];
  archivosPropios: ArchivoPropuesta[];
  archivosHeredados: ArchivoPropuesta[];
  archivosPorItem: ArchivoPropuesta[];
  items: PropuestaItem[];
  puedeSubir: boolean;
  /** Obs. cliente 2026-10-13: validar exige al menos un archivo; marca el campo en rojo. */
  faltaArchivo?: boolean;
}) {
  const queryClient = useQueryClient();
  const [tema, setTema] = useState<'general' | 'tecnico'>('general');
  const [archivosSeleccionados, setArchivosSeleccionados] = useState<File[]>([]);
  const [destinoItemId, setDestinoItemId] = useState('');
  const [versionSelector, setVersionSelector] = useState(0);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  // Errores de acción sobre filas existentes (abrir o quitar archivos); se
  // muestran aparte del formulario, que solo existe en DRAFT.
  const [errorApertura, setErrorApertura] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [retirandoId, setRetirandoId] = useState<string | null>(null);
  const [linajesAbiertos, setLinajesAbiertos] = useState<readonly string[]>([]);

  const esBorrador = revision.estado === 'DRAFT';
  // Quitar: solo archivos propios y solo en borrador con permiso de edición.
  const puedeQuitar = esBorrador && puedeSubir;
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

  /** Obs. cliente 6: retira el documento propio (soft-delete con historial). */
  async function quitar(archivoId: string): Promise<void> {
    if (retirandoId !== null) return;
    setRetirandoId(archivoId);
    setMensaje(null);
    setErrorApertura(null);
    const respuesta = await retirarArchivoPropuestaAccion({
      propuestaId: revision.propuestaId,
      archivoId,
    });
    setRetirandoId(null);
    if (!respuesta.exito) {
      setErrorApertura(respuesta.error);
      return;
    }
    setMensaje('Archivo quitado.');
    await queryClient.invalidateQueries({ queryKey: claveDetallePropuesta(revision.propuestaId) });
  }

  /** Sube un archivo con el contrato directo a Storage (prepara/confirma/descarta). */
  async function subirUno(candidato: File): Promise<void> {
    const destino = {
      revisionId: revision.id,
      ...(destinoItem ? { itemId: destinoItem } : {}),
      tema,
      nombreArchivo: candidato.name,
    };
    await subirArchivoDirecto(candidato, {
      preparar: () =>
        prepararSubidaArchivoPropuestaAccion({
          ...destino,
          tamano: candidato.size,
          mime: candidato.type,
        }),
      confirmar: (ruta) => confirmarArchivoPropuestaAccion({ ...destino, ruta }),
      descartar: (ruta) => descartarSubidaArchivoPropuestaAccion({ ruta }),
    });
  }

  async function subir(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (subiendo) return;
    setMensaje(null);
    setErrorSubida(null);
    if (archivosSeleccionados.length === 0) {
      setErrorSubida('Selecciona al menos un archivo');
      return;
    }
    const totalSeleccionados = archivosSeleccionados.length;
    // El perfil depende del destino: la cabecera valida como
    // `propuesta_revision` y el ítem como `propuesta_item`.
    const validos: File[] = [];
    const rechazados: string[] = [];
    for (const candidato of archivosSeleccionados) {
      const validacion = validarSubidaArchivo(entidadDestino, {
        nombre: candidato.name,
        tamano: candidato.size,
      });
      if (validacion.ok) validos.push(candidato);
      else rechazados.push(`${candidato.name}: ${validacion.error}`);
    }
    if (validos.length === 0) {
      setErrorSubida(rechazados.join(' · '));
      return;
    }

    setSubiendo(true);
    // Obs. cliente 6: el lote sube en paralelo y un fallo no bloquea al resto.
    const resultados = await Promise.allSettled(validos.map((candidato) => subirUno(candidato)));
    setSubiendo(false);

    let subidos = 0;
    const fallidos: string[] = [];
    resultados.forEach((resultado, indice) => {
      if (resultado.status === 'fulfilled') {
        subidos += 1;
      } else {
        const motivo =
          resultado.reason instanceof Error ? resultado.reason.message : 'No se pudo subir';
        fallidos.push(`${validos[indice]?.name ?? 'archivo'}: ${motivo}`);
      }
    });

    setArchivosSeleccionados([]);
    setVersionSelector((version) => version + 1);
    const problemas = [...rechazados, ...fallidos];
    if (subidos === 0) {
      setErrorSubida(problemas.join(' · '));
    } else if (problemas.length === 0) {
      setMensaje(subidos === 1 ? 'Archivo subido.' : `${subidos} archivos subidos.`);
    } else {
      setMensaje(`${subidos} de ${totalSeleccionados} archivos subidos.`);
      setErrorSubida(problemas.join(' · '));
    }
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
    onQuitar?: (id: string) => Promise<void>,
  ): React.ReactNode[] {
    return agruparLinajes(archivos).map((linaje) => (
      <LinajeArchivo
        key={linaje.representante.id}
        linaje={linaje}
        chip={chip}
        abierto={linajesAbiertos.includes(linaje.representante.id)}
        onAlternar={alternarLinaje}
        onVer={ver}
        {...(onQuitar ? { onQuitar } : {})}
        retirandoId={retirandoId}
      />
    ));
  }

  return (
    <section className="flex flex-col gap-4" data-testid="panel-archivos-propuesta">
      {esBorrador && puedeSubir && (
        <form onSubmit={subir} className="flex flex-col gap-3 rounded-lg border border-borde p-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold text-texto-primario">
              Subir archivos a {destinoItem ? 'un ítem' : `la revisión ${revision.folioRevision}`}
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
                multiple
                aria-label="Archivo de la propuesta"
                accept={EXTENSIONES_ACEPTADAS}
                aria-describedby={
                  faltaArchivo
                    ? 'archivo-propuesta-ayuda archivo-propuesta-requerido'
                    : 'archivo-propuesta-ayuda'
                }
                aria-invalid={faltaArchivo}
                onChange={(evento) =>
                  setArchivosSeleccionados(Array.from(evento.target.files ?? []))
                }
                disabled={subiendo}
                className={
                  faltaArchivo
                    ? 'rounded-md border border-peligro/50 px-2 py-1 text-sm'
                    : 'text-sm'
                }
              />
            </label>
            <Button type="submit" tamano="sm" disabled={subiendo}>
              {subiendo ? 'Subiendo…' : 'Subir archivos'}
            </Button>
          </div>
          <p id="archivo-propuesta-ayuda" className="text-xs text-texto-secundario">
            Puedes seleccionar varios archivos a la vez. Formatos aceptados: PDF, DXF, DWG,
            STEP/STP, IGS/IGES, EPS/AI, imágenes y hojas de cálculo. Hasta 20 MiB por archivo.
            Repetir el mismo nombre en el mismo destino crea una versión nueva y conserva la
            anterior en «Ver versiones».
          </p>
        </form>
      )}

      {faltaArchivo && (
        <p
          id="archivo-propuesta-requerido"
          data-testid="archivo-propuesta-requerido"
          className="text-xs font-medium text-peligro-texto"
        >
          Sube al menos un archivo (planos, dibujos o especificaciones) para poder validar la
          propuesta.
        </p>
      )}

      {mensaje && (
        <p role="status" className="text-sm text-texto-secundario">
          {mensaje}
        </p>
      )}

      {errorSubida && (
        <p role="alert" className="text-sm text-peligro-texto">
          {errorSubida}
        </p>
      )}

      {errorApertura && (
        <p role="alert" className="text-sm text-peligro-texto">
          {errorApertura}
        </p>
      )}

      <Grupo titulo="De la revisión" vacio="Sin archivos propios.">
        {renderizarLinajes(propiosRevision, etiquetaRevision, puedeQuitar ? quitar : undefined)}
      </Grupo>

      <Grupo titulo="Heredados del RFQ" vacio="Sin archivos heredados.">
        {renderizarLinajes(heredadosRevision, (fila) =>
          fila.entidad === 'rfq_item' ? 'Origen: RFQ · Ítem' : 'Origen: RFQ',
        )}
      </Grupo>

      <Grupo titulo="Por ítem de la propuesta" vacio="Sin archivos por ítem.">
        {renderizarLinajes(
          archivosItemsRevision,
          (fila) => etiquetaItem(fila.entidadId),
          puedeQuitar ? quitar : undefined,
        )}
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
  onQuitar,
  retirandoId,
}: {
  linaje: LinajeArchivoPropuesta;
  chip: (archivo: ArchivoPropuesta) => string;
  abierto: boolean;
  onAlternar: (id: string) => void;
  onVer: (id: string) => Promise<void>;
  onQuitar?: (id: string) => Promise<void>;
  retirandoId: string | null;
}) {
  const { representante, historicas } = linaje;
  return (
    <li className="flex flex-col gap-1 py-2">
      <FilaArchivo
        archivo={representante}
        chip={chip(representante)}
        onVer={onVer}
        {...(onQuitar ? { onQuitar } : {})}
        quitando={retirandoId === representante.id}
      />
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
  onQuitar,
  quitando = false,
}: {
  archivo: ArchivoPropuesta;
  chip: string;
  onVer: (id: string) => Promise<void>;
  onQuitar?: (id: string) => Promise<void>;
  quitando?: boolean;
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
      <div className="flex items-center gap-1">
        <Button
          variante="fantasma"
          tamano="sm"
          aria-label={`Ver ${archivo.nombreOriginal}, versión ${archivo.version}`}
          onClick={() => void onVer(archivo.id)}
        >
          Ver
        </Button>
        {onQuitar && (
          <Button
            variante="destructivo"
            tamano="sm"
            disabled={quitando}
            aria-label={`Quitar ${archivo.nombreOriginal}, versión ${archivo.version}`}
            onClick={() => void onQuitar(archivo.id)}
          >
            {quitando ? 'Quitando…' : 'Quitar'}
          </Button>
        )}
      </div>
    </div>
  );
}
