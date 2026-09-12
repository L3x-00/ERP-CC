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
import { Button } from '@/compartido/componentes/ui/button';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { calcularDiasVencidos } from '@/modulos/cobranza/servicios/aging-servicio';
import type { CuentaCartera } from '@/modulos/cobranza/servicios/cobranza-servicio';

export interface TablaCuentasPorCobrarProps {
  cuentas: readonly CuentaCartera[];
  cuentaSeleccionadaId: string | null;
  onSeleccionar: (cuentaId: string) => void;
}

function cuentaVigente(cuenta: CuentaCartera): boolean {
  return cuenta.estado === 'pendiente' || cuenta.estado === 'parcial';
}

export function TablaCuentasPorCobrar({
  cuentas,
  cuentaSeleccionadaId,
  onSeleccionar,
}: TablaCuentasPorCobrarProps) {
  if (cuentas.length === 0) {
    return (
      <EstadoVacio
        titulo="No hay cuentas por cobrar"
        descripcion="No hay cuentas que coincidan con los filtros actuales."
      />
    );
  }

  const fechaReferencia = new Date().toISOString();

  return (
    <TablaContenedor>
      <Tabla className="min-w-[900px]">
        <TablaEncabezado>
          <tr>
            <TablaEncabezadoCelda>Orden</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Cliente</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Vencimiento</TablaEncabezadoCelda>
            <TablaEncabezadoCelda className="text-right">Monto</TablaEncabezadoCelda>
            <TablaEncabezadoCelda className="text-right">Saldo</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Producción</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Pago</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>
              <span className="sr-only">Acciones</span>
            </TablaEncabezadoCelda>
          </tr>
        </TablaEncabezado>
        <TablaCuerpo>
          {cuentas.map((cuenta) => {
            const seleccionada = cuenta.id === cuentaSeleccionadaId;
            const diasVencidos = calcularDiasVencidos(cuenta.fechaVencimiento, fechaReferencia);
            const vencida = diasVencidos !== null && diasVencidos > 0 && cuentaVigente(cuenta);
            return (
              <TablaFila key={cuenta.id} seleccionada={seleccionada}>
                <TablaCelda className="font-mono text-xs font-medium">{cuenta.folioOrden}</TablaCelda>
                <TablaCelda>{cuenta.clienteNombre}</TablaCelda>
                <TablaCelda>
                  {new Intl.DateTimeFormat('es-MX').format(new Date(cuenta.fechaVencimiento))}
                </TablaCelda>
                <TablaCelda className="text-right tabular-nums">
                  {formatearMoneda(cuenta.montoTotal, cuenta.moneda)}
                </TablaCelda>
                <TablaCelda className="text-right tabular-nums">
                  <span
                    className={vencida ? 'font-semibold text-peligro-texto' : 'font-semibold'}
                    title={
                      vencida && diasVencidos !== null
                        ? `Vencida hace ${diasVencidos} ${diasVencidos === 1 ? 'día' : 'días'}`
                        : undefined
                    }
                  >
                    {formatearMoneda(cuenta.saldoPendiente, cuenta.moneda)}
                  </span>
                </TablaCelda>
                <TablaCelda>{cuenta.estadoProduccion}</TablaCelda>
                <TablaCelda>
                  <BadgeEstado estado={cuenta.estado} />
                </TablaCelda>
                <TablaCelda className="text-right">
                  <Button
                    tamano="sm"
                    variante={seleccionada ? 'secundario' : 'contorno'}
                    onClick={() => onSeleccionar(cuenta.id)}
                  >
                    Cobrar
                  </Button>
                </TablaCelda>
              </TablaFila>
            );
          })}
        </TablaCuerpo>
      </Tabla>
    </TablaContenedor>
  );
}
