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
import { formatearFecha, formatearHora, formatearMoneda } from '@/compartido/utilidades/formatear';

import type { PropuestaCostoMaterial } from '../tipos/materiales-costos';
import { formatearFechaDia } from '../utilidades/materiales-costos';

/**
 * Propuestas de costo pendientes (C6.1/DC-13): una compra o gasto propone y
 * solo la confirmación autorizada cambia el maestro.
 */
export function TablaPropuestasCosto({
  propuestas,
  puedeGestionar,
  confirmandoId,
  onConfirmar,
}: {
  propuestas: readonly PropuestaCostoMaterial[];
  puedeGestionar: boolean;
  confirmandoId: string | null;
  onConfirmar: (propuesta: PropuestaCostoMaterial) => void;
}) {
  if (propuestas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-borde px-4 py-6 text-center text-sm text-texto-secundario">
        Sin propuestas pendientes. Una compra o un gasto puede proponer el costo de un material.
      </p>
    );
  }

  return (
    <TablaContenedor>
      <Tabla>
        <TablaEncabezado>
          <tr>
            <TablaEncabezadoCelda>Material</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Costo propuesto</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Fecha efectiva</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Fuente</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Referencia</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Propuesta por</TablaEncabezadoCelda>
            <TablaEncabezadoCelda className="text-right">Acción</TablaEncabezadoCelda>
          </tr>
        </TablaEncabezado>
        <TablaCuerpo>
          {propuestas.map((propuesta) => (
            <TablaFila key={propuesta.id}>
              <TablaCelda>
                <span className="font-mono text-xs">{propuesta.materialCodigo}</span>
                <span className="block text-sm">{propuesta.materialNombre}</span>
              </TablaCelda>
              <TablaCelda className="tabular-nums">
                {formatearMoneda(propuesta.costoPropuesto, propuesta.moneda, 4)}
              </TablaCelda>
              <TablaCelda className="text-texto-secundario">
                {formatearFechaDia(propuesta.fechaEfectiva)}
              </TablaCelda>
              <TablaCelda>
                <Badge variante={propuesta.fuente === 'COMPRA' ? 'info' : 'neutro'}>
                  {propuesta.fuente === 'COMPRA' ? 'Compra' : 'Gasto'}
                </Badge>
              </TablaCelda>
              <TablaCelda className="text-texto-secundario">{propuesta.referencia}</TablaCelda>
              <TablaCelda className="text-texto-secundario">
                {propuesta.propuestoPorNombre}
                <span className="block text-xs text-texto-tenue">
                  {formatearFecha(propuesta.propuestoEn)} {formatearHora(propuesta.propuestoEn)}
                </span>
              </TablaCelda>
              <TablaCelda className="text-right">
                {puedeGestionar ? (
                  <Button
                    type="button"
                    tamano="sm"
                    disabled={confirmandoId === propuesta.id}
                    onClick={() => onConfirmar(propuesta)}
                  >
                    {confirmandoId === propuesta.id ? 'Confirmando…' : 'Confirmar'}
                  </Button>
                ) : (
                  <span className="text-xs text-texto-tenue">Solo lectura</span>
                )}
              </TablaCelda>
            </TablaFila>
          ))}
        </TablaCuerpo>
      </Tabla>
    </TablaContenedor>
  );
}
