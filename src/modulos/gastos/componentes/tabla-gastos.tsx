'use client';

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
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';
import { Button } from '@/compartido/componentes/ui/button';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import type { EstadoGasto, Gasto } from '@/modulos/gastos/tipos/indice';

export interface TablaGastosProps {
  gastos: readonly Gasto[];
  cargando?: boolean;
  onCambiarEstado: (gasto: Gasto, estado: EstadoGasto) => void;
  onVerRentabilidad: (ordenId: string) => void;
}

export function TablaGastos({ gastos, cargando = false, onCambiarEstado, onVerRentabilidad }: TablaGastosProps) {
  if (cargando) {
    return <SkeletonTabla columnas={9} filas={5} />;
  }

  if (gastos.length === 0) {
    return (
      <EstadoVacio
        titulo="Sin gastos registrados"
        descripcion="No hay gastos que coincidan con los filtros actuales."
      />
    );
  }

  return (
    <TablaContenedor>
      <Tabla className="min-w-[980px]">
        <caption className="sr-only">Gastos registrados</caption>
        <TablaEncabezado>
          <tr>
            <TablaEncabezadoCelda>Folio</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Descripción</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Categoría</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Proveedor</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Orden vinculada</TablaEncabezadoCelda>
            <TablaEncabezadoCelda className="text-right">Total</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Fecha</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Estado</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>
              <span className="sr-only">Acciones</span>
            </TablaEncabezadoCelda>
          </tr>
        </TablaEncabezado>
        <TablaCuerpo>
          {gastos.map((gasto) => (
            <TablaFila key={gasto.id}>
              <TablaCelda className="font-mono text-xs font-medium">{gasto.folio}</TablaCelda>
              <TablaCelda>{gasto.descripcion}</TablaCelda>
              <TablaCelda>{gasto.categoria}</TablaCelda>
              <TablaCelda className="font-mono text-xs">{gasto.proveedorId ?? '—'}</TablaCelda>
              <TablaCelda className="font-mono text-xs">
                {gasto.ordenFolio
                  ?? (gasto.ordenId ? `${gasto.ordenId.slice(0, 8)}…` : 'Indirecto')}
              </TablaCelda>
              <TablaCelda className="text-right tabular-nums">{formatearMoneda(gasto.montoTotal, gasto.moneda)}</TablaCelda>
              <TablaCelda>{gasto.fechaGasto}</TablaCelda>
              <TablaCelda>
                <BadgeEstado estado={gasto.estadoPago} />
              </TablaCelda>
              <TablaCelda className="flex justify-end gap-2">
                {gasto.ordenId ? (
                  <Button tamano="sm" variante="contorno" onClick={() => onVerRentabilidad(gasto.ordenId as string)}>
                    Rentabilidad
                  </Button>
                ) : null}
                {gasto.estadoPago === 'pendiente' ? (
                  <>
                    <Button tamano="sm" variante="contorno" onClick={() => onCambiarEstado(gasto, 'pagado')}>Marcar pagado</Button>
                    <Button tamano="sm" variante="contorno" onClick={() => onCambiarEstado(gasto, 'cancelado')}>Cancelar</Button>
                  </>
                ) : null}
              </TablaCelda>
            </TablaFila>
          ))}
        </TablaCuerpo>
      </Tabla>
    </TablaContenedor>
  );
}
