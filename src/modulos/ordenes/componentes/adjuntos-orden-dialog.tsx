'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Input } from '@/compartido/componentes/ui/input';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import {
  obtenerArchivosOrdenAccion,
  obtenerUrlArchivoOrdenAccion,
} from '@/modulos/ordenes/acciones/archivos-orden';
import type { ArchivoOrdenResumen } from '@/modulos/ordenes/archivos-orden-config';
import { subirArchivoOrdenDesdeNavegador } from '@/modulos/ordenes/subir-archivo-orden-cliente';

type Props = {
  ordenId: string;
  folio: string;
  onCerrar: () => void;
};

/** ORD-06: adjuntos privados del trabajo heredado, con carga directa firmada. */
export function AdjuntosOrdenDialog({ ordenId, folio, onCerrar }: Props) {
  const [archivos, setArchivos] = useState<ArchivoOrdenResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar(): Promise<void> {
    setCargando(true);
    const respuesta = await obtenerArchivosOrdenAccion({ ordenId });
    if (respuesta.exito && respuesta.datos) setArchivos(respuesta.datos);
    else setError(respuesta.exito ? 'No se pudo consultar los archivos' : respuesta.error);
    setCargando(false);
  }

  useEffect(() => {
    let vigente = true;
    void obtenerArchivosOrdenAccion({ ordenId }).then((respuesta) => {
      if (!vigente) return;
      if (respuesta.exito && respuesta.datos) setArchivos(respuesta.datos);
      else setError(respuesta.exito ? 'No se pudo consultar los archivos' : respuesta.error);
      setCargando(false);
    });
    return () => { vigente = false; };
  }, [ordenId]);

  async function subir(archivo: File | null): Promise<void> {
    if (!archivo) return;
    setError(null);
    setMensaje(null);
    setSubiendo(true);
    try {
      const subido = await subirArchivoOrdenDesdeNavegador(ordenId, archivo);
      setArchivos((previos) => [subido, ...previos]);
      setMensaje(`Archivo ${subido.nombre} adjuntado.`);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo subir el archivo');
    }
    setSubiendo(false);
  }

  async function abrir(archivoId: string): Promise<void> {
    setError(null);
    const respuesta = await obtenerUrlArchivoOrdenAccion({ ordenId, archivoId });
    if (respuesta.exito && respuesta.datos) window.open(respuesta.datos.url, '_blank', 'noopener');
    else setError(respuesta.exito ? 'No se pudo abrir el archivo' : respuesta.error);
  }

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto && !subiendo) onCerrar(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Archivos de {folio}</DialogTitle>
          <DialogDescription>
            Documentos del trabajo heredado en almacenamiento privado; se abren con enlace firmado de un minuto.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {cargando ? <p className="text-sm text-texto-secundario">Cargando archivos…</p> : null}
          {!cargando && archivos.length === 0 ? (
            <p className="text-sm text-texto-secundario">Sin archivos adjuntos.</p>
          ) : null}
          {archivos.map((archivo) => (
            <div
              key={archivo.id}
              data-testid={`archivo-orden-${archivo.id}`}
              className="flex items-center justify-between gap-3 rounded-base border border-borde p-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-texto-primario">{archivo.nombre}</p>
                <p className="text-xs text-texto-secundario">
                  {formatearFecha(archivo.creadoEn)} · {Math.round(archivo.tamano / 1024)} KiB
                </p>
              </div>
              <Button
                type="button"
                variante="contorno"
                tamano="sm"
                onClick={() => void abrir(archivo.id)}
              >
                Abrir
              </Button>
            </div>
          ))}
          <label className="flex flex-col gap-1 text-sm font-medium text-texto-secundario">
            Adjuntar archivo (máximo 20 MiB)
            <Input
              type="file"
              data-testid="subir-archivo-orden"
              disabled={subiendo}
              onChange={(evento) => {
                const archivo = evento.target.files?.[0] ?? null;
                evento.target.value = '';
                void subir(archivo);
              }}
            />
          </label>
          {cargando ? null : (
            <Button
              type="button"
              variante="contorno"
              tamano="sm"
              className="self-start"
              disabled={subiendo}
              onClick={() => void cargar()}
            >
              Actualizar lista
            </Button>
          )}
          {error ? <p role="alert" className="text-sm text-peligro-texto">{error}</p> : null}
          {mensaje ? <p role="status" className="text-sm text-exito-texto">{mensaje}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
