import { PanelInventario } from '@/modulos/inventario/componentes/panel-inventario';

/**
 * Página de Inventario / Compras. Server Component delgado: solo cabecera y el
 * contenedor de módulo `PanelInventario` (métricas, pestañas y modales). Toda la
 * lógica de datos vive en los hooks del módulo.
 */
export default function PaginaInventario() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Inventario</h1>
      <PanelInventario />
    </div>
  );
}
