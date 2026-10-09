'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';
import { Button } from '@/compartido/componentes/ui/button';
import { GestorClienteOportunidad } from '@/modulos/pipeline/componentes/gestor-cliente-oportunidad';
import { ETIQUETAS_ESTADO_RFQ } from '@/modulos/rfq/utilidades/estados';
import type { Rfq } from '@/modulos/rfq/tipos/indice';
import {
  pasoSugeridoCaptura,
  pasosConFaltantesCaptura,
  pestanaPorPasoCaptura,
} from '@/modulos/rfq/utilidades/pasos-captura';

import { obtenerRfqAccion } from '../acciones/obtener-rfq';
import { obtenerCatalogosRfqAccion } from '../acciones/obtener-catalogos';
import { validarRfqListoAccion } from '../acciones/validar-rfq-listo';
import { ListaPropuestasRfq } from '@/modulos/propuestas/componentes/lista-propuestas-rfq';
import { ActividadRfq } from './actividad-rfq';
import { DialogoHistorialRfq } from './dialogo-historial-rfq';
import { FormularioGeneralRfq } from './formulario-general-rfq';
import {
  NavegacionCapturaRfq,
  type PasoCapturaRfq,
} from './navegacion-captura-rfq';
import { PanelAccionesRfq } from './panel-acciones-rfq';
import { PanelArchivosRfq } from './panel-archivos-rfq';
import { PanelRevisionRfq } from './panel-revision-rfq';
import { ResumenRfq } from './resumen-rfq';
import { TablaItemsRfq } from './tabla-items-rfq';

const PESTANAS = [
  { clave: 'resumen', etiqueta: 'Resumen' },
  { clave: 'items', etiqueta: 'Ítems' },
  { clave: 'archivos', etiqueta: 'Archivos' },
  { clave: 'revisar', etiqueta: 'Revisar' },
  { clave: 'propuestas', etiqueta: 'Propuestas' },
  { clave: 'actividad', etiqueta: 'Actividad' },
] as const;

type PestanaRfq = (typeof PESTANAS)[number]['clave'];

/**
 * Ficha RFQ (plan §3.8): encabezado folio + estado, acciones de negocio arriba
 * y pestañas Resumen, Ítems, Archivos, Propuestas (placeholder B4) y Actividad.
 */
export function FichaRfq({ rfqId, continuar = false }: { rfqId: string; continuar?: boolean }) {
  const [pestana, setPestana] = useState<PestanaRfq>('resumen');
  const [pasoCaptura, setPasoCaptura] = useState<PasoCapturaRfq>('solicitud');
  const [editandoResumen, setEditandoResumen] = useState(false);
  const [resumenGuardado, setResumenGuardado] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const continuidadAplicada = useRef(false);

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
  const capturaIncompleta = rfq?.estadoRfq === 'INCOMPLETE';
  const validacion = useQuery({
    queryKey: ['rfq-validacion-listo', rfqId],
    queryFn: () => validarRfqListoAccion({ rfqId }),
    enabled: capturaIncompleta,
  });
  const catalogosDatos = catalogos.data?.exito ? (catalogos.data.datos ?? null) : null;
  const validacionDatos = validacion.data?.exito ? (validacion.data.datos ?? null) : null;
  const errorValidacion = validacion.isError
    ? 'No se pudo revisar el avance del RFQ'
    : validacion.data && !validacion.data.exito
      ? validacion.data.error
      : null;
  const error = consulta.isError
    ? 'No se pudo cargar el RFQ'
    : consulta.data && !consulta.data.exito
      ? consulta.data.error
      : null;

  useEffect(() => {
    if (!continuar || continuidadAplicada.current || !validacionDatos) return;
    const sugerido = pasoSugeridoCaptura(validacionDatos);
    continuidadAplicada.current = true;
    setPasoCaptura(sugerido);
    setPestana(pestanaPorPasoCaptura(sugerido));
    setEditandoResumen(sugerido === 'solicitud');
  }, [continuar, validacionDatos]);

  function seleccionarPasoCaptura(paso: PasoCapturaRfq): void {
    // Navegar a mano cancela el salto de "Continuar captura" si la validación aún no llega.
    continuidadAplicada.current = true;
    setPasoCaptura(paso);
    setPestana(pestanaPorPasoCaptura(paso));
    setEditandoResumen(paso === 'solicitud');
    setResumenGuardado(false);
    if (paso === 'revisar') void validacion.refetch();
  }

  function refrescarCaptura(): void {
    void consulta.refetch();
    if (capturaIncompleta) void validacion.refetch();
  }

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
        <div className="flex flex-wrap items-center gap-2">
          {rfq.estadoRfq !== 'CONVERTED' && (
            <Button variante="contorno" tamano="sm" onClick={() => setHistorialAbierto(true)}>
              Historial
            </Button>
          )}
          <Button variante="contorno" tamano="sm" onClick={() => void consulta.refetch()}>
            Actualizar
          </Button>
        </div>
      </div>

      {capturaIncompleta && (
        <NavegacionCapturaRfq
          pasoActual={pasoCaptura}
          pasosConFaltantes={validacionDatos ? pasosConFaltantesCaptura(validacionDatos) : []}
          onSeleccionar={seleccionarPasoCaptura}
        />
      )}

      <PanelAccionesRfq rfq={rfq} catalogos={catalogosDatos} onCambio={() => void consulta.refetch()} />

      <div role="tablist" aria-label="Secciones del RFQ" className="flex flex-wrap gap-1 border-b border-borde">
        {PESTANAS.filter((opcion) => opcion.clave !== 'revisar' || capturaIncompleta).map((opcion) => (
          <button
            key={opcion.clave}
            type="button"
            role="tab"
            aria-selected={pestana === opcion.clave}
            onClick={() => {
              continuidadAplicada.current = true;
              setPestana(opcion.clave);
              if (opcion.clave === 'resumen') setPasoCaptura('solicitud');
              if (opcion.clave === 'items' || opcion.clave === 'archivos' || opcion.clave === 'revisar') {
                setPasoCaptura(opcion.clave);
              }
              if (opcion.clave === 'revisar') void validacion.refetch();
            }}
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
          {capturaIncompleta && pasoCaptura === 'cliente' ? (
            <section className="grid gap-3 rounded-lg border border-borde bg-superficie p-4" aria-label="Cliente del RFQ">
              <div>
                <h2 className="text-base font-semibold text-texto-primario">Cliente</h2>
                <p className="text-sm text-texto-secundario">
                  Liga un cliente y contacto vigentes para completar la solicitud.
                </p>
              </div>
              <GestorClienteOportunidad
                oportunidadId={rfq.id}
                clienteId={rfq.clienteId}
                condicionesPago={rfq.condicionesPago}
                onCambio={refrescarCaptura}
              />
            </section>
          ) : editandoResumen ? (
            <>
              <div className="flex justify-end">
                <Button
                  variante="contorno"
                  tamano="sm"
                  onClick={() => setEditandoResumen(false)}
                >
                  Cancelar edición
                </Button>
              </div>
              {catalogosDatos ? (
                <FormularioGeneralRfq
                  key={rfq.actualizadoEn}
                  rfq={rfq}
                  catalogos={catalogosDatos}
                  onGuardado={() => {
                    setResumenGuardado(true);
                    setEditandoResumen(false);
                    refrescarCaptura();
                  }}
                />
              ) : (
                <Skeleton className="h-64 w-full" />
              )}
            </>
          ) : (
            <>
              {resumenGuardado && (
                <p
                  role="status"
                  aria-live="polite"
                  className="rounded-md bg-exito-suave px-3 py-2 text-sm font-medium text-exito-texto"
                >
                  Datos guardados.
                </p>
              )}
              <ResumenRfq
                rfq={rfq}
                catalogos={catalogosDatos}
                onEditar={() => {
                  setResumenGuardado(false);
                  setEditandoResumen(true);
                }}
              />
            </>
          )}
        </div>
      )}

      {pestana === 'items' && (
        <TablaItemsRfq
          rfq={rfq}
          catalogos={catalogosDatos}
          onCambio={refrescarCaptura}
        />
      )}

      {pestana === 'archivos' && <PanelArchivosRfq rfq={rfq} onCambio={() => void validacion.refetch()} />}

      {pestana === 'revisar' && capturaIncompleta && (
        <PanelRevisionRfq
          rfq={rfq}
          catalogos={catalogosDatos}
          validacion={validacionDatos}
          validando={validacion.isLoading || validacion.isFetching}
          error={errorValidacion}
          onRevalidar={() => void validacion.refetch()}
          onEditarResumen={() =>
            seleccionarPasoCaptura(
              validacionDatos?.secciones.cliente.length ? 'cliente' : 'solicitud',
            )
          }
          onIrAItems={() => seleccionarPasoCaptura('items')}
          onIrAArchivos={() => seleccionarPasoCaptura('archivos')}
        />
      )}

      {pestana === 'propuestas' && (
        <ListaPropuestasRfq rfqId={rfq.id} estadoRfq={rfq.estadoRfq} />
      )}

      {pestana === 'actividad' && <ActividadRfq rfqId={rfq.id} />}

      {historialAbierto && (
        <DialogoHistorialRfq rfqId={rfq.id} abierto onCambioApertura={setHistorialAbierto} />
      )}
    </div>
  );
}
