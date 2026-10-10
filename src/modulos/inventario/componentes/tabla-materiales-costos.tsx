'use client';

import { Badge } from '@/compartido/componentes/ui/badge';
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
import { formatearMoneda } from '@/compartido/utilidades/formatear';

import type { MaterialCosto } from '../tipos/materiales-costos';
import { formatearFechaDia } from '../utilidades/materiales-costos';

/**
 * Catálogo canónico con costo vigente (C6.1). Solo lectura salvo las acciones
 * de costo, que se muestran si el actor puede gestionar materiales.
 */
export function TablaMaterialesCostos({
  materiales,
  puedeGestionar,
  onProponer,
  onCostoManual,
  onHistorial,
}: {
  materiales: readonly MaterialCosto[];
  puedeGestionar: boolean;
  onProponer: (material: MaterialCosto) => void;
  onCostoManual: (material: MaterialCosto) => void;
  onHistorial: (material: MaterialCosto) => void;
}) {
  if (materiales.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-borde px-4 py-6 text-center text-sm text-texto-secundario">
        Sin materiales en el catálogo. Los materiales se administran desde Configuración.
      </p>
    );
  }

  return (
    <TablaContenedor>
      <Tabla>
        <TablaEncabezado>
          <tr>
            <TablaEncabezadoCelda>Código</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Nombre</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Unidad</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Costo vigente</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Vigente desde</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Confirmó</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Pend.</TablaEncabezadoCelda>
            <TablaEncabezadoCelda className="text-right">Acciones</TablaEncabezadoCelda>
          </tr>
        </TablaEncabezado>
        <TablaCuerpo>
          {materiales.map((material) => (
            <TablaFila key={material.id}>
              <TablaCelda className="font-mono text-xs">{material.codigo}</TablaCelda>
              <TablaCelda>
                <span className="font-medium">{material.nombre}</span>
                {!material.activo && (
                  <span className="block text-xs text-texto-secundario">Inactivo</span>
                )}
              </TablaCelda>
              <TablaCelda className="text-texto-secundario">{material.unidadBase}</TablaCelda>
              <TablaCelda className="tabular-nums">
                {material.costoVigente === null ? (
                  <span className="text-texto-tenue">Sin costo</span>
                ) : (
                  formatearMoneda(material.costoVigente, material.monedaCosto, 4)
                )}
              </TablaCelda>
              <TablaCelda className="text-texto-secundario">
                {formatearFechaDia(material.fechaVigenciaCosto)}
              </TablaCelda>
              <TablaCelda className="text-texto-secundario">
                {material.costoConfirmadoPorNombre ?? '—'}
              </TablaCelda>
              <TablaCelda>
                {material.propuestasPendientes > 0 ? (
                  <Badge variante="alerta">{material.propuestasPendientes}</Badge>
                ) : (
                  <span className="text-xs text-texto-tenue">—</span>
                )}
              </TablaCelda>
              <TablaCelda className="text-right">
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variante="fantasma"
                    tamano="sm"
                    onClick={() => onHistorial(material)}
                  >
                    Historial
                  </Button>
                  {puedeGestionar && (
                    <>
                      <Button
                        type="button"
                        variante="contorno"
                        tamano="sm"
                        onClick={() => onCostoManual(material)}
                      >
                        Costo manual
                      </Button>
                      <Button type="button" tamano="sm" onClick={() => onProponer(material)}>
                        Proponer
                      </Button>
                    </>
                  )}
                </div>
              </TablaCelda>
            </TablaFila>
          ))}
        </TablaCuerpo>
      </Tabla>
    </TablaContenedor>
  );
}
