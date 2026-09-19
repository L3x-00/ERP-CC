import { notFound } from 'next/navigation';
import { OperacionCobranza } from '@/modulos/cobranza/componentes/indice';
import { obtenerResumenCarteraServicio } from '@/modulos/cobranza/servicios/cobranza-servicio';
import { obtenerFlujoCuentasServicio } from '@/modulos/cobranza/servicios/flujo-cuentas-servicio';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

type ParametrosPaginaCobranza = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/** Cartera RSC: la lectura inicial pasa por RLS; cobros posteriores usan Server Actions. */
export default async function PaginaCobranza({ searchParams }: ParametrosPaginaCobranza) {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'ver_finanzas'))) notFound();

  const parametros = searchParams ? await searchParams : {};
  const agingInicial = typeof parametros.aging === 'string' ? parametros.aging : undefined;

  const cliente = await crearClienteSupabaseServidor();
  const [datosIniciales, flujoCuentas] = await Promise.all([
    obtenerResumenCarteraServicio(cliente, {}),
    obtenerFlujoCuentasServicio(cliente),
  ]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" data-testid="pagina-cobranza">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Cuentas por cobrar</h1>
        <p className="text-sm text-texto-secundario">Cartera, recibos y monedero actualizados en tiempo real.</p>
      </header>
      <OperacionCobranza datosIniciales={datosIniciales} agingInicial={agingInicial} puedeRegistrarPago={await can(usuario, 'registrar_pagos')} puedeAplicarSaldo={await can(usuario, 'aplicar_saldos')} />

      <section aria-labelledby="titulo-flujo-cuentas" className="flex flex-col gap-3">
        <div>
          <h2 id="titulo-flujo-cuentas" className="text-lg font-semibold">
            Flujo por cuenta
          </h2>
          <p className="text-sm text-texto-secundario">
            Cobros (pagos) menos gastos por cuenta, convertidos a MXN con el tipo de cambio aplicado
            al registrar. No representa saldo bancario: no hay saldo inicial ni conciliación de extractos.
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border border-borde">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Ingresos, egresos y neto en MXN por cuenta bancaria
            </caption>
            <thead className="bg-superficie-2 text-left">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Cuenta</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Ingresos</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Egresos</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Neto</th>
              </tr>
            </thead>
            <tbody>
              {flujoCuentas.map((fila) => (
                <tr key={fila.cuentaId ?? 'sin-cuenta'} className="border-t border-borde">
                  <td className="px-4 py-2">{fila.etiqueta}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatearMoneda(fila.ingresoMxn, 'MXN')}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatearMoneda(fila.egresoMxn, 'MXN')}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{formatearMoneda(fila.netoMxn, 'MXN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
