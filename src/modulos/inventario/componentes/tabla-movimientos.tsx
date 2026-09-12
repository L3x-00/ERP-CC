'use client';

import { usarMovimientosInventario } from '@/modulos/inventario/hooks/usar-movimientos-inventario';
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
import { Badge } from '@/compartido/componentes/ui/badge';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { ETIQUETA_TIPO_MOVIMIENTO } from '@/modulos/inventario/utilidades/indice';
import type { TipoMovimiento } from '@/modulos/inventario/tipos/inventario';

/** Variante de badge según el tipo de movimiento (entradas suman, salidas restan). */
function varianteTipo(tipo: TipoMovimiento): 'exito' | 'alerta' | 'info' {
  if (tipo === 'entrada_compra' || tipo === 'devolucion') return 'exito';
  if (tipo === 'salida_produccion') return 'alerta';
  return 'info';
}

/** Color semántico de la cantidad: positivas suman, negativas restan. */
function claseCantidad(valor: number): string {
  if (valor > 0) return 'text-exito-texto';
  if (valor < 0) return 'text-peligro-texto';
  return 'text-texto-secundario';
}

/**
 * Historial/auditoría de movimientos de inventario (kardex): folios ENT-/SAL-,
 * tipo, cantidades y fecha. Consume `usarMovimientosInventario()`.
 */
export function TablaMovimientos() {
  const { data, isLoading, isError } = usarMovimientosInventario();
  const movimientos = data?.registros ?? [];

  if (isLoading) {
    return <SkeletonTabla filas={6} columnas={6} />;
  }

  if (isError) {
    return (
      <TablaContenedor className="p-6 text-center text-sm text-peligro-texto">
        No se pudo cargar el historial.
      </TablaContenedor>
    );
  }

  if (movimientos.length === 0) {
    return (
      <EstadoVacio
        titulo="Sin movimientos"
        descripcion="Aún no se han registrado entradas, salidas ni ajustes de inventario."
      />
    );
  }

  return (
    <TablaContenedor>
      <Tabla>
        <TablaEncabezado>
          <tr>
            <TablaEncabezadoCelda>Folio</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Tipo</TablaEncabezadoCelda>
            <TablaEncabezadoCelda className="text-right">Cant. compra</TablaEncabezadoCelda>
            <TablaEncabezadoCelda className="text-right">Cant. control</TablaEncabezadoCelda>
            <TablaEncabezadoCelda className="text-right">Costo unit.</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Fecha</TablaEncabezadoCelda>
          </tr>
        </TablaEncabezado>
        <TablaCuerpo>
          {movimientos.map((movimiento) => (
            <TablaFila key={movimiento.id}>
              <TablaCelda className="font-mono text-xs tabular-nums">{movimiento.folio}</TablaCelda>
              <TablaCelda>
                <Badge variante={varianteTipo(movimiento.tipoMovimiento)}>
                  {ETIQUETA_TIPO_MOVIMIENTO[movimiento.tipoMovimiento]}
                </Badge>
              </TablaCelda>
              <TablaCelda
                className={`text-right tabular-nums ${
                  movimiento.cantidadCompra === null
                    ? 'text-texto-secundario'
                    : claseCantidad(movimiento.cantidadCompra)
                }`}
              >
                {movimiento.cantidadCompra === null
                  ? '—'
                  : movimiento.cantidadCompra.toLocaleString('es-MX')}
              </TablaCelda>
              <TablaCelda className={`text-right tabular-nums ${claseCantidad(movimiento.cantidadControl)}`}>
                {movimiento.cantidadControl.toLocaleString('es-MX')}
              </TablaCelda>
              <TablaCelda className="text-right tabular-nums">
                {movimiento.costoUnitarioMomento.toLocaleString('es-MX', {
                  style: 'currency',
                  currency: 'MXN',
                })}
              </TablaCelda>
              <TablaCelda>{formatearFecha(movimiento.creadoEn)}</TablaCelda>
            </TablaFila>
          ))}
        </TablaCuerpo>
      </Tabla>
    </TablaContenedor>
  );
}
