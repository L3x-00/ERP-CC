'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { editarCostosRevisionAccion } from '@/modulos/propuestas/acciones/editar-costos-revision';
import { editarRuteoItemAccion } from '@/modulos/propuestas/acciones/editar-ruteo-item';
import type { CatalogosPropuesta } from '@/modulos/propuestas/acciones/obtener-catalogos-propuesta';
import { calcularTotalesPropuesta } from '@/modulos/propuestas/servicios/calcular-totales-propuesta';
import {
  CATEGORIAS_COSTO,
  type CategoriaCosto,
  type CostoRevisionPropuesta,
  type PermisosPropuesta,
  type PropuestaItem,
  type RevisionPropuesta,
  type RuteoItemPropuesta,
} from '@/modulos/propuestas/tipos/indice';
import { ETIQUETA_CATEGORIA_COSTO } from '@/modulos/propuestas/utilidades/indice';
import { claveDetallePropuesta } from './claves-consulta';

type FilaRuteoBorrador = {
  procesoId: string;
  grupoEquipoId: string;
  grupoPlaneadoId: string;
  setupHoras: string;
  runHoras: string;
};

/**
 * SII-B4.5/4.9/4.11: ruteo estimado por ítem y costeo por categoría de una
 * revisión DRAFT, con totales en vivo. Guardar el ruteo/costeo confirma los
 * flags "Requiere revisión".
 */
export function PanelRuteoCosteo({
  revision,
  items,
  ruteo,
  costos,
  catalogos,
  permisos,
}: {
  revision: RevisionPropuesta;
  items: PropuestaItem[];
  ruteo: RuteoItemPropuesta[];
  costos: CostoRevisionPropuesta[];
  catalogos: CatalogosPropuesta | null;
  permisos: PermisosPropuesta;
}) {
  const queryClient = useQueryClient();
  const [ruteoBorrador, setRuteoBorrador] = useState<Record<string, FilaRuteoBorrador[] | undefined>>({});
  const [costosBorrador, setCostosBorrador] = useState<Record<CategoriaCosto, string> | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  const esBorrador = revision.estado === 'DRAFT';
  const itemsRevision = items.filter((item) => item.revisionId === revision.id);

  function filasDe(itemId: string): FilaRuteoBorrador[] {
    const borrador = ruteoBorrador[itemId];
    if (borrador) return borrador;
    return ruteo
      .filter((fila) => fila.itemId === itemId)
      .sort((a, b) => a.secuencia - b.secuencia)
      .map((fila) => ({
        procesoId: fila.procesoId,
        grupoEquipoId: fila.grupoEquipoId ?? '',
        grupoPlaneadoId: fila.grupoPlaneadoId ?? '',
        setupHoras: String(fila.setupHoras),
        runHoras: String(fila.runHoras),
      }));
  }

  function actualizarFilas(itemId: string, filas: FilaRuteoBorrador[]): void {
    setRuteoBorrador((actual) => ({ ...actual, [itemId]: filas }));
  }

  const costosActuales = useMemo(() => {
    if (costosBorrador) return costosBorrador;
    const base = Object.fromEntries(
      CATEGORIAS_COSTO.map((categoria) => [categoria, '']),
    ) as Record<CategoriaCosto, string>;
    for (const costo of costos.filter((fila) => fila.revisionId === revision.id)) {
      base[costo.categoria] = String(costo.monto);
    }
    return base;
  }, [costosBorrador, costos, revision.id]);

  const totales = useMemo(
    () =>
      calcularTotalesPropuesta({
        items: itemsRevision.map((item) => ({
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          esDescuento: item.esDescuento,
          activo: item.activo,
        })),
        costoTotal: CATEGORIAS_COSTO.reduce(
          (suma, categoria) => suma + (Number(costosActuales[categoria]) || 0),
          0,
        ),
        ivaPorcentaje: revision.snapshotCabecera.ivaPorcentaje,
        moneda: revision.snapshotCabecera.moneda,
      }),
    [itemsRevision, costosActuales, revision.snapshotCabecera],
  );

  async function guardarRuteo(item: PropuestaItem): Promise<void> {
    const filas = filasDe(item.id);
    if (filas.some((fila) => fila.procesoId === '')) {
      setMensaje('Cada fila de ruteo requiere un proceso.');
      return;
    }
    setGuardando(`ruteo-${item.id}`);
    setMensaje(null);
    const respuesta = await editarRuteoItemAccion({
      itemId: item.id,
      actualizadoEn: revision.actualizadoEn,
      filas: filas.map((fila) => ({
        procesoId: fila.procesoId,
        grupoEquipoId: fila.grupoEquipoId || null,
        grupoPlaneadoId: fila.grupoPlaneadoId || null,
        setupHoras: Number(fila.setupHoras) || 0,
        runHoras: Number(fila.runHoras) || 0,
      })),
    });
    setGuardando(null);
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    setRuteoBorrador((actual) => ({ ...actual, [item.id]: undefined }));
    // Refresca el token CAS antes de confirmar: evita guardar con una versión obsoleta.
    await queryClient.invalidateQueries({ queryKey: claveDetallePropuesta(revision.propuestaId) });
    setMensaje(`Ruteo de ${item.codigo} guardado.`);
  }

  async function guardarCostos(): Promise<void> {
    const filas = CATEGORIAS_COSTO.filter(
      (categoria) => costosActuales[categoria].trim() !== '',
    ).map((categoria) => ({
      categoria,
      monto: Number(costosActuales[categoria]) || 0,
    }));
    setGuardando('costos');
    setMensaje(null);
    const respuesta = await editarCostosRevisionAccion({
      revisionId: revision.id,
      actualizadoEn: revision.actualizadoEn,
      costos: filas,
    });
    setGuardando(null);
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    setCostosBorrador(null);
    // Refresca el token CAS antes de confirmar: evita guardar con una versión obsoleta.
    await queryClient.invalidateQueries({ queryKey: claveDetallePropuesta(revision.propuestaId) });
    setMensaje('Costos guardados.');
  }

  return (
    <section className="flex flex-col gap-4" data-testid="panel-ruteo-costeo">
      <div className="grid gap-2 rounded-lg border border-borde bg-superficie-2 p-3 text-sm sm:grid-cols-4">
        <Resumen etiqueta="Subtotal" valor={formatearMoneda(totales.subtotal, totales.moneda)} />
        <Resumen etiqueta={`IVA (${totales.ivaPorcentaje}%)`} valor={formatearMoneda(totales.iva, totales.moneda)} />
        <Resumen etiqueta="Costo total" valor={formatearMoneda(totales.costoTotal, totales.moneda)} />
        <Resumen
          etiqueta="Margen"
          valor={totales.margen === null ? '—' : `${(totales.margen * 100).toFixed(2)}%`}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-texto-primario">Ruteo estimado</h3>
        {itemsRevision.map((item) => {
          const filas = filasDe(item.id);
          const requiereRevisionItem = ruteo.some(
            (fila) => fila.itemId === item.id && fila.requiereRevision,
          );
          return (
            <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-borde p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs">{item.codigo}</span>
                <span className="font-medium">{item.descripcion}</span>
                {requiereRevisionItem && (
                  <span className="rounded-full bg-advertencia-suave px-2 py-0.5 text-xs text-advertencia-texto">
                    Requiere revisión
                  </span>
                )}
              </div>

              {filas.length === 0 && (
                <p className="text-xs text-texto-secundario">Sin ruteo capturado.</p>
              )}

              {filas.map((fila, indice) => (
                <div key={indice} className="grid gap-2 sm:grid-cols-6">
                  <Select
                    value={fila.procesoId}
                    onChange={(evento) => {
                      const copia = [...filas];
                      copia[indice] = { ...fila, procesoId: evento.target.value };
                      actualizarFilas(item.id, copia);
                    }}
                    disabled={!esBorrador || !permisos.editarRuteo}
                    aria-label={`Proceso ${item.codigo} fila ${indice + 1}`}
                  >
                    <option value="">Proceso…</option>
                    {(catalogos?.procesos ?? []).map((proceso) => (
                      <option key={proceso.id} value={proceso.id}>
                        {proceso.nombre}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={fila.grupoEquipoId}
                    onChange={(evento) => {
                      const copia = [...filas];
                      copia[indice] = { ...fila, grupoEquipoId: evento.target.value };
                      actualizarFilas(item.id, copia);
                    }}
                    disabled={!esBorrador || !permisos.editarRuteo}
                    aria-label={`Grupo de equipo ${item.codigo} fila ${indice + 1}`}
                  >
                    <option value="">Equipo…</option>
                    {(catalogos?.gruposEquipo ?? []).map((grupo) => (
                      <option key={grupo.id} value={grupo.id}>
                        {grupo.nombre}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={fila.grupoPlaneadoId}
                    onChange={(evento) => {
                      const copia = [...filas];
                      copia[indice] = { ...fila, grupoPlaneadoId: evento.target.value };
                      actualizarFilas(item.id, copia);
                    }}
                    disabled={!esBorrador || !permisos.editarRuteo}
                    aria-label={`Grupo planeado ${item.codigo} fila ${indice + 1}`}
                  >
                    <option value="">Planeado…</option>
                    {(catalogos?.gruposPlaneados ?? []).map((grupo) => (
                      <option key={grupo.id} value={grupo.id}>
                        {grupo.nombre}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={fila.setupHoras}
                    onChange={(evento) => {
                      const copia = [...filas];
                      copia[indice] = { ...fila, setupHoras: evento.target.value };
                      actualizarFilas(item.id, copia);
                    }}
                    disabled={!esBorrador || !permisos.editarRuteo}
                    aria-label={`Setup horas ${item.codigo} fila ${indice + 1}`}
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={fila.runHoras}
                    onChange={(evento) => {
                      const copia = [...filas];
                      copia[indice] = { ...fila, runHoras: evento.target.value };
                      actualizarFilas(item.id, copia);
                    }}
                    disabled={!esBorrador || !permisos.editarRuteo}
                    aria-label={`Run horas ${item.codigo} fila ${indice + 1}`}
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-xs tabular-nums text-texto-secundario">
                      {(Number(fila.setupHoras) || 0) + (Number(fila.runHoras) || 0)} h
                    </span>
                    {esBorrador && permisos.editarRuteo && (
                      <Button
                        variante="fantasma"
                        tamano="sm"
                        aria-label={`Quitar fila ${indice + 1} de ${item.codigo}`}
                        onClick={() =>
                          actualizarFilas(
                            item.id,
                            filas.filter((_, posicion) => posicion !== indice),
                          )
                        }
                      >
                        ×
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {esBorrador && permisos.editarRuteo && (
                <div className="flex items-center gap-2">
                  <Button
                    variante="contorno"
                    tamano="sm"
                    onClick={() =>
                      actualizarFilas(item.id, [
                        ...filas,
                        {
                          procesoId: '',
                          grupoEquipoId: '',
                          grupoPlaneadoId: '',
                          setupHoras: '0',
                          runHoras: '0',
                        },
                      ])
                    }
                  >
                    Agregar fila
                  </Button>
                  <Button
                    tamano="sm"
                    onClick={() => void guardarRuteo(item)}
                    disabled={guardando === `ruteo-${item.id}`}
                  >
                    {guardando === `ruteo-${item.id}` ? '…' : 'Guardar ruteo'}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-texto-primario">Costeo interno</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORIAS_COSTO.map((categoria) => (
            <label key={categoria} className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{ETIQUETA_CATEGORIA_COSTO[categoria]}</span>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={costosActuales[categoria]}
                onChange={(evento) =>
                  setCostosBorrador({ ...costosActuales, [categoria]: evento.target.value })
                }
                disabled={!esBorrador || !permisos.editarCosto}
                aria-label={`Costo ${ETIQUETA_CATEGORIA_COSTO[categoria]}`}
              />
            </label>
          ))}
        </div>
        {esBorrador && permisos.editarCosto && (
          <div>
            <Button tamano="sm" onClick={() => void guardarCostos()} disabled={guardando === 'costos'}>
              {guardando === 'costos' ? '…' : 'Guardar costos'}
            </Button>
          </div>
        )}
        {!permisos.editarCosto && (
          <p className="text-xs text-texto-secundario">
            El costo interno solo lo edita Management/Admin.
          </p>
        )}
      </div>

      {mensaje && (
        <p role="status" className="text-sm text-texto-secundario">
          {mensaje}
        </p>
      )}
    </section>
  );
}

function Resumen({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-texto-secundario">{etiqueta}</span>
      <span className="font-medium tabular-nums">{valor}</span>
    </div>
  );
}
