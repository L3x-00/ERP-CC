'use client';

import { Button } from '@/compartido/componentes/ui/button';
import {
  Tabla,
  TablaCelda,
  TablaContenedor,
  TablaCuerpo,
  TablaEncabezado,
  TablaEncabezadoCelda,
  TablaFila,
} from '@/compartido/componentes/diseno/tabla';
import { formatearFecha, formatearHora, formatearMoneda } from '@/compartido/utilidades/formatear';

import type { VersionCostoMaterial } from '../tipos/materiales-costos';
import { etiquetaFuenteCosto, formatearFechaDia } from '../utilidades/materiales-costos';

/**
 * Historial append-only de costos confirmados (C6.1): anterior → nuevo, fuente,
 * referencia, actor y fecha. Nunca se edita ni se borra.
 */
export function TablaHistorialCostos({
  versiones,
  materialFiltro,
  onQuitarFiltro,
}: {
  versiones: readonly VersionCostoMaterial[];
  materialFiltro: { codigo: string; nombre: string } | null;
  onQuitarFiltro: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {materialFiltro && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borde bg-superficie-2 px-3 py-2">
          <span className="text-sm text-texto-secundario">
            Historial de{' '}
            <span className="font-mono text-xs font-semibold">{materialFiltro.codigo}</span>{' '}
            {materialFiltro.nombre}
          </span>
          <Button type="button" variante="fantasma" tamano="sm" onClick={onQuitarFiltro}>
            Ver todo el historial
          </Button>
        </div>
      )}

      {versiones.length === 0 ? (
        <p className="rounded-lg border border-dashed border-borde px-4 py-6 text-center text-sm text-texto-secundario">
          {materialFiltro
            ? 'Este material no tiene costos confirmados todavía.'
            : 'Sin costos confirmados en el historial.'}
        </p>
      ) : (
        <TablaContenedor>
          <Tabla>
            <TablaEncabezado>
              <tr>
                <TablaEncabezadoCelda>Material</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Cambio</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Fecha efectiva</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Fuente</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Referencia</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Confirmó</TablaEncabezadoCelda>
              </tr>
            </TablaEncabezado>
            <TablaCuerpo>
              {versiones.map((version) => (
                <TablaFila key={version.id}>
                  <TablaCelda>
                    <span className="font-mono text-xs">{version.materialCodigo}</span>
                    <span className="block text-sm">{version.materialNombre}</span>
                  </TablaCelda>
                  <TablaCelda className="tabular-nums">
                    {version.costoAnterior === null ? (
                      <span className="text-texto-secundario">Sin costo anterior → </span>
                    ) : (
                      <span className="text-texto-secundario">
                        {formatearMoneda(
                          version.costoAnterior,
                          version.monedaAnterior ?? 'MXN',
                          4,
                        )}{' '}
                        →{' '}
                      </span>
                    )}
                    <span className="font-medium">
                      {formatearMoneda(version.costoNuevo, version.monedaNueva, 4)}
                    </span>
                  </TablaCelda>
                  <TablaCelda className="text-texto-secundario">
                    {formatearFechaDia(version.fechaEfectiva)}
                  </TablaCelda>
                  <TablaCelda className="text-texto-secundario">
                    {etiquetaFuenteCosto(version.fuente)}
                  </TablaCelda>
                  <TablaCelda className="text-texto-secundario">
                    {version.referencia ?? '—'}
                  </TablaCelda>
                  <TablaCelda className="text-texto-secundario">
                    {version.actorNombre}
                    <span className="block text-xs text-texto-tenue">
                      {formatearFecha(version.confirmadoEn)} {formatearHora(version.confirmadoEn)}
                    </span>
                  </TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        </TablaContenedor>
      )}
    </div>
  );
}
