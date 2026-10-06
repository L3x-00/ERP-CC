'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Tarjeta } from '@/compartido/componentes/diseno/tarjeta';
import {
  Tabla,
  TablaCelda,
  TablaContenedor,
  TablaCuerpo,
  TablaEncabezado,
  TablaEncabezadoCelda,
  TablaFila,
} from '@/compartido/componentes/diseno/tabla';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';
import { usarPropuestas } from '@/modulos/propuestas/hooks/usar-propuesta';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import {
  ESTADOS_PROPIESTA,
  type EstadoPropuesta,
} from '@/modulos/propuestas/tipos/indice';
import { ETIQUETA_ESTADO_PROPIESTA } from '@/modulos/propuestas/utilidades/indice';

/**
 * SII-B4.11: cola de propuestas con filtros por estado, cliente, responsable y
 * próxima acción vencida. El estado y la búsqueda se resuelven en el servidor;
 * responsable/vencimiento se filtran con los datos ya cargados.
 */
export function ColaPropuestas() {
  const [estado, setEstado] = useState<EstadoPropuesta | ''>('');
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [responsable, setResponsable] = useState('');
  const [soloVencidas, setSoloVencidas] = useState(false);

  useEffect(() => {
    const temporizador = setTimeout(() => setBusqueda(texto), 300);
    return () => clearTimeout(temporizador);
  }, [texto]);

  const consulta = usarPropuestas({
    ...(estado ? { estado } : {}),
    ...(busqueda ? { busqueda } : {}),
  });

  const registros = useMemo(() => {
    const filas = (consulta.data?.exito ? consulta.data.datos : []) ?? [];
    return filas.filter(
      (fila) =>
        (responsable === '' || fila.responsableId === responsable) &&
        (!soloVencidas || fila.vencida),
    );
  }, [consulta.data, responsable, soloVencidas]);

  const responsables = useMemo(() => {
    const filas = (consulta.data?.exito ? consulta.data.datos : []) ?? [];
    return [...new Set(filas.map((fila) => fila.responsableId))].sort();
  }, [consulta.data]);

  return (
    <div className="flex flex-col gap-4" data-testid="cola-propuestas">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="Buscar por cliente…"
          aria-label="Buscar propuestas"
          className="w-64"
        />
        <Select
          value={estado}
          onChange={(evento) => setEstado(evento.target.value as EstadoPropuesta | '')}
          aria-label="Filtrar por estado"
          className="w-auto"
        >
          <option value="">Todos los estados</option>
          {ESTADOS_PROPIESTA.map((clave) => (
            <option key={clave} value={clave}>
              {ETIQUETA_ESTADO_PROPIESTA[clave]}
            </option>
          ))}
        </Select>
        <Select
          value={responsable}
          onChange={(evento) => setResponsable(evento.target.value)}
          aria-label="Filtrar por responsable"
          className="w-auto"
        >
          <option value="">Todos los responsables</option>
          {responsables.map((id) => (
            <option key={id} value={id}>
              {id.slice(0, 8)}…
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-texto-secundario">
          <input
            type="checkbox"
            checked={soloVencidas}
            onChange={(evento) => setSoloVencidas(evento.target.checked)}
            aria-label="Solo próxima acción vencida"
          />
          Próxima acción vencida
        </label>
      </div>

      {consulta.isLoading && <SkeletonTabla columnas={6} filas={6} />}

      {consulta.isError && (
        <p role="alert" className="text-sm text-peligro-texto">
          No se pudieron cargar las propuestas.
        </p>
      )}

      {!consulta.isLoading && consulta.data && !consulta.data.exito && (
        <p role="alert" className="text-sm text-peligro-texto">
          {consulta.data.error}
        </p>
      )}

      {!consulta.isLoading && consulta.data?.exito && registros.length === 0 && (
        <EstadoVacio
          titulo="Sin propuestas"
          descripcion="No hay propuestas que coincidan con los filtros. Crea una desde un RFQ listo para propuesta."
        />
      )}

      {!consulta.isLoading && registros.length > 0 && (
        <TablaContenedor>
          <Tabla>
            <TablaEncabezado>
              <tr>
                <TablaEncabezadoCelda>Folio</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Cliente</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Estado</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Revisión</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Próxima acción</TablaEncabezadoCelda>
                <TablaEncabezadoCelda className="text-right">Actualizada</TablaEncabezadoCelda>
              </tr>
            </TablaEncabezado>
            <TablaCuerpo>
              {registros.map((fila) => (
                <TablaFila key={fila.id}>
                  <TablaCelda className="font-mono text-xs">
                    <Link
                      href={`/propuestas?propuesta=${fila.id}`}
                      className="font-semibold text-acento hover:underline"
                    >
                      {fila.folioCnc}
                    </Link>
                  </TablaCelda>
                  <TablaCelda>{fila.empresa ?? '—'}</TablaCelda>
                  <TablaCelda>
                    <BadgeEstado
                      estado={fila.estado}
                      etiqueta={ETIQUETA_ESTADO_PROPIESTA[fila.estado]}
                    />
                  </TablaCelda>
                  <TablaCelda>
                    {fila.ultimaRevision ? (
                      <span className="flex flex-wrap items-center gap-2 text-xs">
                        <span>
                          {fila.ultimaRevision.letra} ·{' '}
                          {ETIQUETA_ESTADO_PROPIESTA[fila.ultimaRevision.estado]}
                        </span>
                        {(fila.ultimaRevision.requiereRevisionRuteo ||
                          fila.ultimaRevision.requiereRevisionCosteo) && (
                          <span className="rounded-full bg-advertencia-suave px-2 py-0.5 font-medium text-advertencia-texto">
                            Requiere revisión
                          </span>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TablaCelda>
                  <TablaCelda className={fila.vencida ? 'text-peligro-texto' : undefined}>
                    {fila.proximaAccion
                      ? `${fila.proximaAccion.codigo}${fila.proximaAccion.fecha ? ` · ${fila.proximaAccion.fecha}` : ''}`
                      : '—'}
                  </TablaCelda>
                  <TablaCelda className="text-right text-xs tabular-nums">
                    {formatearFecha(fila.actualizadoEn)}
                  </TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        </TablaContenedor>
      )}

      <Tarjeta className="p-3 text-xs text-texto-secundario">
        Las propuestas nacen desde un RFQ en estado «Listo para propuesta» (pestaña
        Propuestas de la ficha del RFQ).
      </Tarjeta>
    </div>
  );
}
