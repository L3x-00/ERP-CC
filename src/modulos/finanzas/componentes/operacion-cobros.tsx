'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { PestanasModulo } from '@/compartido/componentes/ui/pestanas';
import { formatearMoneda, formatearNumero } from '@/compartido/utilidades/formatear';
import { OperacionCobranza } from '@/modulos/cobranza/componentes/operacion-cobranza';
import type { ResumenCartera } from '@/modulos/cobranza/servicios/cobranza-servicio';
import {
  calcularResumenCobros,
  type ResumenCobros,
} from '@/modulos/finanzas/utilidades/resumen-financiero';
import { ColaTesoreria } from '@/modulos/tesoreria/componentes/cola-tesoreria';
import { SeccionCuentasBancarias } from '@/modulos/tesoreria/componentes/seccion-cuentas-bancarias';
import type { DatosTesoreria } from '@/modulos/tesoreria/tipos/indice';

const PESTANAS = [
  { id: 'cobranza', etiqueta: 'Cuentas por cobrar', descripcion: 'Cartera, cobros, promesas y recibos' },
  { id: 'tesoreria', etiqueta: 'Tesorería', descripcion: 'Saldos por cuenta, transferencias y conciliación' },
  { id: 'cuentas', etiqueta: 'Cuentas bancarias', descripcion: 'Altas, edición y estado de cuentas bancarias' },
] as const;

export type SeccionCobros = (typeof PESTANAS)[number]['id'];

/**
 * Módulo único de cobros: cuentas por cobrar y tesorería en una sola ruta. El
 * resumen responde «cuánto me deben y cuánto tengo» antes del detalle; cada
 * pestaña conserva su pantalla completa.
 */
export function OperacionCobros({
  datosIniciales,
  agingInicial,
  tesoreriaInicial,
  flujoCuentas,
  puedeRegistrarPago,
  puedeAplicarSaldo,
  puedeOperarTesoreria,
  puedeVerTesoreria = true,
  puedeVerCobranza = true,
  puedeAdministrarCuentas = false,
  seccionInicial = 'cobranza',
}: {
  datosIniciales: ResumenCartera;
  agingInicial?: string;
  tesoreriaInicial: DatosTesoreria;
  flujoCuentas: ReactNode;
  puedeRegistrarPago: boolean;
  puedeAplicarSaldo: boolean;
  puedeOperarTesoreria: boolean;
  puedeVerTesoreria?: boolean;
  puedeVerCobranza?: boolean;
  puedeAdministrarCuentas?: boolean;
  seccionInicial?: SeccionCobros;
}) {
  const pestanas = PESTANAS.filter((pestana) => (
    (pestana.id !== 'tesoreria' || puedeVerTesoreria)
    && (pestana.id !== 'cobranza' || puedeVerCobranza)
    && (pestana.id !== 'cuentas' || puedeAdministrarCuentas)
  ));
  const [seccion, setSeccion] = useState<SeccionCobros>(() =>
    (pestanas.some((pestana) => pestana.id === seccionInicial) ? seccionInicial : pestanas[0]?.id ?? 'cobranza') as SeccionCobros);
  const [resumen] = useState<ResumenCobros>(() =>
    calcularResumenCobros(datosIniciales, tesoreriaInicial));

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('seccion') !== seccion) {
      url.searchParams.set('seccion', seccion);
      window.history.replaceState(null, '', url.toString());
    }
  }, [seccion]);

  return (
    <section className="flex flex-col gap-6" data-testid="operacion-cobros">
      {puedeVerCobranza || puedeVerTesoreria ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <TarjetaResumen
            etiqueta="Cartera pendiente"
            valor={formatearMoneda(resumen.carteraMxn, 'MXN')}
            ayuda={`${formatearNumero(resumen.cuentasAbiertas, 0)} cuentas abiertas`}
          />
          <TarjetaResumen
            etiqueta="Saldo en cuentas MXN"
            valor={formatearMoneda(resumen.saldoCuentasMxn, 'MXN')}
            ayuda={`${formatearNumero(resumen.cuentasBancarias, 0)} cuentas registradas`}
          />
          <TarjetaResumen
            etiqueta="Promesas de pago"
            valor={formatearNumero(datosIniciales.agingPorCliente.length, 0)}
            ayuda="Clientes con saldo en el aging"
          />
          <TarjetaResumen
            etiqueta="Movimientos vivos"
            valor={formatearNumero(tesoreriaInicial.movimientos.length, 0)}
            ayuda="Cobros, pagos, gastos y transferencias"
          />
        </div>
      ) : null}

      <PestanasModulo
        pestanas={pestanas}
        activa={seccion}
        onCambiar={(id) => setSeccion(id as SeccionCobros)}
        etiqueta="Secciones de cobros y tesorería"
      />

      {seccion === 'cobranza' && puedeVerCobranza ? (
        <div role="tabpanel" aria-label="Cuentas por cobrar">
          <OperacionCobranza
            datosIniciales={datosIniciales}
            agingInicial={agingInicial}
            puedeRegistrarPago={puedeRegistrarPago}
            puedeAplicarSaldo={puedeAplicarSaldo}
          />
        </div>
      ) : null}
      {seccion === 'tesoreria' && puedeVerTesoreria ? (
        <div role="tabpanel" aria-label="Tesorería" className="flex flex-col gap-6">
          <ColaTesoreria inicial={tesoreriaInicial} puedeOperar={puedeOperarTesoreria} />
          {flujoCuentas}
        </div>
      ) : null}
      {seccion === 'cuentas' && puedeAdministrarCuentas ? (
        <div role="tabpanel" aria-label="Cuentas bancarias">
          <SeccionCuentasBancarias />
        </div>
      ) : null}
    </section>
  );
}

function TarjetaResumen({ etiqueta, valor, ayuda }: { etiqueta: string; valor: string; ayuda: string }) {
  return (
    <article className="rounded-lg border border-borde bg-superficie p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-texto-tenue">{etiqueta}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-texto-primario">{valor}</p>
      <p className="mt-1 text-xs text-texto-secundario">{ayuda}</p>
    </article>
  );
}
