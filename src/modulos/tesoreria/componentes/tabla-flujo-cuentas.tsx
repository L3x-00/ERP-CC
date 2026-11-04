import { formatearMoneda } from '@/compartido/utilidades/formatear';
import type { FlujoCuenta } from '@/modulos/tesoreria/servicios/flujo-cuentas-servicio';

/**
 * Flujo informativo por cuenta (ingresos, egresos y neto en MXN). El saldo
 * conciliado vive en la tabla de tesorería; esta tabla solo da contexto.
 */
export function TablaFlujoCuentas({ filas }: { filas: readonly FlujoCuenta[] }) {
  return (
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
            {filas.map((fila) => (
              <tr key={fila.cuentaId ?? 'sin-cuenta'} className="border-t border-borde">
                <td className="px-4 py-2">{fila.etiqueta}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatearMoneda(fila.ingresoMxn, 'MXN')}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatearMoneda(fila.egresoMxn, 'MXN')}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">{formatearMoneda(fila.netoMxn, 'MXN')}</td>
              </tr>
            ))}
            {filas.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-sm text-texto-secundario">
                  Aún no hay movimientos para mostrar.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
