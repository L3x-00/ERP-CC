'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import {
  Tabla,
  TablaCelda,
  TablaContenedor,
  TablaCuerpo,
  TablaEncabezado,
  TablaEncabezadoCelda,
  TablaFila,
} from '@/compartido/componentes/diseno/tabla';
import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { formatearFecha, formatearHora, formatearNumero } from '@/compartido/utilidades/formatear';
import { obtenerCatalogosRfqAccion, type CatalogosRfq } from '../acciones/obtener-catalogos';
import { obtenerVersionesRfqAccion } from '../acciones/obtener-versiones-rfq';
import { etiquetaCausaVersion, type VersionRfq } from '../tipos/indice';
import { ETIQUETAS_ESTADO_RFQ } from '../utilidades/estados';

const SIN_VALOR = '—';

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-texto-secundario">{etiqueta}</span>
      <span className="text-sm text-texto-primario">{valor || SIN_VALOR}</span>
    </div>
  );
}

function nombreCanal(version: VersionRfq, catalogos: CatalogosRfq | null): string {
  const canal = version.cabecera.canal;
  if (!canal) return SIN_VALOR;
  const opcion = catalogos?.canales.find(
    (catalogo) =>
      catalogo.codigo.localeCompare(canal, 'es', { sensitivity: 'base' }) === 0 ||
      catalogo.nombre.localeCompare(canal, 'es', { sensitivity: 'base' }) === 0,
  );
  const nombre = opcion?.nombre ?? canal;
  return opcion?.esOtro && version.cabecera.canalDetalle
    ? `${nombre}: ${version.cabecera.canalDetalle}`
    : nombre;
}

/** Detalle de solo lectura de cómo estaba el RFQ al registrar la versión. */
function DetalleVersionRfq({
  version,
  catalogos,
  onVolver,
}: {
  version: VersionRfq;
  catalogos: CatalogosRfq | null;
  onVolver: () => void;
}) {
  const nombreMaterial = new Map((catalogos?.materiales ?? []).map((m) => [m.id, m.nombre]));
  const nombreEspesor = new Map((catalogos?.espesores ?? []).map((e) => [e.id, e.etiqueta]));
  const nombreProceso = new Map((catalogos?.procesos ?? []).map((p) => [p.id, p.nombre]));

  return (
    <div className="flex flex-col gap-4" data-testid="historial-version-detalle">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-mono text-base font-bold">v{version.numero}</h3>
          <Badge variante={version.causa === 'CREAR_REV_A' ? 'exito' : 'neutro'}>
            {etiquetaCausaVersion(version.causa)}
          </Badge>
        </div>
        <span className="text-xs text-texto-secundario">
          {version.actorNombre ?? 'Usuario del sistema'} · {formatearFecha(version.creadoEn)}{' '}
          {formatearHora(version.creadoEn)}
        </span>
      </div>

      <p className="rounded-md bg-superficie-2 px-3 py-2 text-sm text-texto-secundario">
        Vista de solo lectura: así estaba el RFQ al registrar esta versión.
      </p>

      <section aria-label="Datos generales de la versión" className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Folio" valor={version.cabecera.folio ?? ''} />
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-texto-secundario">Estado</span>
          <span>
            <BadgeEstado
              estado={version.cabecera.estadoRfq}
              etiqueta={ETIQUETAS_ESTADO_RFQ[version.cabecera.estadoRfq]}
            />
          </span>
        </div>
        <Campo etiqueta="Empresa" valor={version.cabecera.empresa ?? ''} />
        <Campo etiqueta="Contacto" valor={version.cabecera.nombreContacto ?? ''} />
        <Campo etiqueta="Canal" valor={nombreCanal(version, catalogos)} />
        <Campo etiqueta="Fecha de solicitud" valor={version.cabecera.fechaSolicitud ?? ''} />
        <div className="flex flex-col gap-0.5 sm:col-span-2">
          <span className="text-xs font-medium text-texto-secundario">Descripción general</span>
          <span className="whitespace-pre-wrap text-sm text-texto-primario">
            {version.cabecera.descripcionGeneral || SIN_VALOR}
          </span>
        </div>
      </section>

      <section aria-label="Ítems de la versión" className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold text-texto-primario">
          Ítems ({version.items.length})
        </h4>
        {version.items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-borde px-4 py-4 text-center text-sm text-texto-secundario">
            Sin ítems en esta versión.
          </p>
        ) : (
          <TablaContenedor>
            <Tabla>
              <TablaEncabezado>
                <tr>
                  <TablaEncabezadoCelda>Código</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Descripción</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda className="text-right">Cantidad</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Material / espesor</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Operaciones</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Estado</TablaEncabezadoCelda>
                </tr>
              </TablaEncabezado>
              <TablaCuerpo>
                {version.items.map((item) => (
                  <TablaFila key={item.id}>
                    <TablaCelda className="font-mono text-xs">{item.codigo}</TablaCelda>
                    <TablaCelda>
                      <span className="font-medium">{item.descripcion}</span>
                      {item.acabado && (
                        <span className="block text-xs text-texto-secundario">
                          Acabado: {item.acabado}
                        </span>
                      )}
                    </TablaCelda>
                    <TablaCelda className="text-right tabular-nums">
                      {formatearNumero(item.cantidad, 2)}
                    </TablaCelda>
                    <TablaCelda className="text-texto-secundario">
                      {item.materialId ? (nombreMaterial.get(item.materialId) ?? 'Material') : SIN_VALOR}
                      {item.espesorId ? ` · ${nombreEspesor.get(item.espesorId) ?? ''}` : ''}
                    </TablaCelda>
                    <TablaCelda className="text-texto-secundario">
                      {item.operaciones.length > 0
                        ? item.operaciones
                            .map((operacion) => nombreProceso.get(operacion.procesoId) ?? 'Proceso')
                            .join(', ')
                        : SIN_VALOR}
                    </TablaCelda>
                    <TablaCelda>
                      {item.estado === 'cancelado' ? (
                        <span className="rounded-full bg-superficie-2 px-2.5 py-0.5 text-xs text-texto-secundario">
                          Cancelado
                        </span>
                      ) : (
                        <span className="rounded-full bg-exito-suave px-2.5 py-0.5 text-xs text-exito-texto">
                          Activo
                        </span>
                      )}
                    </TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
          </TablaContenedor>
        )}
      </section>

      <div className="flex justify-end">
        <Button type="button" variante="contorno" tamano="sm" onClick={onVolver}>
          Volver a las versiones
        </Button>
      </div>
    </div>
  );
}

/**
 * Historial de versiones del RFQ (solo lectura): lista las versiones registradas
 * y al elegir una muestra cómo estaba el RFQ en ese momento, en el mismo modal.
 */
export function DialogoHistorialRfq({
  rfqId,
  abierto,
  onCambioApertura,
}: {
  rfqId: string | null;
  abierto: boolean;
  onCambioApertura: (abierto: boolean) => void;
}) {
  const [versionSeleccionada, setVersionSeleccionada] = useState<VersionRfq | null>(null);

  const versiones = useQuery({
    queryKey: ['rfq-versiones', rfqId ?? ''],
    queryFn: () => obtenerVersionesRfqAccion({ rfqId: rfqId ?? '' }),
    enabled: abierto && rfqId !== null,
  });
  const catalogos = useQuery({
    queryKey: ['rfq-catalogos'],
    queryFn: () => obtenerCatalogosRfqAccion(),
    staleTime: 60_000,
    enabled: abierto,
  });

  const catalogosDatos = catalogos.data?.exito ? (catalogos.data.datos ?? null) : null;
  const filas = versiones.data?.exito ? (versiones.data.datos ?? []) : [];
  const error = versiones.isError
    ? 'No se pudo cargar el historial del RFQ'
    : versiones.data && !versiones.data.exito
      ? versiones.data.error
      : null;

  return (
    <Dialog
      open={abierto}
      onOpenChange={(valor) => {
        if (!valor) setVersionSeleccionada(null);
        onCambioApertura(valor);
      }}
    >
      <DialogContent className="max-w-[760px]" aria-label="Historial del RFQ">
        <DialogHeader>
          <DialogTitle>Historial del RFQ</DialogTitle>
          <DialogDescription>
            Cada guardado de datos o de ítems crea una versión. Las versiones son solo lectura; el
            RFQ vigente se sigue editando en su ficha.
          </DialogDescription>
        </DialogHeader>

        {versionSeleccionada !== null ? (
          <DetalleVersionRfq
            version={versionSeleccionada}
            catalogos={catalogosDatos}
            onVolver={() => setVersionSeleccionada(null)}
          />
        ) : (
          <div className="flex flex-col gap-3" data-testid="historial-versiones">
            {versiones.isLoading && (
              <p className="text-sm text-texto-secundario">Cargando versiones…</p>
            )}

            {error !== null && !versiones.isLoading && (
              <div className="flex flex-col gap-2">
                <p role="alert" className="text-sm text-peligro-texto">
                  {error}
                </p>
                <Button
                  type="button"
                  variante="contorno"
                  tamano="sm"
                  className="self-start"
                  onClick={() => void versiones.refetch()}
                >
                  Reintentar
                </Button>
              </div>
            )}

            {!versiones.isLoading && error === null && filas.length === 0 && (
              <p className="rounded-lg border border-dashed border-borde px-4 py-6 text-center text-sm text-texto-secundario">
                Sin versiones registradas. Cada guardado del resumen o de los ítems crea la
                primera.
              </p>
            )}

            {filas.length > 0 && (
              <ol className="flex flex-col gap-2">
                {filas.map((version) => (
                  <li key={version.id}>
                    <button
                      type="button"
                      onClick={() => setVersionSeleccionada(version)}
                      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-borde bg-superficie px-3 py-2 text-left hover:bg-superficie-2"
                      aria-label={`Ver versión ${version.numero} (${etiquetaCausaVersion(version.causa)})`}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">v{version.numero}</span>
                        <Badge variante={version.causa === 'CREAR_REV_A' ? 'exito' : 'neutro'}>
                          {etiquetaCausaVersion(version.causa)}
                        </Badge>
                      </span>
                      <span className="text-xs text-texto-secundario">
                        {version.actorNombre ?? 'Usuario del sistema'} ·{' '}
                        {formatearFecha(version.creadoEn)} {formatearHora(version.creadoEn)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
