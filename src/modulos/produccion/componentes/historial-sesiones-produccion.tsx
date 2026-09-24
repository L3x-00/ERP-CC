'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import { formatearFecha, formatearHora, formatearNumero } from '@/compartido/utilidades/formatear';
import type { ArchivoSesionResumen } from '@/modulos/produccion/archivos-sesion-config';
import {
  obtenerArchivosSesionOrdenAccion,
  obtenerUrlArchivoSesionAccion,
} from '@/modulos/produccion/acciones/archivos-sesion';
import { CLAVE_ARCHIVOS_SESION } from '@/modulos/produccion/componentes/claves-consulta';
import { subirArchivoSesionDesdeNavegador } from '@/modulos/produccion/subir-archivo-sesion-cliente';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';

const MOTIVOS: Record<string, string> = {
  falta_informacion: 'Falta de información', material_pendiente: 'Material pendiente',
  aprobacion_cliente: 'Aprobación de cliente', problema_tecnico: 'Problema técnico',
  mantenimiento: 'Mantenimiento', otro: 'Otro',
};

/** Historial inmutable de intervalos de trabajo; nunca mezcla piezas con operaciones únicas. */
export function HistorialSesionesProduccion({ orden, responsables }: {
  orden: OrdenTableroProduccion | null;
  responsables: Readonly<Record<string, string>>;
}) {
  const clienteConsultas = useQueryClient();
  const [subiendoSesionId, setSubiendoSesionId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ sesionId: string; texto: string } | null>(null);
  const consulta = useQuery({
    queryKey: [...CLAVE_ARCHIVOS_SESION, orden?.id],
    queryFn: async (): Promise<ArchivoSesionResumen[]> => {
      const respuesta = await obtenerArchivosSesionOrdenAccion({ ordenId: orden?.id });
      if (!respuesta.exito || !respuesta.datos) throw new Error('No se pudieron consultar los archivos de sesión');
      return respuesta.datos;
    },
    enabled: orden !== null,
    staleTime: 30_000,
  });
  const archivosPorSesion = new Map<string, ArchivoSesionResumen[]>();
  for (const archivo of consulta.data ?? []) {
    const actuales = archivosPorSesion.get(archivo.sesionId) ?? [];
    if (archivo.clase === 'sesion') actuales.push(archivo);
    archivosPorSesion.set(archivo.sesionId, actuales);
  }

  async function subir(evento: FormEvent<HTMLFormElement>, sesionId: string): Promise<void> {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const archivo = new FormData(formulario).get('archivo');
    if (!(archivo instanceof File)) {
      setMensaje({ sesionId, texto: 'Selecciona un archivo de hasta 20 MiB' });
      return;
    }
    setSubiendoSesionId(sesionId);
    setMensaje(null);
    try {
      await subirArchivoSesionDesdeNavegador(sesionId, 'sesion', archivo);
      formulario.reset();
      setMensaje({ sesionId, texto: 'Archivo asociado a la sesión' });
      await clienteConsultas.invalidateQueries({ queryKey: CLAVE_ARCHIVOS_SESION }).catch(() => {
        setMensaje({ sesionId, texto: 'Archivo asociado; actualiza la lista para verlo' });
      });
    } catch (error) {
      setMensaje({ sesionId, texto: error instanceof Error ? error.message : 'No se pudo subir el archivo' });
    } finally {
      setSubiendoSesionId(null);
    }
  }

  async function abrir(archivoId: string): Promise<void> {
    if (!orden) return;
    const resultado = await obtenerUrlArchivoSesionAccion({ ordenId: orden.id, archivoId });
    if (!resultado.exito || !resultado.datos) {
      setMensaje({ sesionId: '', texto: resultado.exito ? 'No se pudo abrir el archivo' : resultado.error });
      return;
    }
    window.open(resultado.datos.url, '_blank', 'noopener,noreferrer');
  }

  const sesiones = [...(orden?.sesiones ?? [])]
    .sort((primera, segunda) => segunda.fechaInicio.localeCompare(primera.fechaInicio));
  return (
    <section aria-labelledby="titulo-historial-sesiones" className="rounded-lg border border-borde bg-superficie p-4">
      <h2 id="titulo-historial-sesiones" className="text-base font-semibold">Historial de sesiones</h2>
      {!orden ? <p className="mt-2 text-sm text-texto-secundario">Selecciona una orden para consultar sus sesiones.</p> : null}
      {orden && sesiones.length === 0 ? <p className="mt-2 text-sm text-texto-secundario">La orden aún no tiene sesiones de trabajo.</p> : null}
      {orden && consulta.isError ? <p role="alert" className="mt-2 text-sm text-peligro-texto">No se pudieron cargar los archivos de sesión.</p> : null}
      {mensaje?.sesionId === '' ? <p role="alert" className="mt-2 text-sm text-peligro-texto">{mensaje.texto}</p> : null}
      {sesiones.length > 0 ? (
        <ol className="mt-3 grid gap-3 lg:grid-cols-2">
          {sesiones.map((sesion) => (
            <li key={sesion.id} className="rounded-md border border-borde p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <strong>{responsables[sesion.operadorId] ?? 'Operador histórico'}</strong>
                <span className="text-texto-secundario">{sesion.estadoSesion === 'activa' ? 'Activa' : sesion.estadoSesion === 'pausada' ? 'Pausada' : 'Finalizada'}</span>
              </div>
              <p className="mt-1 text-texto-secundario">
                {formatearFecha(sesion.fechaInicio)} · {formatearHora(sesion.fechaInicio)}–{sesion.fechaFin ? formatearHora(sesion.fechaFin) : 'en curso'}
              </p>
              <p className="mt-1 tabular-nums">{formatearNumero(sesion.horasNetas)} h netas · {formatearNumero(sesion.piezasProducidas)} piezas producidas</p>
              {sesion.motivoPausa ? <p className="mt-1">Incidencia: {MOTIVOS[sesion.motivoPausa] ?? sesion.motivoPausa}</p> : null}
              {sesion.notas ? <p className="mt-1 whitespace-pre-wrap text-texto-secundario">Notas: {sesion.notas}</p> : null}
              <div className="mt-3 border-t border-borde pt-2">
                <h3 className="font-medium">Archivos de esta sesión</h3>
                {(archivosPorSesion.get(sesion.id) ?? []).length === 0
                  ? <p className="mt-1 text-texto-secundario">Sin archivos asociados.</p>
                  : <ul className="mt-1 grid gap-1">
                    {(archivosPorSesion.get(sesion.id) ?? []).map((archivo) => (
                      <li key={archivo.id} className="flex min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0 truncate" title={archivo.nombre}>{archivo.nombre}</span>
                        <Button type="button" variante="contorno" tamano="sm" onClick={() => void abrir(archivo.id)}>
                          Abrir en lectura
                        </Button>
                      </li>
                    ))}
                  </ul>}
                <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(evento) => void subir(evento, sesion.id)}>
                  <label className="grid min-w-0 flex-1 gap-1 text-xs text-texto-secundario">
                    Adjuntar a esta sesión (hasta 20 MiB)
                    <Input name="archivo" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.dxf,.dwg,.step,.stp,.igs,.iges,.eps,.ai" aria-label={`Archivo para sesión ${formatearFecha(sesion.fechaInicio)}`} />
                  </label>
                  <Button type="submit" tamano="sm" disabled={subiendoSesionId !== null}>
                    {subiendoSesionId === sesion.id ? 'Subiendo…' : 'Subir archivo'}
                  </Button>
                </form>
                {mensaje?.sesionId === sesion.id ? <p role="status" className="mt-1 text-texto-secundario">{mensaje.texto}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
