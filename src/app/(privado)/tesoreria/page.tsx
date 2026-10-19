import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { ColaTesoreria } from '@/modulos/tesoreria/componentes/cola-tesoreria';
import { obtenerFlujoCuentasServicio } from '@/modulos/tesoreria/servicios/flujo-cuentas-servicio';
import { obtenerTesoreria } from '@/modulos/tesoreria/servicios/obtener-tesoreria';

/** SII-B8 F5: tesorería con saldos, transferencias internas y conciliación básica. */
export default async function PaginaTesoreria() {
  const usuario = await obtenerUsuarioServidor();
  const [puedeOperar, puedeVerFinanzas] = await Promise.all([
    usuario ? can(usuario, 'registrar_pagos') : Promise.resolve(false),
    usuario ? can(usuario, 'ver_finanzas') : Promise.resolve(false),
  ]);

  if (!puedeOperar && !puedeVerFinanzas) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-borde p-6">
        <h1 className="text-xl font-bold">Tesorería</h1>
        <p className="mt-2 text-sm text-texto-secundario">No tienes permiso para ver la tesorería.</p>
      </div>
    );
  }

  const servidor = await crearClienteSupabaseServidor();
  const [datos, flujoCuentas] = await Promise.all([
    obtenerTesoreria(servidor),
    obtenerFlujoCuentasServicio(servidor),
  ]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Tesorería</h1>
        <p className="text-sm text-texto-secundario">
          Saldo inicial por cuenta (banco o efectivo) más los movimientos vivos: cobros, pagos a
          proveedores y gastos pagados. Las transferencias internas solo mueven saldo entre cuentas y
          puedes conciliar cada movimiento contra tu banco.
        </p>
      </header>
      <ColaTesoreria inicial={datos} puedeOperar={puedeOperar} />

      <section
        aria-labelledby="titulo-flujo-cuentas-tesoreria"
        className="flex flex-col gap-3"
        data-testid="flujo-cuentas-tesoreria"
      >
        <div>
          <h2 id="titulo-flujo-cuentas-tesoreria" className="text-lg font-semibold">
            Flujo informativo por cuenta
          </h2>
          <p className="text-sm text-texto-secundario">
            Cobros menos gastos por cuenta, convertidos a MXN con el tipo de cambio aplicado al
            registrar. Es informativo: el saldo conciliado está en la tabla de arriba.
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
