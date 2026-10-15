import type { PartidaFicha } from '@/modulos/ordenes/tipos/ficha-orden';

export function PanelPartidasFicha({ partidas }: { partidas: PartidaFicha[] }) {
  return (
    <section className="overflow-x-auto rounded-lg border border-borde" data-testid="ficha-panel-partidas">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="bg-superficie-2 text-left text-texto-secundario">
            <th scope="col" className="px-3 py-2 font-semibold">Ítem</th>
            <th scope="col" className="px-3 py-2 font-semibold">Descripción</th>
            <th scope="col" className="px-3 py-2 font-semibold">Solicitado</th>
            <th scope="col" className="px-3 py-2 font-semibold">Producido</th>
            <th scope="col" className="px-3 py-2 font-semibold">Scrap</th>
            <th scope="col" className="px-3 py-2 font-semibold">Procesos</th>
          </tr>
        </thead>
        <tbody>
          {partidas.map((partida) => (
            <tr key={partida.id} className="border-t border-borde" data-testid={`ficha-partida-${partida.codigoItem ?? partida.codigoPieza}`}>
              <td className="px-3 py-2 font-mono text-xs">
                {partida.codigoItem ?? partida.codigoPieza}
                {partida.codigoItem && partida.codigoItem !== partida.codigoPieza ? (
                  <span className="block text-texto-tenue">{partida.codigoPieza}</span>
                ) : null}
              </td>
              <td className="px-3 py-2">{partida.descripcion ?? '—'}</td>
              <td className="px-3 py-2 tabular-nums">{partida.cantidadSolicitada} {partida.unidadMedida}</td>
              <td className="px-3 py-2 tabular-nums">{partida.cantidadProducida}</td>
              <td className="px-3 py-2 tabular-nums">{partida.cantidadScrap}</td>
              <td className="px-3 py-2 text-xs text-texto-secundario">
                {partida.procesos.length > 0 ? partida.procesos.join(' · ') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
