'use client';

import { useState } from 'react';
import Link from 'next/link';

import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Button } from '@/compartido/componentes/ui/button';
import { formatearFecha, formatearMoneda } from '@/compartido/utilidades/formatear';
import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';
import { usarCatalogosPropuesta, usarPropuesta } from '@/modulos/propuestas/hooks/usar-propuesta';
import type { PermisosPropuesta } from '@/modulos/propuestas/tipos/indice';
import { ETIQUETA_ESTADO_PROPIESTA } from '@/modulos/propuestas/utilidades/indice';
import { ActividadPropuesta } from './actividad-propuesta';
import { EditorItemsPropuesta } from './editor-items-propuesta';
import { PanelAccionesPropuesta } from './panel-acciones-propuesta';
import { PanelArchivosPropuesta } from './panel-archivos-propuesta';
import { PanelPdfsPropuesta } from './panel-pdfs-propuesta';
import { PanelRuteoCosteo } from './panel-ruteo-costeo';
import { PanelSeguimientoPropuesta } from './panel-seguimiento-propuesta';
import type { DetallePropuestaFicha } from '@/modulos/propuestas/acciones/obtener-propuesta';

const PESTANAS = [
  { clave: 'resumen', etiqueta: 'Resumen' },
  { clave: 'items', etiqueta: 'Ítems' },
  { clave: 'ruteo', etiqueta: 'Ruteo/Costeo' },
  { clave: 'archivos', etiqueta: 'Archivos' },
  { clave: 'pdfs', etiqueta: 'PDFs' },
  { clave: 'seguimiento', etiqueta: 'Seguimiento' },
  { clave: 'actividad', etiqueta: 'Actividad' },
] as const;

type Pestana = (typeof PESTANAS)[number]['clave'];

/**
 * SII-B4.11: ficha de propuesta con encabezado folio + chip, acciones de
 * negocio arriba, selector de revisiones y pestañas Resumen, Ítems,
 * Ruteo/Costeo, Archivos, PDFs, Seguimiento y Actividad.
 */
export function FichaPropuesta({
  propuestaId,
  permisos,
}: {
  propuestaId: string;
  permisos: PermisosPropuesta;
}) {
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [revisionActivaId, setRevisionActivaId] = useState<string | null>(null);
  const consulta = usarPropuesta(propuestaId);
  const catalogos = usarCatalogosPropuesta();

  const detalle: DetallePropuestaFicha | undefined = consulta.data?.exito
    ? consulta.data.datos
    : undefined;

  if (consulta.isLoading) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!consulta.data?.exito || !detalle) {
    const error = consulta.data && !consulta.data.exito ? consulta.data.error : 'La propuesta no existe';
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <p role="alert" className="text-sm text-peligro-texto">
          {error}
        </p>
        <Link href="/propuestas" className="text-sm font-semibold text-acento hover:underline">
          ← Cola de propuestas
        </Link>
      </div>
    );
  }

  const { propuesta, revisiones } = detalle;
  const revisionActiva =
    revisiones.find((revision) => revision.id === revisionActivaId)
    ?? revisiones.find((revision) => revision.id === propuesta.revisionVigenteId)
    ?? revisiones[revisiones.length - 1]
    ?? null;
  const catalogosDatos = (catalogos.data?.exito ? catalogos.data.datos : null) ?? null;
  const empresa = revisionActiva?.snapshotCabecera.empresa
    ?? revisionActiva?.snapshotCabecera.cliente?.razonSocial
    ?? 'Sin cliente';

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4" data-testid="ficha-propuesta">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/propuestas" className="text-xs font-semibold text-acento hover:underline">
            ← Cola de propuestas
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-bold">{propuesta.folioCnc}</h1>
            <BadgeEstado estado={propuesta.estado} etiqueta={ETIQUETA_ESTADO_PROPIESTA[propuesta.estado]} />
            {propuesta.acceptedRevisionId && (
              <span className="rounded-full bg-exito-suave px-2 py-0.5 text-xs font-medium text-exito-texto">
                Revisión aceptada
              </span>
            )}
          </div>
          <p className="text-sm text-texto-secundario">{empresa}</p>
        </div>
        <Button
          variante="contorno"
          tamano="sm"
          onClick={() => void consulta.refetch()}
        >
          Actualizar
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Revisiones de la propuesta">
        {revisiones.map((revision) => (
          <button
            key={revision.id}
            type="button"
            onClick={() => setRevisionActivaId(revision.id)}
            aria-pressed={revisionActiva?.id === revision.id}
            className={
              revisionActiva?.id === revision.id
                ? 'rounded-base border border-acento bg-acento/10 px-3 py-1 text-sm font-semibold text-acento'
                : 'rounded-base border border-borde px-3 py-1 text-sm text-texto-secundario hover:text-texto-primario'
            }
          >
            {revision.letra} · {ETIQUETA_ESTADO_PROPIESTA[revision.estado]}
            {propuesta.acceptedRevisionId === revision.id ? ' ✓' : ''}
          </button>
        ))}
      </div>

      {revisionActiva && (
        <PanelAccionesPropuesta detalle={detalle} revision={revisionActiva} permisos={permisos} />
      )}

      <div className="flex flex-wrap gap-1 border-b border-borde">
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

      {revisionActiva && (
        <>
          {pestana === 'resumen' && <ResumenPropuesta detalle={detalle} />}
          {pestana === 'items' && (
            <EditorItemsPropuesta
              revision={revisionActiva}
              items={detalle.items}
              ruteo={detalle.ruteo}
              costos={detalle.costos}
              permisos={permisos}
            />
          )}
          {pestana === 'ruteo' && (
            <PanelRuteoCosteo
              revision={revisionActiva}
              items={detalle.items}
              ruteo={detalle.ruteo}
              costos={detalle.costos}
              catalogos={catalogosDatos}
              permisos={permisos}
            />
          )}
          {pestana === 'archivos' && (
            <PanelArchivosPropuesta
              revision={revisionActiva}
              archivosPropios={detalle.archivosPropios}
              archivosHeredados={detalle.archivosHeredados}
              archivosPorItem={detalle.archivosPorItem}
              items={detalle.items}
              puedeSubir={permisos.editarArticulo}
            />
          )}
          {pestana === 'pdfs' && (
            <PanelPdfsPropuesta revision={revisionActiva} pdfs={revisionActiva.pdfs} />
          )}
          {pestana === 'seguimiento' && (
            <PanelSeguimientoPropuesta
              revision={revisionActiva}
              acciones={detalle.acciones}
              catalogos={catalogosDatos}
              permisos={permisos}
            />
          )}
          {pestana === 'actividad' && (
            <ActividadPropuesta revision={revisionActiva} eventos={detalle.eventos} />
          )}
        </>
      )}
    </div>
  );
}

function ResumenPropuesta({ detalle }: { detalle: DetallePropuestaFicha }) {
  const { propuesta, revisiones } = detalle;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-borde p-4 text-sm sm:grid-cols-4">
        <Dato etiqueta="Folio" valor={propuesta.folioCnc} />
        <Dato etiqueta="Estado" valor={ETIQUETA_ESTADO_PROPIESTA[propuesta.estado]} />
        <Dato
          etiqueta="Revisión aceptada"
          valor={
            propuesta.acceptedRevisionId
              ? (revisiones.find((revision) => revision.id === propuesta.acceptedRevisionId)?.letra ?? '—')
              : '—'
          }
        />
        <Dato etiqueta="Creada" valor={formatearFecha(propuesta.creadoEn)} />
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" data-testid="tabla-revisiones-propuesta">
          <thead>
            <tr className="border-b border-borde text-left text-xs text-texto-secundario">
              <th className="px-2 py-2">Revisión</th>
              <th className="px-2 py-2">Estado</th>
              <th className="px-2 py-2">Motivo</th>
              <th className="px-2 py-2 text-right">Subtotal</th>
              <th className="px-2 py-2 text-right">Total</th>
              <th className="px-2 py-2 text-right">Margen</th>
              <th className="px-2 py-2">Validada</th>
            </tr>
          </thead>
          <tbody>
            {revisiones.map((revision) => (
              <tr key={revision.id} className="border-b border-borde/60">
                <td className="px-2 py-2 font-mono text-xs">{revision.folioRevision}</td>
                <td className="px-2 py-2">{ETIQUETA_ESTADO_PROPIESTA[revision.estado]}</td>
                <td className="px-2 py-2 text-xs text-texto-secundario">
                  {revision.motivoCreacion ?? '—'}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatearMoneda(revision.totales.subtotal, revision.totales.moneda)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatearMoneda(revision.totales.total, revision.totales.moneda)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {revision.totales.margen === null
                    ? '—'
                    : `${(revision.totales.margen * 100).toFixed(2)}%`}
                </td>
                <td className="px-2 py-2 text-xs text-texto-secundario">
                  {revision.validadaEn ? formatearFecha(revision.validadaEn) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-texto-secundario">{etiqueta}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}
