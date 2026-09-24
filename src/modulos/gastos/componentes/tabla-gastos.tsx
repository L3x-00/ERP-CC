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
  onEditar: (gasto: Gasto) => void;
  onVerComprobante: (gasto: Gasto) => void;
}

export function TablaGastos({ gastos, cargando = false, onCambiarEstado, onVerRentabilidad, onEditar, onVerComprobante }: TablaGastosProps) {
  if (cargando) {
    return <SkeletonTabla columnas={10} filas={5} />;
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
    <div>
      <p className="mb-2 text-xs text-texto-secundario">Desliza la tabla para ver todas las columnas y acciones.</p>
    <TablaContenedor>
      <Tabla className="min-w-[1100px]">
        <caption className="sr-only">Gastos registrados</caption>
        <TablaEncabezado>
          <tr>
            <TablaEncabezadoCelda>Folio</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Descripción</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Categoría</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Tipo</TablaEncabezadoCelda>
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
              <TablaCelda>{gasto.tipoGasto === 'fijo' ? 'Fijo' : gasto.tipoGasto === 'variable' ? 'Variable' : 'Sin clasificar'}</TablaCelda>
              <TablaCelda>{gasto.proveedorNombre ?? (gasto.proveedorId ? 'Proveedor no disponible' : '—')}</TablaCelda>
              <TablaCelda className="font-mono text-xs">
                {gasto.ordenFolio
                  ?? (gasto.ordenId ? `${gasto.ordenId.slice(0, 8)}…` : 'Indirecto')}
              </TablaCelda>
              <TablaCelda className="text-right tabular-nums">{formatearMoneda(gasto.montoTotal, gasto.moneda)}</TablaCelda>
              <TablaCelda className="whitespace-nowrap">{gasto.fechaGasto.slice(0, 10)}</TablaCelda>
              <TablaCelda>
                <BadgeEstado estado={gasto.estadoPago} />
              </TablaCelda>
              <TablaCelda className="flex justify-end gap-2">
                {gasto.comprobanteRuta || gasto.comprobanteUrl ? (
                  <Button tamano="sm" variante="contorno" onClick={() => onVerComprobante(gasto)}>
                    Comprobante
                  </Button>
                ) : null}
                {gasto.ordenId ? (
                  <Button tamano="sm" variante="contorno" onClick={() => onVerRentabilidad(gasto.ordenId as string)}>
                    Rentabilidad
                  </Button>
                ) : null}
                {gasto.estadoPago === 'pendiente' ? (
                  <>
                    <Button tamano="sm" variante="contorno" onClick={() => onEditar(gasto)}>Editar</Button>
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
    </div>
  );
}
