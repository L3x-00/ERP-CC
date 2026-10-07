'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { Tabla, TablaCelda, TablaContenedor, TablaCuerpo, TablaEncabezado, TablaEncabezadoCelda, TablaFila } from '@/compartido/componentes/diseno/tabla';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { cn } from '@/compartido/utilidades/cn';
import { formatearFecha, formatearHora } from '@/compartido/utilidades/indice';

import { obtenerActividadAccion } from '../acciones/obtener-actividad';
import type { RegistroActividad } from '../tipos/indice';
import {
  agruparPorCorrelacion,
  etiquetaAccion,
  etiquetaGrupoActividad,
  etiquetaModulo,
  MODULOS_ACTIVIDAD,
  textoRecurso,
} from '../utilidades/actividad';
import { enlaceRegistroActividad } from '../utilidades/enlace-registro';
import type { FiltrosActividadInput } from '../validaciones/esquemas-actividad';

type Cursor = { creadoEn: string; id: string };

/**
 * Actividad operativa: filtros por usuario/módulo/acción/registro/fechas,
 * paginación estable por cursor y agrupación visual por `correlationId`
 * (misma acción de negocio). Nunca muestra UUID técnicos: el registro se
 * muestra con la etiqueta resuelta en SQL o su folio.
 */
export function TablaActividad({ esAdmin }: { esAdmin: boolean }) {
  const [actorTexto, setActorTexto] = useState('');
  const [modulo, setModulo] = useState('');
  const [accion, setAccion] = useState('');
  const [recursoId, setRecursoId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [limite, setLimite] = useState(30);
  const [cursores, setCursores] = useState<(Cursor | undefined)[]>([undefined]);

  const cursor = cursores[cursores.length - 1];
  const filtros: FiltrosActividadInput = {
    limite,
    ...(actorTexto.trim() !== '' ? { actorTexto: actorTexto.trim() } : {}),
    ...(modulo !== '' ? { modulo } : {}),
    ...(accion.trim() !== '' ? { accion: accion.trim() } : {}),
    ...(recursoId.trim() !== '' ? { recursoId: recursoId.trim() } : {}),
    ...(desde ? { desde: new Date(`${desde}T00:00:00`).toISOString() } : {}),
    ...(hasta ? { hasta: new Date(`${hasta}T23:59:59.999`).toISOString() } : {}),
    ...(cursor ? { cursorCreado: cursor.creadoEn, cursorId: cursor.id } : {}),
  };

  const { data: respuesta, isLoading, isError, refetch } = useQuery({
    queryKey: ['actividad', filtros],
    queryFn: () => obtenerActividadAccion(filtros),
  });

  function reiniciarPaginacion(): void {
    setCursores([undefined]);
  }

  const datos = respuesta !== undefined && respuesta.exito ? respuesta.datos : undefined;
  const errorAccion = respuesta !== undefined && !respuesta.exito ? respuesta.error : null;
  const registros = datos?.registros ?? [];
  const hayMas = datos?.hayMas ?? false;
  const grupos = agruparPorCorrelacion(registros);
  const columnas = esAdmin ? 6 : 5;
  const hayError = isError || errorAccion !== null;
  const mostrarVacio = !isLoading && !hayError && registros.length === 0;
  const mostrarTabla = !isLoading && !hayError && registros.length > 0;
  const pagina = cursores.length;

  function irASiguiente(): void {
    const ultimo = registros[registros.length - 1];
    if (!ultimo || !hayMas) return;
    setCursores((previos) => [...previos, { creadoEn: ultimo.creadoEn, id: ultimo.id }]);
  }

  function irAnterior(): void {
    setCursores((previos) => (previos.length > 1 ? previos.slice(0, -1) : previos));
  }

  return (
    <div className="flex flex-col gap-4" data-testid="vista-actividad">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium" htmlFor="actividad-usuario">
          Usuario
          <Input
            id="actividad-usuario"
            value={actorTexto}
            onChange={(evento) => { setActorTexto(evento.target.value); reiniciarPaginacion(); }}
            placeholder="Nombre del usuario"
            maxLength={120}
          />
        </label>

        <label className="grid gap-1 text-sm font-medium" htmlFor="actividad-modulo">
          Módulo
          <Select
            id="actividad-modulo"
            value={modulo}
            onChange={(evento) => { setModulo(evento.target.value); reiniciarPaginacion(); }}
          >
            <option value="">Todos</option>
            {MODULOS_ACTIVIDAD.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>
            ))}
          </Select>
        </label>

        <label className="grid gap-1 text-sm font-medium" htmlFor="actividad-accion">
          Acción
          <Input
            id="actividad-accion"
            value={accion}
            onChange={(evento) => { setAccion(evento.target.value); reiniciarPaginacion(); }}
            placeholder="ej. crear"
            maxLength={80}
          />
        </label>

        <label className="grid gap-1 text-sm font-medium" htmlFor="actividad-recurso">
          Registro
          <Input
            id="actividad-recurso"
            value={recursoId}
            onChange={(evento) => { setRecursoId(evento.target.value); reiniciarPaginacion(); }}
            placeholder="Identificador exacto del registro"
            maxLength={120}
          />
        </label>

        <label className="grid gap-1 text-sm font-medium" htmlFor="actividad-desde">
          Desde
          <Input
            id="actividad-desde"
            type="date"
            value={desde}
            max={hasta || undefined}
            onChange={(evento) => { setDesde(evento.target.value); reiniciarPaginacion(); }}
          />
        </label>

        <label className="grid gap-1 text-sm font-medium" htmlFor="actividad-hasta">
          Hasta
          <Input
            id="actividad-hasta"
            type="date"
            value={hasta}
            min={desde || undefined}
            onChange={(evento) => { setHasta(evento.target.value); reiniciarPaginacion(); }}
          />
        </label>

        <label className="grid gap-1 text-sm font-medium" htmlFor="actividad-limite">
          Eventos por página
          <Select
            id="actividad-limite"
            value={limite}
            onChange={(evento) => { setLimite(Number(evento.target.value)); reiniciarPaginacion(); }}
          >
            <option value={30}>30</option>
            <option value={60}>60</option>
            <option value={100}>100</option>
          </Select>
        </label>
      </div>

      {isLoading && <SkeletonTabla filas={6} columnas={columnas} />}

      {!isLoading && hayError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-peligro-texto">
          {errorAccion ?? 'No se pudo cargar la actividad.'}
          <Button variante="contorno" tamano="lg" onClick={() => void refetch()}>Reintentar</Button>
        </div>
      )}

      {mostrarVacio && (
        <EstadoVacio
          titulo="Sin actividad para estos filtros"
          descripcion="Ajusta usuario, módulo, acción o el rango de fechas para ampliar la búsqueda."
        />
      )}

      {mostrarTabla && (
        <div className="space-y-2">
          <p className="text-xs text-texto-secundario sm:hidden">Desliza la tabla para ver todas las columnas.</p>
          <TablaContenedor role="region" tabIndex={0} aria-label="Tabla de actividad, desplazamiento horizontal">
            <Tabla className="min-w-[820px]">
              <TablaEncabezado>
                <tr>
                  <TablaEncabezadoCelda>Fecha</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Usuario</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Acción</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Módulo</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Registro</TablaEncabezadoCelda>
                  {esAdmin ? <TablaEncabezadoCelda>Contexto</TablaEncabezadoCelda> : null}
                </tr>
              </TablaEncabezado>
              <TablaCuerpo>
                {grupos.map((grupo) => (
                  <Fragment key={grupo.correlationId ?? grupo.registros[0]!.id}>
                    {grupo.correlationId && grupo.registros.length > 1 ? (
                      <TablaFila className="bg-acento-suave/60">
                        <TablaCelda colSpan={columnas} className="py-2">
                          <span
                            data-testid="grupo-correlacion"
                            className="text-xs font-semibold uppercase tracking-wide text-acento"
                          >
                            {etiquetaGrupoActividad(grupo)} · {grupo.registros.length} eventos relacionados
                          </span>
                        </TablaCelda>
                      </TablaFila>
                    ) : null}
                    {grupo.registros.map((registro) => (
                      <FilaActividad
                        key={registro.id}
                        registro={registro}
                        esAdmin={esAdmin}
                        enGrupo={Boolean(grupo.correlationId) && grupo.registros.length > 1}
                      />
                    ))}
                  </Fragment>
                ))}
              </TablaCuerpo>
            </Tabla>
          </TablaContenedor>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-texto-secundario">
          {registros.length} eventos en esta página · Página {pagina}
        </span>
        <div className="flex gap-2">
          <Button tamano="lg" variante="contorno" onClick={() => void refetch()} disabled={isLoading}>
            Actualizar
          </Button>
          <Button tamano="lg" variante="contorno" onClick={irAnterior} disabled={pagina <= 1 || isLoading}>
            Anterior
          </Button>
          <Button tamano="lg" variante="contorno" onClick={irASiguiente} disabled={!hayMas || isLoading}>
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilaActividad({
  registro,
  esAdmin,
  enGrupo,
}: {
  registro: RegistroActividad;
  esAdmin: boolean;
  enGrupo: boolean;
}) {
  const enlace = enlaceRegistroActividad(registro);
  const texto = textoRecurso(registro);

  return (
    <TablaFila data-testid="fila-actividad" className={cn(enGrupo && 'border-l-2 border-l-acento/60')}>
      <TablaCelda className="whitespace-nowrap">
        {formatearFecha(registro.creadoEn)} {formatearHora(registro.creadoEn)}
      </TablaCelda>
      <TablaCelda>
        <span className="font-medium text-texto-primario">{registro.nombreUsuario}</span>
        <span className="block text-xs text-texto-secundario">{registro.rol}</span>
      </TablaCelda>
      <TablaCelda>{etiquetaAccion(registro.accion)}</TablaCelda>
      <TablaCelda>{etiquetaModulo(registro.modulo)}</TablaCelda>
      <TablaCelda>
        {enlace ? (
          <Link
            href={enlace}
            className="text-acento underline-offset-2 hover:underline focus-visible:underline"
          >
            {texto}
          </Link>
        ) : (
          <span className="text-texto-secundario">{texto}</span>
        )}
      </TablaCelda>
      {esAdmin ? (
        <TablaCelda>
          {registro.contexto ? (
            <details className="text-xs">
              <summary className="cursor-pointer font-medium text-acento">Ver contexto</summary>
              <pre className="mt-1 max-w-xs overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-texto-secundario">
                {JSON.stringify(registro.contexto, null, 2)}
              </pre>
            </details>
          ) : (
            <span className="text-texto-tenue">—</span>
          )}
        </TablaCelda>
      ) : null}
    </TablaFila>
  );
}
