'use client';

import { useEffect, useMemo, useState } from 'react';

import { PestanasModulo } from '@/compartido/componentes/ui/pestanas';
import { formatearMoneda, formatearNumero } from '@/compartido/utilidades/formatear';
import { ColaCompras } from '@/modulos/compras/componentes/cola-compras';
import type { ColaCompras as ColaComprasDatos } from '@/modulos/compras/servicios/obtener-compras';
import { OperacionGastos } from '@/modulos/gastos/componentes/operacion-gastos';
import type { Gasto } from '@/modulos/gastos/tipos/indice';
import {
  calcularResumenEgresos,
} from '@/modulos/finanzas/utilidades/resumen-financiero';

const PESTANAS = [
  { id: 'gastos', etiqueta: 'Gastos', descripcion: 'Gastos operativos, comprobantes y rentabilidad por orden' },
  { id: 'compras', etiqueta: 'Compras y CxP', descripcion: 'Compras a proveedores y cuentas por pagar' },
] as const;

export type SeccionEgresos = (typeof PESTANAS)[number]['id'];

/**
 * Módulo único de egresos: compras a proveedores y gastos operativos en una
 * sola ruta, con un resumen que responde «cuánto debemos» antes de entrar al
 * detalle. Cada pestaña conserva la pantalla original sin recortes.
 */
export function OperacionEgresos({
  gastosIniciales,
  comprasIniciales,
  puedeGestionarCompras,
  puedeVerGastos = true,
  seccionInicial = 'gastos',
}: {
  gastosIniciales: Gasto[];
  comprasIniciales: ColaComprasDatos;
  puedeGestionarCompras: boolean;
  puedeVerGastos?: boolean;
  seccionInicial?: SeccionEgresos;
}) {
  const pestanas = puedeVerGastos ? PESTANAS : PESTANAS.filter((pestana) => pestana.id !== 'gastos');
  const [seccion, setSeccion] = useState<SeccionEgresos>(() =>
    (pestanas.some((pestana) => pestana.id === seccionInicial) ? seccionInicial : pestanas[0]?.id ?? 'compras') as SeccionEgresos);
  const resumen = useMemo(
    () => calcularResumenEgresos(gastosIniciales, comprasIniciales),
    [gastosIniciales, comprasIniciales],
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('seccion') !== seccion) {
      url.searchParams.set('seccion', seccion);
      window.history.replaceState(null, '', url.toString());
    }
  }, [seccion]);

  return (
    <section className="flex flex-col gap-6" data-testid="operacion-egresos">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaResumen
          etiqueta="Total por pagar"
          valor={formatearMoneda(resumen.porPagarMxn, 'MXN')}
          ayuda="Compras con saldo y gastos pendientes"
        />
        <TarjetaResumen
          etiqueta="Compras registradas"
          valor={formatearMoneda(resumen.comprasTotalMxn, 'MXN')}
          ayuda={`${formatearNumero(comprasIniciales.compras.filter((compra) => compra.estado !== 'CANCELADA').length, 0)} compras · ${resumen.comprasPendientes} con saldo`}
        />
        <TarjetaResumen
          etiqueta="Gastos registrados"
          valor={formatearMoneda(resumen.gastosTotalMxn, 'MXN')}
          ayuda={`${resumen.gastosPendientes} pendientes de pago`}
        />
        <TarjetaResumen
          etiqueta="Proveedores"
          valor={formatearNumero(comprasIniciales.proveedores.length, 0)}
          ayuda="Disponibles para registrar una compra"
        />
      </div>

      <PestanasModulo
        pestanas={pestanas}
        activa={seccion}
        onCambiar={(id) => setSeccion(id as SeccionEgresos)}
        etiqueta="Secciones de egresos"
      />

      {seccion === 'gastos' && puedeVerGastos ? (
        <div role="tabpanel" aria-label="Gastos">
          <OperacionGastos datosIniciales={gastosIniciales} />
        </div>
      ) : (
        <div role="tabpanel" aria-label="Compras y cuentas por pagar">
          <p className="mb-4 text-sm text-texto-secundario">
            Registra compras a proveedores y su cuenta por pagar. Con Orden, la compra se clasifica
            por rubro de costo; sin Orden es gasto indirecto.
          </p>
          <ColaCompras inicial={comprasIniciales} puedeGestionar={puedeGestionarCompras} />
        </div>
      )}
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
