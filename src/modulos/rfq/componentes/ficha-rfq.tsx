'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';
import { Button } from '@/compartido/componentes/ui/button';
import { ETIQUETAS_ESTADO_RFQ } from '@/modulos/rfq/utilidades/estados';
import type { Rfq } from '@/modulos/rfq/tipos/indice';

import { obtenerRfqAccion } from '../acciones/obtener-rfq';
import { obtenerCatalogosRfqAccion } from '../acciones/obtener-catalogos';
import { ActividadRfq } from './actividad-rfq';
import { FormularioGeneralRfq } from './formulario-general-rfq';
import { PanelAccionesRfq } from './panel-acciones-rfq';
import { PanelArchivosRfq } from './panel-archivos-rfq';
import { TablaItemsRfq } from './tabla-items-rfq';

const PESTANAS = [
  { clave: 'resumen', etiqueta: 'Resumen' },
  { clave: 'items', etiqueta: 'Ítems' },
  { clave: 'archivos', etiqueta: 'Archivos' },
  { clave: 'propuestas', etiqueta: 'Propuestas' },
  { clave: 'actividad', etiqueta: 'Actividad' },
] as const;

type PestanaRfq = (typeof PESTANAS)[number]['clave'];

/**
 * Ficha RFQ (plan §3.8): encabezado folio + estado, acciones de negocio arriba
 * y pestañas Resumen, Ítems, Archivos, Propuestas (placeholder B4) y Actividad.
 */
export function FichaRfq({ rfqId }: { rfqId: string }) {
  const [pestana, setPestana] = useState<PestanaRfq>('resumen');

  const consulta = useQuery({
    queryKey: ['rfq', rfqId],
    queryFn: () => obtenerRfqAccion({ rfqId }),
  });
  const catalogos = useQuery({
    queryKey: ['rfq-catalogos'],
    queryFn: () => obtenerCatalogosRfqAccion(),
    staleTime: 60_000,
  });

  const rfq: Rfq | undefined = consulta.data?.exito ? consulta.data.datos : undefined;
  const catalogosDatos = catalogos.data?.exito ? (catalogos.data.datos ?? null) : null;
  const error = consulta.isError
    ? 'No se pudo cargar el RFQ'
    : consulta.data && !consulta.data.exito
      ? consulta.data.error
      : null;

  if (consulta.isLoading) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !rfq) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <p role="alert" className="text-sm text-peligro-texto">
          {error ?? 'El RFQ no existe'}
        </p>
        <Link href="/rfq" className="text-sm font-semibold text-acento hover:underline">
          Volver a la cola
        </Link>
      </div>
    );
  }

  const folio = rfq.folio;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4" data-testid="ficha-rfq">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/rfq" className="text-xs font-semibold text-acento hover:underline">
            ← Cola de RFQ
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-bold">{folio}</h1>
            <BadgeEstado estado={rfq.estadoRfq} etiqueta={ETIQUETAS_ESTADO_RFQ[rfq.estadoRfq]} />
            {rfq.folioCnc && (
              <span className="text-xs text-texto-secundario">CNC {rfq.folioCnc}</span>
            )}
          </div>
          <p className="text-sm text-texto-secundario">
            {rfq.descripcionGeneral ?? 'Sin descripción general'}
          </p>
        </div>
        <Button variante="contorno" tamano="sm" onClick={() => void consulta.refetch()}>
          Actualizar
        </Button>
      </div>

      <PanelAccionesRfq rfq={rfq} onCambio={() => void consulta.refetch()} />

      <div role="tablist" aria-label="Secciones del RFQ" className="flex flex-wrap gap-1 border-b border-borde">
        {PESTANAS.map((opcion) => (
          <button
            key={opcion.clave}
            type="button"
            role="tab"
            aria-selected={pestana === opcion.clave}
            onClick={() => setPestana(opcion.clave)}
            className={
              pestana === opcion.clave
                ? 'border-b-2 border-acento px-3 py-2 text-sm font-semibold text-acento'
                : 'border-b-2 border-transparent px-3 py-2 text-sm text-texto-secundario hover:text-texto-primario'
            }
          >
            {opcion.etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'resumen' && (
        <div className="flex flex-col gap-4">
          {catalogosDatos ? (
            <FormularioGeneralRfq
              key={rfq.actualizadoEn}
              rfq={rfq}
              catalogos={catalogosDatos}
              onGuardado={() => void consulta.refetch()}
            />
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </div>
      )}

      {pestana === 'items' && (
        <TablaItemsRfq
          rfq={rfq}
          catalogos={catalogosDatos}
          onCambio={() => void consulta.refetch()}
        />
      )}

      {pestana === 'archivos' && <PanelArchivosRfq rfq={rfq} />}

      {pestana === 'propuestas' && (
        <EstadoVacio
          titulo="Propuestas (B4)"
          descripcion="La generación de propuestas y revisiones llega con el bloque B4; este RFQ quedará ligado a sus propuestas."
        />
      )}

      {pestana === 'actividad' && <ActividadRfq rfqId={rfq.id} />}
    </div>
  );
}
