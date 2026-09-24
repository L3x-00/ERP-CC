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
import { EstadoCuentaClienteBoton } from '@/modulos/cobranza/componentes/estado-cuenta-cliente-boton';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { calcularDiasVencidos } from '@/modulos/cobranza/servicios/aging-servicio';
import type { CuentaCartera } from '@/modulos/cobranza/servicios/cobranza-servicio';

export interface TablaCuentasPorCobrarProps {
  cuentas: readonly CuentaCartera[];
  cuentaSeleccionadaId: string | null;
  onSeleccionar: (cuentaId: string) => void;
  onVerHistorial?: (cuenta: CuentaCartera) => void;
  onVerOrden?: (ordenId: string) => void;
  puedeCobrar?: boolean;
}

function cuentaVigente(cuenta: CuentaCartera): boolean {
  return cuenta.estado === 'pendiente' || cuenta.estado === 'parcial';
}

export function TablaCuentasPorCobrar({
  cuentas,
  cuentaSeleccionadaId,
  onSeleccionar,
  onVerHistorial,
  onVerOrden,
  puedeCobrar = true,
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
      <Tabla className="min-w-[1050px]">
        <TablaEncabezado>
          <tr>
            <TablaEncabezadoCelda>AR / orden</TablaEncabezadoCelda>
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
                <TablaCelda className="font-mono text-xs font-medium">
                  <div className="flex flex-col items-start gap-1">
                    <span className="whitespace-nowrap">{cuenta.referenciaInterna}</span>
                    {onVerOrden ? <Button variante="contorno" tamano="sm" onClick={() => onVerOrden(cuenta.ordenId)}>{cuenta.folioOrden}</Button> : cuenta.folioOrden}
                  </div>
                </TablaCelda>
                <TablaCelda>
            <div className="flex items-center gap-1.5">
              <span>{cuenta.clienteNombre}</span>
              <EstadoCuentaClienteBoton clienteId={cuenta.clienteId} clienteNombre={cuenta.clienteNombre} />
            </div>
          </TablaCelda>
                <TablaCelda>
                  {cuenta.fechaVencimiento
                    ? new Intl.DateTimeFormat('es-MX').format(new Date(cuenta.fechaVencimiento))
                    : 'Por entregar'}
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
                  <div className="flex items-center gap-1.5">
                    {cuenta.cobrableDesde === null && cuentaVigente(cuenta) && (
                      <span
                        className="rounded-full bg-superficie-2 px-1.5 py-0.5 text-[10px] font-semibold text-texto-secundario"
                        title="La cuenta se vuelve cobrable al entregar; hasta entonces solo admite anticipos"
                      >
                        No cobrable
                      </span>
                    )}
                    <BadgeEstado estado={cuenta.estado} />
                  </div>
                </TablaCelda>
                <TablaCelda className="text-right">
                  {onVerHistorial && <Button tamano="sm" variante="contorno" onClick={() => onVerHistorial(cuenta)}>Historial</Button>}
                  <Button
                    tamano="sm"
                    variante={seleccionada ? 'secundario' : 'contorno'}
                    onClick={() => onSeleccionar(cuenta.id)}
                    disabled={!puedeCobrar || !cuentaVigente(cuenta)}
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
