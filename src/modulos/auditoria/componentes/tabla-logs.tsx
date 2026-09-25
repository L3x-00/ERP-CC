'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';
import {
  Tabla, TablaCelda, TablaContenedor, TablaCuerpo, TablaEncabezado,
  TablaEncabezadoCelda, TablaFila,
} from '@/compartido/componentes/diseno/tabla';

import { formatearFecha, formatearHora } from '@/compartido/utilidades/indice';

import { obtenerLogsAccion } from '../acciones/obtener-logs';
import type { FiltrosLog } from '../tipos/indice';
import { enlaceRegistroAuditado } from '../utilidades/enlace-registro';

/**
 * Bitácora administrativa filtrable. La primera página consulta cambios cada
 * 30 segundos; las páginas siguientes mantienen un corte temporal para que
 * nuevas inserciones no desplacen filas durante la navegación.
 */
export function TablaLogs() {
  const [modulo, setModulo] = useState('');
  const [accion, setAccion] = useState('');
  const [actor, setActor] = useState('');
  const [recursoId, setRecursoId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(60);
  const [corte, setCorte] = useState<string>();

  function reiniciarBusqueda(): void {
    setPagina(1);
    setCorte(undefined);
  }

  const filtros: FiltrosLog = {
    pagina,
    porPagina,
    ...(corte ? { corte } : {}),
    ...(modulo.trim() !== '' ? { modulo: modulo.trim() } : {}),
    ...(accion.trim() !== '' ? { accion: accion.trim() } : {}),
    ...(actor.trim() !== '' ? { actor: actor.trim() } : {}),
    ...(recursoId.trim() !== '' ? { recursoId: recursoId.trim() } : {}),
    ...(desde ? { desde: new Date(`${desde}T00:00:00`).toISOString() } : {}),
    ...(hasta ? { hasta: new Date(`${hasta}T23:59:59.999`).toISOString() } : {}),
  };

  const {
    data: respuesta,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['logs', filtros],
    queryFn: () => obtenerLogsAccion(filtros),
    refetchInterval: 30_000,
  });

  /**
   * Actualiza el filtro de módulo y regresa a la primera página.
   *
   * @param valor - Texto ingresado en el input de módulo.
   */
  function manejarCambioModulo(valor: string): void {
    setModulo(valor);
    reiniciarBusqueda();
  }

  /**
   * Actualiza el filtro de acción y regresa a la primera página.
   *
   * @param valor - Texto ingresado en el input de acción.
   */
  function manejarCambioAccion(valor: string): void {
    setAccion(valor);
    reiniciarBusqueda();
  }

  const datos = respuesta !== undefined && respuesta.exito ? respuesta.datos : undefined;
  const errorAccion = respuesta !== undefined && !respuesta.exito ? respuesta.error : null;
  const registros = datos?.registros ?? [];
  const total = datos?.total ?? 0;
  const totalPaginas = total > 0 ? Math.ceil(total / porPagina) : 1;
  const hayError = isError || errorAccion !== null;
  const mostrarVacio = !isLoading && !hayError && registros.length === 0;
  const mostrarTabla = !isLoading && !hayError && registros.length > 0;

  return (
    <div className="flex flex-col gap-4" data-testid="bitacora-configuracion">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-modulo" className="text-sm font-medium">
            Módulo
          </label>
          <Input
            id="filtro-modulo"
            type="text"
            value={modulo}
            onChange={(evento) => manejarCambioModulo(evento.target.value)}
            placeholder="ej. clientes"
            maxLength={80}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-accion" className="text-sm font-medium">
            Acción
          </label>
          <Input
            id="filtro-accion"
            type="text"
            value={accion}
            onChange={(evento) => manejarCambioAccion(evento.target.value)}
            placeholder="ej. crear"
            maxLength={80}
          />
        </div>
        <label className="grid gap-1 text-sm font-medium" htmlFor="filtro-actor">Actor
          <Input id="filtro-actor" value={actor} onChange={(evento) => { setActor(evento.target.value); reiniciarBusqueda(); }} placeholder="Nombre del usuario" maxLength={120} />
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="filtro-recurso">Registro
          <Input id="filtro-recurso" value={recursoId} onChange={(evento) => { setRecursoId(evento.target.value); reiniciarBusqueda(); }} placeholder="ID del registro" maxLength={120} />
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="filtro-desde">Desde
          <Input id="filtro-desde" type="date" value={desde} max={hasta || undefined} onChange={(evento) => { setDesde(evento.target.value); reiniciarBusqueda(); }} />
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="filtro-hasta">Hasta
          <Input id="filtro-hasta" type="date" value={hasta} min={desde || undefined} onChange={(evento) => { setHasta(evento.target.value); reiniciarBusqueda(); }} />
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="tamano-bitacora">Entradas por página
          <Select id="tamano-bitacora" value={porPagina} onChange={(evento) => { setPorPagina(Number(evento.target.value)); reiniciarBusqueda(); }}>
            <option value={60}>60 recientes</option>
            <option value={30}>30</option>
            <option value={10}>10</option>
          </Select>
        </label>
      </div>

      {isLoading && <div aria-label="Cargando bitácora" className="grid gap-2"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}

      {!isLoading && hayError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-peligro-texto">
          {errorAccion ?? 'No se pudieron cargar los registros de auditoría.'}
          <Button variante="contorno" tamano="lg" onClick={() => void refetch()}>Reintentar</Button>
        </div>
      )}

      {mostrarVacio && (
        <EstadoVacio titulo="Sin actividad para estos filtros" descripcion="Ajusta actor, fecha o registro para ampliar la búsqueda." />
      )}

      {mostrarTabla && (
        <div className="space-y-2">
          <p className="text-xs text-texto-secundario sm:hidden">Desliza la tabla para ver todas las columnas.</p>
          <TablaContenedor role="region" tabIndex={0} aria-label="Tabla de actividad, desplazamiento horizontal">
          <Tabla className="min-w-[760px]">
            <TablaEncabezado>
              <tr>
                <TablaEncabezadoCelda>Fecha</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Usuario</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Rol</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Acción</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Módulo</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Registro</TablaEncabezadoCelda>
              </tr>
            </TablaEncabezado>
            <TablaCuerpo>
              {registros.map((log) => {
                const enlace = enlaceRegistroAuditado(log);
                return <TablaFila key={log.id}>
                  <TablaCelda className="whitespace-nowrap">
                    {formatearFecha(log.creadoEn)} {formatearHora(log.creadoEn)}
                  </TablaCelda>
                  <TablaCelda>{log.nombreUsuario}</TablaCelda>
                  <TablaCelda>{log.rol}</TablaCelda>
                  <TablaCelda>{log.accion}</TablaCelda>
                  <TablaCelda>{log.modulo}</TablaCelda>
                  <TablaCelda>{enlace ? <Link className="text-acento underline-offset-2 hover:underline focus-visible:underline" href={enlace}>Abrir registro</Link> : <span className="break-all text-texto-secundario">{log.recursoId}</span>}</TablaCelda>
                </TablaFila>;
              })}
            </TablaCuerpo>
          </Tabla>
          </TablaContenedor>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-texto-secundario">
          {total} registros · Página {pagina} de {totalPaginas} · Actualización cada 30 s
        </span>
        <div className="flex gap-2">
          <Button tamano="lg" variante="contorno" onClick={() => void refetch()} disabled={isLoading}>
            Actualizar
          </Button>
          <Button
            tamano="lg" variante="contorno"
            disabled={pagina <= 1 || isLoading}
            onClick={() => { if (pagina === 2) setCorte(undefined); setPagina((previo) => Math.max(1, previo - 1)); }}
          >
            Anterior
          </Button>
          <Button
            tamano="lg" variante="contorno"
            disabled={pagina >= totalPaginas || isLoading}
            onClick={() => { if (pagina === 1) setCorte(registros[0]?.creadoEn); setPagina((previo) => previo + 1); }}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
