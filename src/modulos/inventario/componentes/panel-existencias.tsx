'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Tabla,
  TablaCelda,
  TablaContenedor,
  TablaCuerpo,
  TablaEncabezado,
  TablaEncabezadoCelda,
  TablaFila,
} from '@/compartido/componentes/diseno/tabla';
import { formatearFecha, formatearMoneda, formatearNumero } from '@/compartido/utilidades/formatear';

import {
  listarMovimientosSaldoMaterialAccion,
  listarSaldosMaterialAccion,
} from '../acciones/consultar-saldos-material-accion';
import type { MaterialCosto } from '../tipos/materiales-costos';
import { ModalAjustarSaldo } from './modal-ajustar-saldo';

/**
 * Obs. cliente 2026-10-13 (8): existencias como saldo manual con historial.
 * La tabla principal muestra el saldo vigente por material (+ espesor); cada
 * ajuste queda en la bitácora append-only con motivo y actor. El consumo de
 * las órdenes no descuenta: solo el ajuste autorizado cambia el saldo.
 */
export function PanelExistencias({
  materiales,
  puedeGestionar,
}: {
  materiales: readonly MaterialCosto[];
  puedeGestionar: boolean;
}) {
  const [ajuste, setAjuste] = useState<{ materialId: string; espesorId: string | null } | null>(
    null,
  );
  const [nuevoAjuste, setNuevoAjuste] = useState(false);
  const [filtro, setFiltro] = useState<{ id: string; codigo: string; nombre: string } | null>(null);

  const saldos = useQuery({
    queryKey: ['inventario', 'existencias', 'saldos'],
    queryFn: () => listarSaldosMaterialAccion(),
  });
  const movimientos = useQuery({
    queryKey: ['inventario', 'existencias', 'movimientos', filtro?.id ?? null],
    queryFn: () =>
      listarMovimientosSaldoMaterialAccion(filtro ? { materialId: filtro.id } : {}),
  });

  const vista = saldos.data?.exito ? saldos.data.datos : undefined;
  const errorSaldos = saldos.isError
    ? 'No se pudieron cargar las existencias'
    : saldos.data && !saldos.data.exito
      ? saldos.data.error
      : null;
  const lista = vista?.saldos ?? [];
  const historial = movimientos.data?.exito ? (movimientos.data.datos ?? []) : [];
  const puedeAjustar = vista?.puedeGestionar ?? puedeGestionar;

  return (
    <section className="flex flex-col gap-4" data-testid="panel-existencias">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-texto-secundario">
          {lista.length} saldo(s) manuales · el consumo de las órdenes no descuenta existencias
        </p>
        {puedeAjustar && (
          <Button type="button" tamano="sm" onClick={() => setNuevoAjuste(true)}>
            Ajustar existencia
          </Button>
        )}
      </div>

      {errorSaldos !== null && (
        <p role="alert" className="text-sm text-peligro-texto">
          {errorSaldos}
        </p>
      )}

      {errorSaldos === null && vista === undefined && (
        <p className="text-sm text-texto-secundario" role="status" aria-live="polite">
          Cargando existencias…
        </p>
      )}

      {vista !== undefined &&
        (lista.length === 0 ? (
          <p className="rounded-lg border border-dashed border-borde px-4 py-6 text-center text-sm text-texto-secundario">
            Sin existencias registradas. Usa «Ajustar existencia» para fijar el primer saldo
            manual.
          </p>
        ) : (
          <TablaContenedor>
            <Tabla>
              <TablaEncabezado>
                <tr>
                  <TablaEncabezadoCelda>Material</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Espesor</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Saldo</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Unidad</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Costo vigente</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Valor estimado</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Actualizado</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda className="text-right">Acciones</TablaEncabezadoCelda>
                </tr>
              </TablaEncabezado>
              <TablaCuerpo>
                {lista.map((saldo) => (
                  <TablaFila key={saldo.id}>
                    <TablaCelda>
                      <span className="block font-medium">{saldo.materialNombre}</span>
                      <span className="font-mono text-xs text-texto-secundario">
                        {saldo.materialCodigo}
                      </span>
                    </TablaCelda>
                    <TablaCelda className="text-texto-secundario">
                      {saldo.espesorEtiqueta ?? '—'}
                    </TablaCelda>
                    <TablaCelda className="tabular-nums">{formatearNumero(saldo.saldo, 4)}</TablaCelda>
                    <TablaCelda className="text-texto-secundario">{saldo.unidadBase}</TablaCelda>
                    <TablaCelda className="tabular-nums">
                      {saldo.costoVigente === null ? (
                        <span className="text-texto-tenue">Sin costo</span>
                      ) : (
                        formatearMoneda(saldo.costoVigente, saldo.monedaCosto, 4)
                      )}
                    </TablaCelda>
                    <TablaCelda className="tabular-nums">
                      {saldo.costoVigente === null ? (
                        <span className="text-texto-tenue">—</span>
                      ) : (
                        formatearMoneda(saldo.costoVigente * saldo.saldo, saldo.monedaCosto, 2)
                      )}
                    </TablaCelda>
                    <TablaCelda className="text-texto-secundario">
                      {formatearFecha(saldo.actualizadoEn)}
                      <span className="block text-xs text-texto-tenue">
                        {saldo.actualizadoPorNombre}
                      </span>
                    </TablaCelda>
                    <TablaCelda className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variante="fantasma"
                          tamano="sm"
                          onClick={() =>
                            setFiltro({
                              id: saldo.materialId,
                              codigo: saldo.materialCodigo,
                              nombre: saldo.materialNombre,
                            })
                          }
                        >
                          Historial
                        </Button>
                        {puedeAjustar && (
                          <Button
                            type="button"
                            variante="contorno"
                            tamano="sm"
                            aria-label={`Ajustar ${saldo.materialNombre}${
                              saldo.espesorEtiqueta ? `, ${saldo.espesorEtiqueta}` : ''
                            }`}
                            onClick={() =>
                              setAjuste({
                                materialId: saldo.materialId,
                                espesorId: saldo.espesorId,
                              })
                            }
                          >
                            Ajustar
                          </Button>
                        )}
                      </div>
                    </TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
          </TablaContenedor>
        ))}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-texto-primario">Historial de ajustes</h3>
          {filtro && (
            <>
              <Badge variante="info">
                {filtro.codigo} · {filtro.nombre}
              </Badge>
              <Button variante="fantasma" tamano="sm" onClick={() => setFiltro(null)}>
                Quitar filtro
              </Button>
            </>
          )}
        </div>
        {movimientos.data && !movimientos.data.exito ? (
          <p role="alert" className="text-sm text-peligro-texto">
            {movimientos.data.error}
          </p>
        ) : historial.length === 0 ? (
          <p className="text-sm text-texto-secundario">Sin ajustes registrados.</p>
        ) : (
          <TablaContenedor>
            <Tabla>
              <TablaEncabezado>
                <tr>
                  <TablaEncabezadoCelda>Fecha</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Material</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Espesor</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Anterior</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Nuevo</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Motivo</TablaEncabezadoCelda>
                  <TablaEncabezadoCelda>Actor</TablaEncabezadoCelda>
                </tr>
              </TablaEncabezado>
              <TablaCuerpo>
                {historial.map((movimiento) => (
                  <TablaFila key={movimiento.id}>
                    <TablaCelda className="text-texto-secundario">
                      {formatearFecha(movimiento.creadoEn)}
                    </TablaCelda>
                    <TablaCelda>
                      <span className="block font-medium">{movimiento.materialNombre}</span>
                      <span className="font-mono text-xs text-texto-secundario">
                        {movimiento.materialCodigo}
                      </span>
                    </TablaCelda>
                    <TablaCelda className="text-texto-secundario">
                      {movimiento.espesorEtiqueta ?? '—'}
                    </TablaCelda>
                    <TablaCelda className="tabular-nums">
                      {formatearNumero(movimiento.saldoAnterior, 4)}
                    </TablaCelda>
                    <TablaCelda className="tabular-nums">
                      {formatearNumero(movimiento.saldoNuevo, 4)}
                    </TablaCelda>
                    <TablaCelda className="text-texto-secundario">{movimiento.motivo}</TablaCelda>
                    <TablaCelda className="text-texto-secundario">{movimiento.actorNombre}</TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
          </TablaContenedor>
        )}
      </div>

      {nuevoAjuste && puedeAjustar && (
        <ModalAjustarSaldo
          materiales={materiales}
          saldos={lista}
          inicial={null}
          onCerrar={() => setNuevoAjuste(false)}
        />
      )}
      {ajuste && puedeAjustar && (
        <ModalAjustarSaldo
          materiales={materiales}
          saldos={lista}
          inicial={ajuste}
          onCerrar={() => setAjuste(null)}
        />
      )}
    </section>
  );
}
