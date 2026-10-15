import type { RutaItemFicha } from '@/modulos/ordenes/tipos/ficha-orden';

function horas(valor: number | null): string {
  return valor === null ? '—' : `${valor.toLocaleString('es-MX', { maximumFractionDigits: 2 })} h`;
}

/** Ruta heredada de la Propuesta, por ítem. El Estado se derivará de Producción más adelante: hoy es «Pendiente». */
export function PanelRutaFicha({ ruta }: { ruta: RutaItemFicha[] }) {
  return (
    <section className="grid gap-4" data-testid="ficha-panel-ruta">
      {ruta.length === 0 ? (
        <p className="text-sm text-texto-secundario">Sin ruta registrada.</p>
      ) : ruta.map((item) => (
        <article key={item.codigoItem} className="grid gap-2">
          <h3 className="text-sm font-semibold text-texto-primario">
            <span className="font-mono">{item.codigoItem}</span>
            {item.descripcion ? <span className="font-normal text-texto-secundario"> · {item.descripcion}</span> : null}
          </h3>
          {item.pasos.length === 0 ? (
            <p className="text-sm text-texto-secundario">Sin operaciones registradas</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-borde">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="bg-superficie-2 text-left text-texto-secundario">
                    <th scope="col" className="px-3 py-2 font-semibold">#</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Proceso</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Prep. estimada</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Operación estimada</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {item.pasos.map((paso, indice) => (
                    <tr key={`${paso.secuencia}-${indice}`} className="border-t border-borde">
                      <td className="px-3 py-2 tabular-nums">{paso.secuencia}</td>
                      <td className="px-3 py-2">{paso.proceso}</td>
                      <td className="px-3 py-2 tabular-nums">{horas(paso.prepHoras)}</td>
                      <td className="px-3 py-2 tabular-nums">{horas(paso.operacionHoras)}</td>
                      <td className="px-3 py-2 text-texto-secundario">Pendiente</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
