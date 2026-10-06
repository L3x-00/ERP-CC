'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/compartido/componentes/ui/button';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Select } from '@/compartido/componentes/ui/input';
import { formatearFecha, formatearMoneda } from '@/compartido/utilidades/formatear';
import { obtenerTesoreriaAccion } from '@/modulos/tesoreria/acciones/obtener-tesoreria';
import { conciliarMovimientoAccion } from '@/modulos/tesoreria/acciones/conciliar-movimiento';
import { desconciliarMovimientoAccion } from '@/modulos/tesoreria/acciones/desconciliar-movimiento';
import { PanelSaldoInicial } from '@/modulos/tesoreria/componentes/panel-saldo-inicial';
import { PanelTransferencia } from '@/modulos/tesoreria/componentes/panel-transferencia';
import {
  ETIQUETA_ENTIDAD_TESORERIA,
  type CuentaTesoreria,
  type DatosTesoreria,
} from '@/modulos/tesoreria/tipos/indice';

/** SII-B8 F5: tablero de tesorería con saldos, transferencias y conciliación. */
export function ColaTesoreria({
  inicial,
  puedeOperar,
}: {
  inicial: DatosTesoreria;
  puedeOperar: boolean;
}) {
  const [datos, setDatos] = useState<DatosTesoreria>(inicial);
  const [filtroCuenta, setFiltroCuenta] = useState('todas');
  const [actualizando, setActualizando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [saldoCuenta, setSaldoCuenta] = useState<CuentaTesoreria | null>(null);
  const [transferenciaAbierta, setTransferenciaAbierta] = useState(false);
  const [sesion, setSesion] = useState(0);

  async function actualizar(): Promise<void> {
    setActualizando(true);
    const respuesta = await obtenerTesoreriaAccion();
    if (respuesta.exito && respuesta.datos) {
      setDatos(respuesta.datos);
    } else if (!respuesta.exito) {
      setAviso(respuesta.error);
    }
    setActualizando(false);
  }

  async function conciliar(cuentaId: string, entidad: string, entidadId: string): Promise<void> {
    const respuesta = await conciliarMovimientoAccion({
      cuentaId,
      entidad: entidad as 'cobro' | 'pago_compra' | 'gasto' | 'transferencia',
      entidadId,
    });
    if (!respuesta.exito) {
      setAviso(respuesta.error);
      return;
    }
    await actualizar();
  }

  async function desconciliar(entidad: string, entidadId: string): Promise<void> {
    const respuesta = await desconciliarMovimientoAccion({
      entidad: entidad as 'cobro' | 'pago_compra' | 'gasto' | 'transferencia',
      entidadId,
    });
    if (!respuesta.exito) {
      setAviso(respuesta.error);
      return;
    }
    await actualizar();
  }

  const movimientos = useMemo(
    () => datos.movimientos.filter((movimiento) => filtroCuenta === 'todas' || movimiento.cuentaId === filtroCuenta),
    [datos.movimientos, filtroCuenta],
  );

  return (
    <div className="flex flex-col gap-5" data-testid="cola-tesoreria">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="grid gap-1 text-xs font-medium text-texto-secundario">
          Cuenta
          <Select className="min-h-11" data-testid="filtro-cuenta-tesoreria"
            value={filtroCuenta} onChange={(evento) => setFiltroCuenta(evento.target.value)}>
            <option value="todas">Todas las cuentas</option>
            {datos.cuentas.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.id}>{cuenta.etiqueta}</option>
            ))}
          </Select>
        </label>
        <div className="flex gap-2">
          <Button type="button" variante="contorno" tamano="sm" disabled={actualizando}
            data-testid="actualizar-tesoreria" onClick={() => void actualizar()}>
            {actualizando ? 'Actualizando…' : 'Actualizar'}
          </Button>
          {puedeOperar ? (
            <Button type="button" tamano="sm" data-testid="abrir-transferencia"
              onClick={() => { setSesion((actual) => actual + 1); setTransferenciaAbierta(true); }}>
              Transferencia
            </Button>
          ) : null}
        </div>
      </div>

      {aviso ? <p role="alert" className="text-sm text-peligro-texto" data-testid="tesoreria-aviso">{aviso}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Saldos por cuenta">
        {datos.cuentas.map((cuenta) => (
          <article key={cuenta.id} data-testid={`cuenta-tesoreria-${cuenta.id}`}
            className="rounded-lg border border-borde bg-superficie p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-texto-primario">{cuenta.etiqueta}</p>
              <span className="rounded-full bg-superficie-2 px-2 py-0.5 text-[10px] font-semibold uppercase text-texto-secundario">
                {cuenta.tipo}
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums" data-testid={`saldo-actual-${cuenta.id}`}>
              {formatearMoneda(cuenta.saldoActual, cuenta.moneda as 'MXN' | 'USD')}
            </p>
            <p className="text-xs text-texto-secundario">
              Inicial: {cuenta.saldoInicial === null ? 'sin registrar' : formatearMoneda(cuenta.saldoInicial, cuenta.moneda as 'MXN' | 'USD')}
              {' · '}Conciliados: {cuenta.conciliados}/{cuenta.movimientos}
            </p>
            {puedeOperar ? (
              <Button type="button" variante="contorno" tamano="sm" className="mt-3"
                data-testid={`saldo-inicial-${cuenta.id}`} onClick={() => setSaldoCuenta(cuenta)}>
                Saldo inicial
              </Button>
            ) : null}
          </article>
        ))}
      </section>

      {movimientos.length === 0 ? (
        <p className="rounded-md border border-borde p-6 text-center text-sm text-texto-secundario" data-testid="tesoreria-vacio">
          Sin movimientos de tesorería para la cuenta seleccionada.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borde" data-testid="tabla-movimientos-tesoreria">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Movimientos de tesorería por cuenta</caption>
            <thead className="bg-superficie-2 text-left text-xs uppercase tracking-wide text-texto-secundario">
              <tr>
                <th scope="col" className="px-4 py-3">Fecha</th>
                <th scope="col" className="px-4 py-3">Cuenta</th>
                <th scope="col" className="px-4 py-3">Concepto</th>
                <th scope="col" className="px-4 py-3 text-right">Monto</th>
                <th scope="col" className="px-4 py-3">Conciliación</th>
                <th scope="col" className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((movimiento) => (
                <tr key={`${movimiento.entidad}-${movimiento.entidadId}`}
                  data-testid={`movimiento-${movimiento.entidad}-${movimiento.entidadId}`}
                  className="border-t border-borde">
                  <td className="whitespace-nowrap px-4 py-3 text-texto-secundario">{formatearFecha(movimiento.fecha)}</td>
                  <td className="px-4 py-3 text-xs">{movimiento.cuentaEtiqueta}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">
                      {ETIQUETA_ENTIDAD_TESORERIA[movimiento.entidad]}
                    </span>
                    <span className="block font-mono text-xs">{movimiento.referencia}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {movimiento.signo === 1 ? '+' : '−'}{formatearMoneda(movimiento.monto, movimiento.moneda as 'MXN' | 'USD')}
                  </td>
                  <td className="px-4 py-3">
                    <span data-testid={`conciliacion-${movimiento.entidad}-${movimiento.entidadId}`}>
                      <BadgeEstado estado={movimiento.conciliadoEn ? 'conciliado' : 'pendiente'} />
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {puedeOperar ? (
                      movimiento.conciliadoEn ? (
                        <Button type="button" variante="contorno" tamano="sm"
                          data-testid={`desconciliar-${movimiento.entidad}-${movimiento.entidadId}`}
                          onClick={() => void desconciliar(movimiento.entidad, movimiento.entidadId)}>
                          Desconciliar
                        </Button>
                      ) : (
                        <Button type="button" tamano="sm"
                          data-testid={`conciliar-${movimiento.entidad}-${movimiento.entidadId}`}
                          onClick={() => void conciliar(movimiento.cuentaId, movimiento.entidad, movimiento.entidadId)}>
                          Conciliar
                        </Button>
                      )
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {saldoCuenta ? (
        <PanelSaldoInicial
          key={`${saldoCuenta.id}-${sesion}`}
          cuentaId={saldoCuenta.id}
          cuentaEtiqueta={saldoCuenta.etiqueta}
          moneda={saldoCuenta.moneda}
          saldoActual={saldoCuenta.saldoInicial}
          abierto
          onCerrar={() => setSaldoCuenta(null)}
          onGuardado={actualizar}
        />
      ) : null}
      {transferenciaAbierta ? (
        <PanelTransferencia
          key={`transferencia-${sesion}`}
          cuentas={datos.cuentas}
          abierto
          onCerrar={() => setTransferenciaAbierta(false)}
          onRegistrada={actualizar}
        />
      ) : null}
    </div>
  );
}
