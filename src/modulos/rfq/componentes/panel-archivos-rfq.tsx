'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { formatearFecha, formatearHora } from '@/compartido/utilidades/formatear';
import { ETIQUETAS_ESTADO_RFQ } from '@/modulos/rfq/utilidades/estados';
import type { Rfq } from '@/modulos/rfq/tipos/indice';

import {
  firmarArchivoRfqAccion,
  listarArchivosRfqAccion,
  subirArchivoRfqAccion,
} from '../acciones/archivos-rfq';

const CLASES = ['CAD', 'DIBUJO', 'IMAGEN', 'ESPECIFICACIONES', 'OTROS'] as const;

/** Pestaña Archivos: generales (`rfq`) y por ítem (`rfq_item`) del modelo E3. */
export function PanelArchivosRfq({ rfq }: { rfq: Rfq }) {
  const clienteConsultas = useQueryClient();
  const [clase, setClase] = useState<(typeof CLASES)[number]>('CAD');
  const [itemId, setItemId] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const listado = useQuery({
    queryKey: ['rfq-archivos', rfq.id],
    queryFn: () => listarArchivosRfqAccion({ rfqId: rfq.id }),
  });
  const archivos = listado.data?.exito ? (listado.data.datos ?? []) : [];

  const subida = useMutation({
    mutationFn: async (entrada: { clase: string; itemId: string; archivo: File }) => {
      const formData = new FormData();
      formData.set('rfqId', rfq.id);
      formData.set('clase', entrada.clase);
      if (entrada.itemId) formData.set('itemId', entrada.itemId);
      formData.set('archivo', entrada.archivo);
      return subirArchivoRfqAccion(formData);
    },
    onSuccess: (respuesta) => {
      if (!respuesta.exito) {
        setMensaje(respuesta.error);
        return;
      }
      setMensaje(null);
      setArchivo(null);
      void clienteConsultas.invalidateQueries({ queryKey: ['rfq-archivos', rfq.id] });
      void clienteConsultas.invalidateQueries({ queryKey: ['rfq', rfq.id] });
    },
  });

  function manejarEnvio(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    if (!archivo) {
      setMensaje('Selecciona un archivo');
      return;
    }
    setMensaje(null);
    subida.mutate({ clase, itemId, archivo });
  }

  async function abrirArchivo(archivoId: string): Promise<void> {
    const respuesta = await firmarArchivoRfqAccion({ archivoId });
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    window.open(respuesta.datos?.url, '_blank', 'noopener,noreferrer');
  }

  const itemsActivos = rfq.items.filter((item) => item.estado === 'activo');

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
            id="archivo-input"
            type="file"
            onChange={(evento) => setArchivo(evento.target.files?.[0] ?? null)}
          />
        </label>
        <div className="flex items-end">
          <Button type="submit" tamano="lg" disabled={subida.isPending}>
            {subida.isPending ? 'Subiendo…' : 'Subir archivo'}
          </Button>
        </div>
      </form>

      {mensaje !== null && (
        <p role="alert" className="text-sm text-peligro-texto">
          {mensaje}
        </p>
      )}

      {listado.isLoading && <p className="text-sm text-texto-secundario">Cargando archivos…</p>}

      {!listado.isLoading && archivos.length === 0 && (
        <p className="rounded-lg border border-dashed border-borde px-4 py-6 text-center text-sm text-texto-secundario">
          Sin archivos vigentes.
        </p>
      )}

      {archivos.length > 0 && (
        <ul className="flex flex-col gap-2">
          {archivos.map((archivo) => (
            <li
              key={archivo.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borde bg-superficie px-3 py-2"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{archivo.nombreOriginal}</span>
                <span className="text-xs text-texto-secundario">
                  {archivo.clase}
                  {archivo.itemCodigo ? ` · ${archivo.itemCodigo}` : ' · General'}
                  {archivo.version > 1 ? ` · versión ${archivo.version}` : ''}
                  {' · '}
                  {formatearFecha(archivo.creadoEn)} {formatearHora(archivo.creadoEn)}
                </span>
              </div>
              <Button variante="contorno" tamano="sm" onClick={() => void abrirArchivo(archivo.id)}>
                Abrir
              </Button>
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
