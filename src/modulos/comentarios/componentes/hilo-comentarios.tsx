'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  agregarComentarioAccion,
  eliminarComentarioAccion,
  obtenerComentariosAccion,
  obtenerUsuariosMencionablesAccion,
} from '@/modulos/comentarios/acciones/indice';
import { CLAVE_COMENTARIOS, SincronizadorComentariosRealtime } from './sincronizador-comentarios-realtime';
import { normalizarNombreMencion } from '@/modulos/comentarios/servicios/parser-menciones';
import type {
  ComentarioRegistro,
  MencionUsuario,
  TipoEntidadComentario,
} from '@/modulos/comentarios/tipos/indice';

const CLASE_BOTON = 'rounded-base border border-foreground/20 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50';
const CLASE_PRIMARIO = 'rounded-base bg-primario px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

interface PropsHiloComentarios {
  entidadTipo: TipoEntidadComentario;
  entidadId: string;
  usuarioActualId?: string;
  puedeEliminarTodos?: boolean;
  titulo?: string;
}

function fechaComentario(valor: string): string {
  const fecha = new Date(valor);
  return Number.isFinite(fecha.getTime())
    ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(fecha)
    : 'Fecha no disponible';
}

/** Hilo contextual con menciones, borrado lógico y sincronización Realtime. */
export function HiloComentarios({
  entidadTipo,
  entidadId,
  usuarioActualId,
  puedeEliminarTodos = false,
  titulo = 'Comentarios',
}: PropsHiloComentarios) {
  const clienteQuery = useQueryClient();
  const [contenido, setContenido] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [usuarios, setUsuarios] = useState<MencionUsuario[]>([]);
  const consulta = useQuery({
    queryKey: [...CLAVE_COMENTARIOS, entidadTipo, entidadId],
    queryFn: async (): Promise<ComentarioRegistro[]> => {
      const respuesta = await obtenerComentariosAccion({ entidadTipo, entidadId });
      if (!respuesta.exito || !respuesta.datos) throw new Error(respuesta.exito ? 'Hilo vacío' : respuesta.error);
      return respuesta.datos;
    },
    staleTime: 0,
  });

  useEffect(() => {
    let activo = true;
    void obtenerUsuariosMencionablesAccion().then((respuesta) => {
      if (activo && respuesta.exito && respuesta.datos) setUsuarios(respuesta.datos);
    });
    return () => { activo = false; };
  }, []);

  const sugerencias = useMemo(() => {
    const coincidencia = contenido.match(/(?:^|\s)@([^\s@]*)$/u);
    if (!coincidencia) return [];
    const termino = normalizarNombreMencion(coincidencia[1] ?? '');
    return usuarios
      .filter((usuario) => normalizarNombreMencion(usuario.nombre).includes(termino))
      .slice(0, 6);
  }, [contenido, usuarios]);

  function seleccionarMencion(usuario: MencionUsuario): void {
    const coincidencia = contenido.match(/(?:^|\s)@([^\s@]*)$/u);
    if (!coincidencia || coincidencia.index === undefined) return;
    const inicio = coincidencia.index + (coincidencia[0].startsWith(' ') ? 1 : 0);
    setContenido(`${contenido.slice(0, inicio)}@${usuario.nombre} `);
  }

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setMensaje(null);
    if (contenido.trim().length === 0) {
      setMensaje('Escribe un comentario antes de enviarlo');
      return;
    }
    setEnviando(true);
    try {
      const respuesta = await agregarComentarioAccion({ entidadTipo, entidadId, contenido, menciones: [] });
      if (!respuesta.exito) {
        setMensaje(respuesta.error);
        return;
      }
      setContenido('');
      await clienteQuery.invalidateQueries({ queryKey: [...CLAVE_COMENTARIOS, entidadTipo, entidadId] });
    } catch {
      setMensaje('No se pudo guardar el comentario');
    } finally {
      setEnviando(false);
    }
  }

  async function eliminar(comentario: ComentarioRegistro): Promise<void> {
    setMensaje(null);
    const respuesta = await eliminarComentarioAccion({ comentarioId: comentario.id });
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    await clienteQuery.invalidateQueries({ queryKey: [...CLAVE_COMENTARIOS, entidadTipo, entidadId] });
  }

  const comentarios = consulta.data ?? [];
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`titulo-comentarios-${entidadId}`} data-testid="hilo-comentarios">
      <SincronizadorComentariosRealtime entidadTipo={entidadTipo} entidadId={entidadId} />
      <header className="flex items-center justify-between gap-2">
        <h3 id={`titulo-comentarios-${entidadId}`} className="text-base font-semibold">{titulo}</h3>
        <span className="text-xs text-foreground/60">{comentarios.length} mensaje(s)</span>
      </header>
      <form onSubmit={enviar} className="relative flex flex-col gap-2">
        <label htmlFor={`comentario-${entidadId}`} className="sr-only">Nuevo comentario</label>
        <textarea
          id={`comentario-${entidadId}`}
          value={contenido}
          maxLength={2000}
          onChange={(evento) => setContenido(evento.target.value)}
          placeholder="Escribe una actualización y menciona a @alguien…"
          rows={3}
          className="w-full rounded-base border border-foreground/20 bg-background px-3 py-2 text-sm outline-none focus:border-primario focus:ring-2 focus:ring-primario/30"
        />
        {sugerencias.length > 0 && (
          <ul role="listbox" aria-label="Usuarios para mencionar" className="absolute left-0 top-full z-10 mt-1 w-full max-w-sm rounded-base border border-foreground/15 bg-background p-1 shadow-lg">
            {sugerencias.map((usuario) => (
              <li key={usuario.id}>
                <button type="button" role="option" aria-selected="false" onClick={() => seleccionarMencion(usuario)} className="w-full rounded px-2 py-1 text-left text-sm hover:bg-foreground/5">
                  @{usuario.nombre}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-foreground/60">{contenido.length}/2000</span>
          <button type="submit" disabled={enviando || contenido.trim().length === 0} className={CLASE_PRIMARIO}>
            {enviando ? 'Guardando…' : 'Comentar'}
          </button>
        </div>
      </form>
      {mensaje && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{mensaje}</p>}
      {consulta.isLoading && <p className="text-sm text-foreground/60">Cargando comentarios…</p>}
      {consulta.isError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">No se pudo cargar el hilo.</p>}
      <ol className="flex flex-col gap-3" aria-live="polite">
        {comentarios.map((comentario) => {
          const puedeEliminar = puedeEliminarTodos || comentario.autorId === usuarioActualId;
          return (
            <li key={comentario.id} className="rounded-base border border-foreground/10 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">{comentario.autorNombre}</span>
                  <time dateTime={comentario.creadoEn} className="text-xs text-foreground/60">{fechaComentario(comentario.creadoEn)}</time>
                </div>
                {puedeEliminar && (
                  <button type="button" className={CLASE_BOTON} onClick={() => void eliminar(comentario)}>Eliminar</button>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">{comentario.contenido}</p>
              {comentario.editado && <span className="mt-2 block text-xs italic text-foreground/60">(editado)</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
