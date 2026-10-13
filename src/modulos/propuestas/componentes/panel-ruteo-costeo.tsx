'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { formatearMoneda, formatearNumero } from '@/compartido/utilidades/formatear';
import { costearRuteoRevisionAccion } from '@/modulos/propuestas/acciones/costear-ruteo-revision';
import { editarCostosRevisionAccion } from '@/modulos/propuestas/acciones/editar-costos-revision';
import { editarRuteoItemAccion } from '@/modulos/propuestas/acciones/editar-ruteo-item';
import type { CatalogosPropuesta } from '@/modulos/propuestas/acciones/obtener-catalogos-propuesta';
import { calcularTotalesPropuesta } from '@/modulos/propuestas/servicios/calcular-totales-propuesta';
import {
  CATEGORIAS_COSTO,
  CATEGORIAS_COSTO_EDITABLES,
  type CategoriaCosto,
  type CostoRevisionPropuesta,
  type PermisosPropuesta,
  type PropuestaItem,
  type RevisionPropuesta,
  type RuteoItemPropuesta,
  type TotalesPropuesta,
} from '@/modulos/propuestas/tipos/indice';
import { ETIQUETA_CATEGORIA_COSTO } from '@/modulos/propuestas/utilidades/indice';
import { resolverGrupoEquipoDelProceso } from '@/modulos/propuestas/utilidades/ruteo-proceso';
import type { FaltantesValidacionPropuesta } from '@/modulos/propuestas/utilidades/validacion-propuesta';
import { CLASE_MENSAJE_FALTANTE } from '@/modulos/rfq/utilidades/faltantes';
import { claveDetallePropuesta } from './claves-consulta';

type FilaRuteoBorrador = {
  procesoId: string;
  grupoEquipoId: string;
  grupoPlaneadoId: string;
  recursoId: string;
  setupHoras: string;
  runHoras: string;
};

/**
 * SII-B4.5/4.9/4.11: ruteo estimado por ítem y costeo por categoría de una
 * revisión DRAFT, con totales en vivo. Guardar el ruteo/costeo confirma los
 * flags "Requiere revisión".
 *
 * Obs. cliente 2026-10-13: al elegir el proceso se rellena el grupo de equipo
 * (el configurado o el que se llama igual); la máquina ya no se captura (la
 * tarifa sale del grupo); y el costeo interno solo pide Material y Otros, porque
 * máquina y mano de obra ya salen del ruteo costeado. Lo que falta para validar
 * (ruteo y costeo por proceso de cada ítem) se marca en rojo suave.
 */
export function PanelRuteoCosteo({
  revision,
  items,
  ruteo,
  costos,
  catalogos,
  permisos,
  faltantes = null,
}: {
  revision: RevisionPropuesta;
  items: PropuestaItem[];
  ruteo: RuteoItemPropuesta[];
  costos: CostoRevisionPropuesta[];
  catalogos: CatalogosPropuesta | null;
  permisos: PermisosPropuesta;
  /** Lo que impide validar (solo en borrador); marca en rojo los ítems pendientes. */
  faltantes?: FaltantesValidacionPropuesta | null;
}) {
  const queryClient = useQueryClient();
  const [ruteoBorrador, setRuteoBorrador] = useState<Record<string, FilaRuteoBorrador[] | undefined>>({});
  const [costosBorrador, setCostosBorrador] = useState<Record<CategoriaCosto, string> | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  const esBorrador = revision.estado === 'DRAFT';
  const itemsRevision = items.filter((item) => item.revisionId === revision.id);
  const costearPendiente = (faltantes?.itemsSinCostear.length ?? 0) > 0;

  const catalogoProcesos = catalogos?.procesos ?? [];

  /**
   * Obs. cliente 2026-10-13: las filas que nacen del RFQ traen el proceso pero no
   * el grupo de equipo. En un borrador editable el grupo (y el planeado) vacíos se
   * sugieren desde el proceso para no repetir el dato; solo se persiste al guardar.
   */
  function sugerenciaDeFila(fila: RuteoItemPropuesta): { grupoEquipoId: string; grupoPlaneadoId: string } {
    if (!esBorrador || !permisos.editarRuteo) return { grupoEquipoId: '', grupoPlaneadoId: '' };
    const proceso = catalogoProcesos.find((candidato) => candidato.id === fila.procesoId);
    if (!proceso) return { grupoEquipoId: '', grupoPlaneadoId: '' };
    return {
      grupoEquipoId: fila.grupoEquipoId
        ? ''
        : resolverGrupoEquipoDelProceso(proceso, catalogos?.gruposEquipo ?? []),
      grupoPlaneadoId: fila.grupoPlaneadoId ? '' : (proceso.grupoPlaneadoId ?? ''),
    };
  }

  function filasDe(itemId: string): FilaRuteoBorrador[] {
    const borrador = ruteoBorrador[itemId];
    if (borrador) return borrador;
    return ruteo
      .filter((fila) => fila.itemId === itemId)
      .sort((a, b) => a.secuencia - b.secuencia)
      .map((fila) => {
        const sugerida = sugerenciaDeFila(fila);
        return {
          procesoId: fila.procesoId,
          grupoEquipoId: fila.grupoEquipoId ?? sugerida.grupoEquipoId,
          grupoPlaneadoId: fila.grupoPlaneadoId ?? sugerida.grupoPlaneadoId,
          recursoId: fila.recursoId ?? '',
          setupHoras: String(fila.setupHoras),
          runHoras: String(fila.runHoras),
        };
      });
  }

  /** El ítem muestra datos (editados o sugeridos) que todavía no están en la base. */
  function ruteoSinGuardar(itemId: string): boolean {
    if (ruteoBorrador[itemId]) return true;
    return ruteo
      .filter((fila) => fila.itemId === itemId)
      .some((fila) => {
        const sugerida = sugerenciaDeFila(fila);
        return sugerida.grupoEquipoId !== '' || sugerida.grupoPlaneadoId !== '';
      });
  }

  function actualizarFilas(itemId: string, filas: FilaRuteoBorrador[]): void {
    setRuteoBorrador((actual) => ({ ...actual, [itemId]: filas }));
  }

  /** Obs. cliente 2026-10-12 (4b): el área configurada rotula el proceso. */
  const nombreArea = (codigo: string | null): string | null =>
    codigo
      ? (catalogos?.areasTrabajo.find((area) => area.codigo === codigo)?.nombre ?? null)
      : null;

  /**
   * Tarifa vigente de un renglón para el costo estimado en vivo: el override de
   * la máquina si está configurado; si no, la tarifa del grupo de equipo. Solo
   * llega con permiso de costo (los montos vienen en null para el resto).
   */
  function tarifaDeFila(fila: FilaRuteoBorrador): { tarifa: number; moneda: 'MXN' | 'USD' } | null {
    if (fila.recursoId) {
      const recurso = (catalogos?.recursos ?? []).find((item) => item.id === fila.recursoId);
      if (recurso?.tarifaHora != null && recurso.tarifaMoneda) {
        return { tarifa: recurso.tarifaHora, moneda: recurso.tarifaMoneda };
      }
    }
    const grupo = (catalogos?.gruposEquipo ?? []).find((item) => item.id === fila.grupoEquipoId);
    if (grupo?.tarifaHora != null && grupo.tarifaMoneda) {
      return { tarifa: grupo.tarifaHora, moneda: grupo.tarifaMoneda };
    }
    return null;
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

  // C3.3: el ruteo costeado sustituye al costo manual de máquina y alimenta el
  // desglose «costo total estimado de fabricación» (tiempo por uso por proceso).
  const ruteoActivoCosteado = useMemo(() => {
    const idsActivos = new Set(
      itemsRevision.filter((item) => item.activo).map((item) => item.id),
    );
    return ruteo.filter(
      (fila) => idsActivos.has(fila.itemId) && fila.costeadoEn !== null,
    );
  }, [itemsRevision, ruteo]);

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
        costoManualMaquina: Number(costosActuales.maquina) || 0,
        costoRuteo: ruteoActivoCosteado.reduce(
          (suma, fila) => suma + (fila.costoTotal ?? 0),
          0,
        ),
        ruteoCosteado: ruteoActivoCosteado.length > 0,
        ivaPorcentaje: revision.snapshotCabecera.ivaPorcentaje,
        moneda: revision.snapshotCabecera.moneda,
      }),
    [itemsRevision, costosActuales, ruteoActivoCosteado, revision.snapshotCabecera],
  );

  /** Categorías históricas ya sin captura que aún tienen monto: no se ocultan del total. */
  const categoriasRetiradasConMonto = CATEGORIAS_COSTO.filter(
    (categoria) =>
      !(CATEGORIAS_COSTO_EDITABLES as readonly CategoriaCosto[]).includes(categoria) &&
      (Number(costosActuales[categoria]) || 0) > 0,
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
        recursoId: fila.recursoId || null,
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

  async function costearRuteo(): Promise<void> {
    const pendientes = itemsRevision
      .filter((item) => item.activo && ruteoSinGuardar(item.id))
      .map((item) => item.codigo);
    if (pendientes.length > 0) {
      setMensaje(`Guarda el ruteo de ${pendientes.join(', ')} antes de costear.`);
      return;
    }
    setGuardando('ruteo-costeo');
    setMensaje(null);
    const respuesta = await costearRuteoRevisionAccion({ revisionId: revision.id });
    setGuardando(null);
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: claveDetallePropuesta(revision.propuestaId) });
    setMensaje(`Ruteo costeado: ${respuesta.datos?.renglones ?? 0} renglón(es).`);
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
          const sinRuteoItem = faltantes?.itemsSinRuteo.includes(item.codigo) === true;
          const sinCostearItem = faltantes?.itemsSinCostear.includes(item.codigo) === true;
          return (
            <div
              key={item.id}
              data-faltante={sinRuteoItem || sinCostearItem ? 'si' : 'no'}
              className={`flex flex-col gap-2 rounded-lg border p-3 ${
                sinRuteoItem || sinCostearItem ? 'border-peligro/50' : 'border-borde'
              }`}
            >
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
              {sinRuteoItem && (
                <p data-testid={`faltante-ruteo-${item.codigo}`} className={CLASE_MENSAJE_FALTANTE}>
                  Agrega al menos un proceso al ruteo de {item.codigo} y guarda el ruteo.
                </p>
              )}
              {ruteoSinGuardar(item.id) && esBorrador && permisos.editarRuteo && (
                <p
                  data-testid={`ruteo-sin-guardar-${item.codigo}`}
                  className="text-xs font-medium text-advertencia-texto"
                >
                  Cambios sin guardar en el ruteo de {item.codigo}: pulsa «Guardar ruteo».
                </p>
              )}
              {sinCostearItem && (
                <p data-testid={`faltante-costeo-${item.codigo}`} className={CLASE_MENSAJE_FALTANTE}>
                  Falta costear el ruteo de {item.codigo}: pulsa «Costear ruteo».
                </p>
              )}

              {filas.map((fila, indice) => {
                const tarifa = permisos.editarCosto ? tarifaDeFila(fila) : null;
                const horasFila = (Number(fila.setupHoras) || 0) + (Number(fila.runHoras) || 0);
                return (
                <div key={indice} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-texto-secundario">Proceso</span>
                    <Select
                      value={fila.procesoId}
                      onChange={(evento) => {
                        const procesoId = evento.target.value;
                        const proceso = catalogoProcesos.find((item) => item.id === procesoId);
                        const copia = [...filas];
                        // Obs. cliente 4b + 2026-10-13: el grupo de equipo se rellena
                        // solo (el configurado en el proceso o el que se llama igual);
                        // el usuario puede ajustarlo después.
                        copia[indice] = {
                          ...fila,
                          procesoId,
                          grupoEquipoId: proceso
                            ? resolverGrupoEquipoDelProceso(proceso, catalogos?.gruposEquipo ?? [])
                            : '',
                          grupoPlaneadoId: proceso?.grupoPlaneadoId ?? '',
                          recursoId: '',
                        };
                        actualizarFilas(item.id, copia);
                      }}
                      disabled={!esBorrador || !permisos.editarRuteo}
                      aria-label={`Proceso ${item.codigo} fila ${indice + 1}`}
                    >
                      <option value="">Proceso…</option>
                      {catalogoProcesos.map((proceso) => {
                        const area = nombreArea(proceso.areaTrabajoCodigo);
                        return (
                          <option key={proceso.id} value={proceso.id}>
                            {area ? `${proceso.nombre} · ${area}` : proceso.nombre}
                          </option>
                        );
                      })}
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-texto-secundario">Grupo de equipo</span>
                    <Select
                      value={fila.grupoEquipoId}
                      onChange={(evento) => {
                        const copia = [...filas];
                        copia[indice] = { ...fila, grupoEquipoId: evento.target.value, recursoId: '' };
                        actualizarFilas(item.id, copia);
                      }}
                      disabled={!esBorrador || !permisos.editarRuteo}
                      aria-label={`Grupo de equipo ${item.codigo} fila ${indice + 1}`}
                    >
                      <option value="">Equipo…</option>
                      {(catalogos?.gruposEquipo ?? []).map((grupo) => (
                        <option key={grupo.id} value={grupo.id}>
                          {grupo.sinTarifa ? `${grupo.nombre} (sin tarifa)` : grupo.nombre}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-texto-secundario">Grupo planeado</span>
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
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-texto-secundario">Preparación (h)</span>
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
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-texto-secundario">Operación (h)</span>
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
                  </label>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-texto-secundario">Total (h)</span>
                    <div className="flex h-9 items-center gap-1">
                      <span className="text-sm tabular-nums text-texto-secundario">
                        {formatearNumero(horasFila)} h
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
                  {permisos.editarCosto && (
                    // Obs. cliente 2026-10-12 (4b): costo estimado en vivo al
                    // capturar horas, con la tarifa del grupo o de la máquina.
                    <div
                      className="flex flex-col gap-1"
                      data-testid={`costo-estimado-${item.codigo}-${indice + 1}`}
                    >
                      <span className="text-xs text-texto-secundario">Costo estimado</span>
                      {tarifa === null ? (
                        <span className="flex h-9 items-center text-xs text-advertencia-texto">
                          Sin tarifa configurada
                        </span>
                      ) : (
                        <span className="flex h-9 flex-col justify-center text-sm leading-tight">
                          <span className="tabular-nums">
                            {formatearMoneda(horasFila * tarifa.tarifa, tarifa.moneda)}
                          </span>
                          <span className="text-xs text-texto-secundario">
                            {formatearMoneda(tarifa.tarifa, tarifa.moneda)}/h
                            {tarifa.moneda !== revision.snapshotCabecera.moneda
                              ? ' · otra moneda que la propuesta'
                              : ''}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                );
              })}

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
                          recursoId: '',
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
        <div className="flex flex-wrap items-center justify-between gap-2" data-testid="costeo-ruteo">
          <p className="text-sm text-texto-secundario">
            Costo del ruteo: {formatearMoneda(totales.costoRuteo, totales.moneda)}
            {totales.costoRuteo > 0 ? ' · sustituye al costo manual de máquina' : ' · sin costear'}
          </p>
          {esBorrador && permisos.editarCosto && (
            <Button
              tamano="sm"
              variante={costearPendiente ? 'primario' : 'contorno'}
              onClick={() => void costearRuteo()}
              disabled={guardando === 'ruteo-costeo'}
            >
              {guardando === 'ruteo-costeo' ? '…' : 'Costear ruteo'}
            </Button>
          )}
        </div>
        <h3 className="text-sm font-semibold text-texto-primario">Costeo interno</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORIAS_COSTO_EDITABLES.map((categoria) => (
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
        {categoriasRetiradasConMonto.length > 0 && (
          <p data-testid="costos-categorias-retiradas" className="text-xs text-texto-secundario">
            Costos de categorías que ya no se capturan (se conservan en el total):{' '}
            {categoriasRetiradasConMonto
              .map(
                (categoria) =>
                  `${ETIQUETA_CATEGORIA_COSTO[categoria]} ${formatearMoneda(Number(costosActuales[categoria]), totales.moneda)}`,
              )
              .join(' · ')}
            .
          </p>
        )}
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

      <DesgloseFabricacion
        filas={ruteoActivoCosteado}
        items={itemsRevision}
        catalogos={catalogos}
        totales={totales}
      />

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

/**
 * C3.3 / observación del cliente: «Costo total estimado de fabricación» debajo
 * del Costeo interno. Deriva el tiempo por uso de cada proceso (preparación +
 * operación × tarifa congelada) para saber el costo por proceso y el total
 * estimado, sin duplicar el costeo manual.
 */
function DesgloseFabricacion({
  filas,
  items,
  catalogos,
  totales,
}: {
  filas: RuteoItemPropuesta[];
  items: PropuestaItem[];
  catalogos: CatalogosPropuesta | null;
  totales: TotalesPropuesta;
}) {
  const nombreProceso = (procesoId: string): string =>
    catalogos?.procesos.find((proceso) => proceso.id === procesoId)?.nombre ?? 'Proceso';
  const nombreGrupo = (grupoId: string | null): string | null =>
    grupoId ? (catalogos?.gruposEquipo.find((grupo) => grupo.id === grupoId)?.nombre ?? null) : null;
  const nombreRecurso = (recursoId: string | null): string | null =>
    recursoId ? (catalogos?.recursos.find((recurso) => recurso.id === recursoId)?.nombre ?? null) : null;

  return (
    <div className="flex flex-col gap-2" data-testid="costeo-fabricacion">
      <h3 className="text-sm font-semibold text-texto-primario">
        Costo total estimado de fabricación
      </h3>
      {filas.length === 0 && (
        <p className="text-xs text-texto-secundario">
          Sin ruteo costeado todavía. Pulsa «Costear ruteo» para ver el tiempo por uso y el costo
          de cada proceso.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-borde">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-superficie-2 text-xs text-texto-secundario">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Ítem</th>
              <th scope="col" className="px-3 py-2 font-medium">Proceso</th>
              <th scope="col" className="px-3 py-2 font-medium">Máquina / grupo</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Preparación (h)</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Operación (h)</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Total (h)</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Tarifa (h)</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Costo</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-3 text-xs text-texto-secundario">
                  El desglose se llena al costear el ruteo.
                </td>
              </tr>
            ) : (
              filas.map((fila) => {
                const item = items.find((candidato) => candidato.id === fila.itemId);
                const maquina = nombreRecurso(fila.recursoId) ?? nombreGrupo(fila.grupoEquipoId);
                const monedaFila = fila.tarifaMoneda ?? totales.moneda;
                return (
                  <tr key={fila.id} className="border-t border-borde">
                    <td className="px-3 py-2 font-mono text-xs">{item?.codigo ?? '—'}</td>
                    <td className="px-3 py-2">{nombreProceso(fila.procesoId)}</td>
                    <td className="px-3 py-2">
                      {maquina ?? '—'}
                      {fila.tarifaFuente === 'RECURSO' && (
                        <span className="ml-1 text-xs text-texto-secundario">(tarifa propia)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatearNumero(fila.setupHoras)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatearNumero(fila.runHoras)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatearNumero(fila.totalHoras)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fila.tarifaHora === null
                        ? '—'
                        : `${formatearMoneda(fila.tarifaHora, monedaFila)}/h`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatearMoneda(fila.costoTotal ?? 0, monedaFila)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot className="border-t border-borde bg-superficie-2">
            <tr>
              <td colSpan={7} className="px-3 py-2 text-right font-medium">
                Costo de ruteo (tiempo por uso)
              </td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">
                {formatearMoneda(totales.costoRuteo, totales.moneda)}
              </td>
            </tr>
            <tr>
              <td colSpan={7} className="px-3 py-2 text-right text-texto-secundario">
                Otros costos manuales
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-texto-secundario">
                {formatearMoneda(totales.costoManual, totales.moneda)}
              </td>
            </tr>
            <tr>
              <td colSpan={7} className="px-3 py-2 text-right font-semibold">
                Total estimado de fabricación
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                {formatearMoneda(totales.costoTotal, totales.moneda)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
