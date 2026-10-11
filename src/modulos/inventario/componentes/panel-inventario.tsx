'use client';

import { PanelCostosMateriales } from '@/modulos/inventario/componentes/panel-costos-materiales';

/**
 * Materiales y costos (DC-12, refinado 2026-10-10): el módulo expone solo la
 * lógica ligera acordada con el cliente —catálogo maestro con costo vigente,
 * historial de costos y propuestas de compra/gasto—. El consumo se registra en
 * las órdenes y su costo queda congelado ahí; no hay existencias, kardex,
 * reservas ni operación de almacén en la interfaz.
 */
export function PanelInventario() {
  return (
    <div className="flex flex-col gap-4" data-testid="panel-inventario">
      <PanelCostosMateriales />
    </div>
  );
}
