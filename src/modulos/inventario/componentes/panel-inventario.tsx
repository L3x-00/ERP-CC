'use client';

import { useState } from 'react';
import { MetricasInventario } from '@/modulos/inventario/componentes/metricas-inventario';
import { FiltrosInventario } from '@/modulos/inventario/componentes/filtros-inventario';
import { TablaMateriales } from '@/modulos/inventario/componentes/tabla-materiales';
import { TablaMovimientos } from '@/modulos/inventario/componentes/tabla-movimientos';
import { ModalCrearMaterial } from '@/modulos/inventario/componentes/modal-crear-material';
import { ModalRegistrarEntrada } from '@/modulos/inventario/componentes/modal-registrar-entrada';
import { ModalRegistrarSalida } from '@/modulos/inventario/componentes/modal-registrar-salida';

type Pestana = 'catalogo' | 'historial';

/**
 * Contenedor cliente del módulo de inventario: métricas, pestañas
 * (Catálogo / Historial) y los modales. Toda la lógica de datos vive en hooks;
 * la ruta App Router solo monta este contenedor.
 */
export function PanelInventario() {
  const [pestana, setPestana] = useState<Pestana>('catalogo');

  return (
    <div className="flex flex-col gap-4">
      <MetricasInventario />

      <nav className="flex gap-1 border-b border-foreground/10">
        <BotonPestana activa={pestana === 'catalogo'} onClick={() => setPestana('catalogo')}>
          Catálogo de materiales
        </BotonPestana>
        <BotonPestana activa={pestana === 'historial'} onClick={() => setPestana('historial')}>
          Historial de movimientos
        </BotonPestana>
      </nav>

      {pestana === 'catalogo' ? (
        <div className="flex flex-col gap-3">
          <FiltrosInventario />
          <TablaMateriales />
        </div>
      ) : (
        <TablaMovimientos />
      )}

      {/* Modales (su apertura la controla la tienda Zustand). */}
      <ModalCrearMaterial />
      <ModalRegistrarEntrada />
      <ModalRegistrarSalida />
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
      onClick={onClick}
      className={`border-b-2 px-3 py-2 text-sm transition-colors ${
        activa
          ? 'border-primario font-semibold text-primario'
          : 'border-transparent text-foreground/60 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
