'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  listarHistorialCostosAccion,
  listarMaterialesCostosAccion,
  listarPropuestasCostoPendientesAccion,
} from '../acciones/consultar-materiales-costos-accion';
import type { MaterialCosto, PropuestaCostoMaterial } from '../tipos/materiales-costos';
import { ModalConfirmarCosto } from './modal-confirmar-costo';
import { ModalProponerCosto } from './modal-proponer-costo';
import { TablaHistorialCostos } from './tabla-historial-costos';
import { TablaMaterialesCostos } from './tabla-materiales-costos';
import { TablaPropuestasCosto } from './tabla-propuestas-costo';

type SubPestana = 'materiales' | 'propuestas' | 'historial';

type ModalAbierto =
  | { tipo: 'proponer'; material: MaterialCosto }
  | { tipo: 'manual'; material: MaterialCosto }
  | { tipo: 'confirmar'; material: MaterialCosto; propuesta: PropuestaCostoMaterial }
  | null;

/**
 * C6.1: maestro e historial de costos de materiales. Una compra o gasto propone
 * y solo la confirmación autorizada cambia el maestro; el historial es de solo
 * lectura. La lectura de costos exige `gestionar_inventario` o `ver_finanzas`.
 */
export function PanelCostosMateriales() {
  const [pestana, setPestana] = useState<SubPestana>('materiales');
  const [filtroHistorial, setFiltroHistorial] = useState<{
    id: string;
    codigo: string;
    nombre: string;
  } | null>(null);
  const [modal, setModal] = useState<ModalAbierto>(null);

  const materiales = useQuery({
    queryKey: ['inventario', 'costos', 'materiales'],
    queryFn: () => listarMaterialesCostosAccion(),
  });
  const propuestas = useQuery({
    queryKey: ['inventario', 'costos', 'propuestas'],
    queryFn: () => listarPropuestasCostoPendientesAccion(),
  });
  const historial = useQuery({
    queryKey: ['inventario', 'costos', 'historial', filtroHistorial?.id ?? null],
    queryFn: () =>
      listarHistorialCostosAccion(
        filtroHistorial ? { materialId: filtroHistorial.id } : {},
      ),
  });

  const vista = materiales.data?.exito ? materiales.data.datos : undefined;
  const errorMateriales = materiales.isError
    ? 'No se pudieron cargar los materiales y costos'
    : materiales.data && !materiales.data.exito
      ? materiales.data.error
      : null;
  const listaPropuestas = propuestas.data?.exito ? (propuestas.data.datos ?? []) : [];
  const listaHistorial = historial.data?.exito ? (historial.data.datos ?? []) : [];

  const resumen = {
    total: vista?.materiales.length ?? 0,
    conCosto: vista?.materiales.filter((material) => material.costoVigente !== null).length ?? 0,
    pendientes: listaPropuestas.length,
  };

  function abrirConfirmacionPropuesta(propuesta: PropuestaCostoMaterial): void {
    const material = vista?.materiales.find((opcion) => opcion.id === propuesta.materialId);
    if (!material) {
      return;
    }
    setModal({ tipo: 'confirmar', material, propuesta });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="panel-costos-materiales">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-texto-secundario">
          {resumen.total} material(es) · {resumen.conCosto} con costo confirmado ·{' '}
          {resumen.pendientes} propuesta(s) pendiente(s)
        </p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-borde" aria-label="Materiales y costos">
        <BotonSubPestana activa={pestana === 'materiales'} onClick={() => setPestana('materiales')}>
          Materiales
        </BotonSubPestana>
        <BotonSubPestana
          activa={pestana === 'propuestas'}
          onClick={() => setPestana('propuestas')}
        >
          Propuestas pendientes ({resumen.pendientes})
        </BotonSubPestana>
        <BotonSubPestana activa={pestana === 'historial'} onClick={() => setPestana('historial')}>
          Historial de costos
        </BotonSubPestana>
      </nav>

      {errorMateriales !== null && (
        <p role="alert" className="text-sm text-peligro-texto">
          {errorMateriales}
        </p>
      )}

      {errorMateriales === null && vista === undefined && (
        <p className="text-sm text-texto-secundario" role="status" aria-live="polite">
          Cargando materiales y costos…
        </p>
      )}

      {vista !== undefined && pestana === 'materiales' && (
        <TablaMaterialesCostos
          materiales={vista.materiales}
          puedeGestionar={vista.puedeGestionar}
          onProponer={(material) => setModal({ tipo: 'proponer', material })}
          onCostoManual={(material) => setModal({ tipo: 'manual', material })}
          onHistorial={(material) => {
            setFiltroHistorial({ id: material.id, codigo: material.codigo, nombre: material.nombre });
            setPestana('historial');
          }}
        />
      )}

      {vista !== undefined && pestana === 'propuestas' && (
        <TablaPropuestasCosto
          propuestas={listaPropuestas}
          puedeGestionar={vista.puedeGestionar}
          confirmandoId={modal?.tipo === 'confirmar' ? modal.propuesta.id : null}
          onConfirmar={abrirConfirmacionPropuesta}
        />
      )}

      {vista !== undefined && pestana === 'historial' && (
        <TablaHistorialCostos
          versiones={listaHistorial}
          materialFiltro={
            filtroHistorial
              ? { codigo: filtroHistorial.codigo, nombre: filtroHistorial.nombre }
              : null
          }
          onQuitarFiltro={() => setFiltroHistorial(null)}
        />
      )}

      {modal?.tipo === 'proponer' && (
        <ModalProponerCosto material={modal.material} onCerrar={() => setModal(null)} />
      )}
      {modal?.tipo === 'manual' && (
        <ModalConfirmarCosto modo="manual" material={modal.material} onCerrar={() => setModal(null)} />
      )}
      {modal?.tipo === 'confirmar' && (
        <ModalConfirmarCosto
          modo="propuesta"
          material={modal.material}
          propuesta={modal.propuesta}
          onCerrar={() => setModal(null)}
        />
      )}
    </div>
  );
}

function BotonSubPestana({
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
