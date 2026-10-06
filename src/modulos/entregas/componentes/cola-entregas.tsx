'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import {
  obtenerColaEntregasAccion,
  type ColaEntregas,
} from '@/modulos/entregas/acciones/obtener-cola-entregas';
import { PanelPrepararEntrega } from '@/modulos/entregas/componentes/panel-preparar-entrega';
import { etiquetaEstadoEntrega, filtrarEntregasCola, type FiltroEstadoEntrega } from '@/modulos/entregas/utilidades/indice';
import { cn } from '@/compartido/utilidades/cn';

/**
 * SII-B7.3: cola de Logística con dos vistas: órdenes pendientes de entregar
 * (preparar entrega) y notas registradas (abrir detalle/evidencia).
 */
export function ColaEntregas({
  inicial,
  puedeGenerar,
  ordenInicialId,
}: {
  inicial: ColaEntregas;
  puedeGenerar: boolean;
  ordenInicialId?: string;
}) {
  const [datos, setDatos] = useState<ColaEntregas>(inicial);
  const [tab, setTab] = useState<'pendientes' | 'notas'>('pendientes');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstadoEntrega>('todas');
  const [texto, setTexto] = useState('');
  const [preparandoOrdenId, setPreparandoOrdenId] = useState<string | null>(ordenInicialId ?? null);
  const [sesionPanel, setSesionPanel] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);

  async function actualizar(): Promise<void> {
    setActualizando(true);
    const respuesta = await obtenerColaEntregasAccion();
    if (respuesta.exito && respuesta.datos) {
      setDatos(respuesta.datos);
    } else if (!respuesta.exito) {
      setAviso(respuesta.error);
    }
    setActualizando(false);
  }

  const entregasFiltradas = useMemo(
    () => filtrarEntregasCola(datos.entregas, { estado: filtroEstado, texto }),
    [datos.entregas, filtroEstado, texto],
  );

  const claseTab = (activa: boolean) =>
    cn(
      'rounded-md px-3 py-2 text-sm font-semibold transition-colors',
      activa ? 'bg-primario text-white' : 'hover:bg-superficie-2 text-texto-secundario',
    );

  return (
    <div className="flex flex-col gap-5" data-testid="cola-entregas">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Vistas de entregas" className="flex gap-1">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pendientes'}
            data-testid="cola-tab-pendientes"
            className={claseTab(tab === 'pendientes')}
            onClick={() => setTab('pendientes')}
          >
            Pendientes por entregar ({datos.pendientes.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'notas'}
            data-testid="cola-tab-notas"
            className={claseTab(tab === 'notas')}
            onClick={() => setTab('notas')}
          >
            Notas registradas ({datos.entregas.length})
          </button>
        </div>
        <Button type="button" variante="contorno" tamano="sm" disabled={actualizando}
          data-testid="actualizar-colas-entregas" onClick={() => void actualizar()}>
          {actualizando ? 'Actualizando…' : 'Actualizar'}
        </Button>
      </div>

      {aviso ? <p role="alert" className="text-sm text-peligro-texto">{aviso}</p> : null}

      {tab === 'pendientes' ? (
        datos.pendientes.length === 0 ? (
          <p className="rounded-md border border-borde p-6 text-center text-sm text-texto-secundario">
            No hay órdenes con piezas pendientes de entrega.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-borde" data-testid="tabla-pendientes-entrega">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Órdenes con piezas pendientes de entregar</caption>
              <thead className="bg-superficie-2 text-left text-xs uppercase tracking-wide text-texto-secundario">
                <tr>
                  <th scope="col" className="px-4 py-3">Orden</th>
                  <th scope="col" className="px-4 py-3">Cliente</th>
                  <th scope="col" className="px-4 py-3">Estado</th>
                  <th scope="col" className="px-4 py-3">Ítems</th>
                  <th scope="col" className="px-4 py-3">Pendiente</th>
                  <th scope="col" className="px-4 py-3">Disponible</th>
                  <th scope="col" className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {datos.pendientes.map((orden) => {
                  const folioVisible = orden.folioSii ?? orden.folio;
                  return (
                    <tr key={orden.ordenId} data-testid={`fila-pendiente-${folioVisible}`}
                      className="border-t border-borde">
                      <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-mono text-xs">
                        {folioVisible}
                        {orden.esInterna ? <span className="ml-2 rounded-full bg-superficie-2 px-2 py-0.5 text-[10px]">TI</span> : null}
                      </th>
                      <td className="px-4 py-3">{orden.clienteNombre ?? '—'}</td>
                      <td className="px-4 py-3"><BadgeEstado estado={orden.estadoSii} /></td>
                      <td className="px-4 py-3 tabular-nums">{orden.itemsPendientes}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold">{orden.totalPendiente}</td>
                      <td className="px-4 py-3 tabular-nums text-texto-secundario">{orden.totalDisponible}</td>
                      <td className="px-4 py-3 text-right">
                        {puedeGenerar ? (
                          <Button type="button" tamano="sm"
                            data-testid={`preparar-entrega-${folioVisible}`}
                            onClick={() => { setAviso(null); setSesionPanel((actual) => actual + 1); setPreparandoOrdenId(orden.ordenId); }}>
                            Preparar entrega
                          </Button>
                        ) : (
                          <span className="text-xs text-texto-tenue">Sin permiso para generar</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs font-medium text-texto-secundario">
              Estado
              <Select
                className="min-h-11"
                data-testid="filtro-estado-entrega"
                value={filtroEstado}
                onChange={(evento) => setFiltroEstado(evento.target.value as FiltroEstadoEntrega)}
              >
                <option value="todas">Todas</option>
                <option value="parcial">Parciales</option>
                <option value="completa">Completas</option>
              </Select>
            </label>
            <label className="grid flex-1 gap-1 text-xs font-medium text-texto-secundario">
              Buscar (folio, orden o cliente)
              <Input
                className="min-h-11"
                data-testid="filtro-texto-entrega"
                value={texto}
                onChange={(evento) => setTexto(evento.target.value)}
              />
            </label>
          </div>
          {entregasFiltradas.length === 0 ? (
            <p className="rounded-md border border-borde p-6 text-center text-sm text-texto-secundario">
              Sin notas que coincidan con el filtro.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-borde" data-testid="tabla-notas-entrega">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Notas de entrega registradas</caption>
                <thead className="bg-superficie-2 text-left text-xs uppercase tracking-wide text-texto-secundario">
                  <tr>
                    <th scope="col" className="px-4 py-3">Folio</th>
                    <th scope="col" className="px-4 py-3">Orden</th>
                    <th scope="col" className="px-4 py-3">Cliente</th>
                    <th scope="col" className="px-4 py-3">Estado</th>
                    <th scope="col" className="px-4 py-3">Piezas</th>
                    <th scope="col" className="px-4 py-3">Recibido por</th>
                    <th scope="col" className="px-4 py-3">Fecha</th>
                    <th scope="col" className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {entregasFiltradas.map((fila) => {
                    const folioVisible = fila.entrega.folioSii ?? fila.entrega.folio;
                    return (
                      <tr key={fila.entrega.id} data-testid={`fila-entrega-${folioVisible}`}
                        className="border-t border-borde">
                        <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-mono text-xs">
                          {folioVisible}
                        </th>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{fila.ordenFolioSii ?? fila.ordenFolio}</td>
                        <td className="px-4 py-3">{fila.clienteNombre ?? '—'}</td>
                        <td className="px-4 py-3">{etiquetaEstadoEntrega(fila.entrega.esParcial)}</td>
                        <td className="px-4 py-3 tabular-nums">{fila.totalPiezas}</td>
                        <td className="px-4 py-3">{fila.entrega.recibidoPor}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-texto-secundario">{formatearFecha(fila.entrega.creadoEn)}</td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/entregas/${fila.entrega.id}`}
                            className="font-semibold text-acento underline"
                            data-testid={`abrir-entrega-${folioVisible}`}>
                            Abrir
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <PanelPrepararEntrega
        key={`${preparandoOrdenId ?? 'sin-orden'}-${sesionPanel}`}
        ordenId={preparandoOrdenId}
        abierto={preparandoOrdenId !== null}
        onCerrar={() => setPreparandoOrdenId(null)}
        onRegistrada={() => void actualizar()}
      />
    </div>
  );
}
