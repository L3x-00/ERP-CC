'use client';

import { useState } from 'react';
import { FiltrosInventario } from '@/modulos/inventario/componentes/filtros-inventario';
import { PanelCostosMateriales } from '@/modulos/inventario/componentes/panel-costos-materiales';
import { TablaMateriales } from '@/modulos/inventario/componentes/tabla-materiales';
import { TablaMovimientos } from '@/modulos/inventario/componentes/tabla-movimientos';
import { SincronizadorInventarioRealtime } from '@/modulos/inventario/componentes/sincronizador-inventario-realtime';

type Pestana = 'costos' | 'existencias' | 'kardex';

/** Costos vigentes y consultas históricas, sin operación diaria de inventario. */
export function PanelInventario({ puedeVerHistorico }: { puedeVerHistorico: boolean }) {
  const [pestana, setPestana] = useState<Pestana>('costos');

  return (
    <div className="flex flex-col gap-4">
      {puedeVerHistorico ? <SincronizadorInventarioRealtime /> : null}

      <nav
        className="flex flex-wrap gap-1 border-b border-borde"
        aria-label="Secciones de Materiales y costos"
      >
        <BotonPestana activa={pestana === 'costos'} onClick={() => setPestana('costos')}>
          Costos vigentes
        </BotonPestana>
        {puedeVerHistorico ? (
          <>
            <BotonPestana
              activa={pestana === 'existencias'}
              onClick={() => setPestana('existencias')}
            >
              Existencias históricas
            </BotonPestana>
            <BotonPestana activa={pestana === 'kardex'} onClick={() => setPestana('kardex')}>
              Kardex histórico
            </BotonPestana>
          </>
        ) : null}
      </nav>

      {pestana === 'costos' ? (
        <PanelCostosMateriales />
      ) : pestana === 'existencias' ? (
        <div className="flex flex-col gap-3">
          <AvisoHistorico>
            Estas existencias pertenecen al inventario anterior y se conservan únicamente como
            referencia. Ya no generan alertas ni operaciones de stock.
          </AvisoHistorico>
          <FiltrosInventario />
          <TablaMateriales />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <AvisoHistorico>
            Este kardex conserva entradas, salidas y ajustes anteriores. La información es de solo
            lectura y no se usa para registrar consumos nuevos.
          </AvisoHistorico>
          <TablaMovimientos />
        </div>
      )}
    </div>
  );
}

function AvisoHistorico({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-borde bg-superficie-2 px-4 py-3" role="note">
      <p className="font-medium text-texto-primario">Histórico · Solo lectura</p>
      <p className="mt-1 text-sm text-texto-secundario">{children}</p>
    </div>
  );
}

function BotonPestana({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onClick}
      className={`border-b-2 px-3 py-2 text-sm transition-colors ${
        activa
          ? 'border-primario font-semibold text-primario'
          : 'border-transparent text-texto-secundario hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
