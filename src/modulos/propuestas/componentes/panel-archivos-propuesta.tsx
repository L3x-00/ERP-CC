'use client';

import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Select } from '@/compartido/componentes/ui/input';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { firmarArchivoPropuestaAccion } from '@/modulos/propuestas/acciones/firmar-archivo-propuesta';
import { subirArchivoPropuestaAccion } from '@/modulos/propuestas/acciones/subir-archivo-propuesta';
import type { ArchivoPropuesta } from '@/modulos/propuestas/servicios/obtener-propuesta';
import type { PropuestaItem, RevisionPropuesta } from '@/modulos/propuestas/tipos/indice';
import { claveDetallePropuesta } from './claves-consulta';

/**
 * SII-B4.8/4.11: archivos de la revisión: heredados del RFQ (sin duplicar),
 * propios (subida en DRAFT) y por ítem, con lectura por URL firmada corta.
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
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  const esBorrador = revision.estado === 'DRAFT';
  const propiosRevision = archivosPropios.filter((fila) => fila.entidadId === revision.id);

  async function ver(id: string): Promise<void> {
    const respuesta = await firmarArchivoPropuestaAccion({ archivoId: id });
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    window.open(respuesta.datos?.url, '_blank', 'noopener');
  }

  async function subir(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!archivo) {
      setMensaje('Selecciona un archivo');
      return;
    }
    setSubiendo(true);
    setMensaje(null);
    const fd = new FormData();
    fd.set('revisionId', revision.id);
    fd.set('tema', tema);
    fd.set('nombreArchivo', archivo.name);
    fd.set('archivo', archivo);
    const respuesta = await subirArchivoPropuestaAccion(fd);
    setSubiendo(false);
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    setArchivo(null);
    setMensaje('Archivo subido.');
    await queryClient.invalidateQueries({ queryKey: claveDetallePropuesta(revision.propuestaId) });
  }

  function codigoItem(entidadId: string): string {
    return items.find((item) => item.id === entidadId)?.codigo ?? 'Ítem';
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
            type="file"
            aria-label="Archivo de la propuesta"
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
        </form>
      )}

      <Grupo titulo="De la revisión" vacio="Sin archivos propios.">
        {propiosRevision.map((fila) => (
          <FilaArchivo
            key={fila.id}
            archivo={fila}
            chip={fila.temaCodigo === 'tecnico' ? 'Técnico' : 'General'}
            onVer={ver}
          />
        ))}
      </Grupo>

      <Grupo titulo="Heredados del RFQ" vacio="Sin archivos heredados.">
        {archivosHeredados.map((fila) => (
          <FilaArchivo
            key={fila.id}
            archivo={fila}
            chip={fila.entidad === 'rfq_item' ? 'Origen: RFQ · Ítem' : 'Origen: RFQ'}
            onVer={ver}
          />
        ))}
      </Grupo>

      <Grupo titulo="Por ítem de la propuesta" vacio="Sin archivos por ítem.">
        {archivosPorItem.map((fila) => (
          <FilaArchivo
            key={fila.id}
            archivo={fila}
            chip={`Ítem ${codigoItem(fila.entidadId)}`}
            onVer={ver}
          />
        ))}
      </Grupo>
    </section>
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
    <li className="flex items-center justify-between gap-2 py-2 text-sm">
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{archivo.nombreOriginal}</span>
        <span className="text-xs text-texto-secundario">
          {chip} · v{archivo.version} · {formatearFecha(archivo.creadoEn)}
        </span>
      </div>
      <Button variante="fantasma" tamano="sm" onClick={() => void onVer(archivo.id)}>
        Ver
      </Button>
    </li>
  );
}
