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
import { formatearDimensionesMm, formatearFechaDia } from '../utilidades/materiales-costos';

/**
 * Catálogo canónico con costo vigente (C6.1) y jerarquía de grupos (obs. 8):
 * los subítems se muestran indentados bajo su material padre. Solo lectura
 * salvo las acciones, que se muestran si el actor puede gestionar.
 */
export function TablaMaterialesCostos({
  materiales,
  puedeGestionar,
  onEditar,
  onProponer,
  onCostoManual,
  onHistorial,
}: {
  materiales: readonly MaterialCosto[];
  puedeGestionar: boolean;
  onEditar: (material: MaterialCosto) => void;
  onProponer: (material: MaterialCosto) => void;
  onCostoManual: (material: MaterialCosto) => void;
  onHistorial: (material: MaterialCosto) => void;
}) {
  if (materiales.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-borde px-4 py-6 text-center text-sm text-texto-secundario">
        Sin materiales en el catálogo. Crea el primero con «Nuevo material».
      </p>
    );
  }

  const raices = materiales.filter((material) => material.padreId === null);
  const hijos = materiales.filter((material) => material.padreId !== null);
  const filas: { material: MaterialCosto; grupo: string | null; subitems: number }[] = [];
  for (const raiz of raices) {
    const subitems = hijos.filter((hijo) => hijo.padreId === raiz.id);
    filas.push({ material: raiz, grupo: null, subitems: subitems.length });
    for (const hijo of subitems) {
      filas.push({ material: hijo, grupo: raiz.nombre, subitems: 0 });
    }
  }

  return (
    <TablaContenedor>
      <Tabla>
        <TablaEncabezado>
          <tr>
            <TablaEncabezadoCelda>Código</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Nombre</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Unidad</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Ancho × largo</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Espesores</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Costo vigente</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Vigente desde</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Confirmó</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Pend.</TablaEncabezadoCelda>
            <TablaEncabezadoCelda className="text-right">Acciones</TablaEncabezadoCelda>
          </tr>
        </TablaEncabezado>
        <TablaCuerpo>
          {filas.map(({ material, grupo, subitems }) => (
            <TablaFila key={material.id} data-testid={`fila-material-${material.codigo}`}>
              <TablaCelda className="font-mono text-xs">{material.codigo}</TablaCelda>
              <TablaCelda>
                <span className="flex flex-wrap items-center gap-1.5">
                  {grupo && (
                    <span aria-hidden="true" className="text-texto-tenue">
                      ↳
                    </span>
                  )}
                  <span className="font-medium">{material.nombre}</span>
                  {subitems > 0 && (
                    <Badge variante="neutro">
                      Grupo · {subitems} subítem{subitems === 1 ? '' : 's'}
                    </Badge>
                  )}
                </span>
                {!material.activo && (
                  <span className="block text-xs text-texto-secundario">Inactivo</span>
                )}
                {grupo && (
                  <span className="block text-xs text-texto-tenue">Grupo: {grupo}</span>
                )}
              </TablaCelda>
              <TablaCelda className="text-texto-secundario">{material.unidadBase}</TablaCelda>
              <TablaCelda
                className="tabular-nums text-texto-secundario"
                data-testid={`dimensiones-material-${material.codigo}`}
              >
                {formatearDimensionesMm(material.anchoMm, material.largoMm)}
              </TablaCelda>
              <TablaCelda className="text-texto-secundario">
                {material.espesores.length === 0
                  ? '—'
                  : material.espesores
                      .map((espesor) => espesor.etiqueta + (espesor.activo ? '' : ' (inactivo)'))
                      .join(', ')}
              </TablaCelda>
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
                        aria-label={`Editar ${material.nombre}`}
                        onClick={() => onEditar(material)}
                      >
                        Editar
                      </Button>
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
