'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { BarraProgreso } from '@/compartido/componentes/diseno/barra-progreso';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { registrarAvancePartidaAccion } from '@/modulos/ordenes/acciones/registrar-avance-partida';
import { registrarConsumoOperadorAccion } from '@/modulos/ordenes/acciones/registrar-consumo';
import { registrarTiempoOperadorAccion } from '@/modulos/ordenes/acciones/registrar-tiempo-operador';
import { usarTiendaOrdenes } from '@/estado/uso-tienda-ordenes';
import type { OrdenConPartidas } from '@/modulos/ordenes/servicios/ordenes-servicio';
import {
  codigosFamiliaArea,
  opcionesFamiliaArea,
} from '@/modulos/produccion/utilidades/indice';

/** OBS-09/A06: catálogo mínimo de taller que necesita la terminal de piso. */
export type AreaPiso = {
  codigo: string;
  nombre: string;
  padreCodigo: string | null;
  areaPlaneacion: string | null;
};

export type MaterialPiso = {
  id: string;
  codigo: string;
  nombre: string;
  stockActualControl: number;
  unidadControl: string;
};

type PropsControlPisoPanel = {
  operadorId: string;
  nombreOperador?: string;
  ordenes: OrdenConPartidas[];
  materiales: MaterialPiso[];
  /** OBS-09: catálogo de taller para etiquetas y filtro por familia de área. */
  areas?: readonly AreaPiso[];
};

type OperacionPiso = 'tiempo' | 'avance' | 'consumo' | null;

const EVENTO_OPERACION_LOCAL = 'ordenes:piso-operacion-local';

function aNumeroPositivo(valor: string): number | null {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

/**
 * Consola de piso para sesiones PIN. Las cantidades nunca se acumulan en el
 * navegador: cada acción delega el total a una RPC transaccional de PostgreSQL.
 */
export function ControlPisoPanel({
  operadorId,
  nombreOperador,
  ordenes,
  materiales,
  areas = [],
}: PropsControlPisoPanel) {
  const router = useRouter();
  const ordenActivaId = usarTiendaOrdenes((estado) => estado.ordenActivaId);
  const seleccionarOrden = usarTiendaOrdenes((estado) => estado.seleccionarOrden);

  // OBS-09: cola por área sobre las partidas ya asignadas al operador.
  const [areaFiltro, setAreaFiltro] = useState('');
  const nombrePorArea = useMemo(
    () => new Map(areas.map((area) => [area.codigo, area.nombre])),
    [areas],
  );
  const codigosArea = useMemo(
    () =>
      [...new Set(
        ordenes.flatMap(({ partidas }) =>
          partidas.flatMap((partida) => (partida.areaTrabajoCodigo ? [partida.areaTrabajoCodigo] : [])),
        ),
      )].sort(),
    [ordenes],
  );
  // A06: una opción por familia, no una por proceso suelto.
  const opcionesArea = useMemo(
    () => opcionesFamiliaArea(areas, codigosArea),
    [areas, codigosArea],
  );
  const ordenesVisibles = useMemo(() => {
    if (areaFiltro === '') return ordenes;
    // A06: el filtro acepta la familia completa del área elegida, no solo el
    // código exacto; un proceso de tercer nivel no se queda fuera de su área.
    const codigosAceptados = codigosFamiliaArea(areas, areaFiltro);
    return ordenes
      .map((entrada) => ({
        ...entrada,
        partidas: entrada.partidas.filter(
          (partida) => typeof partida.areaTrabajoCodigo === 'string'
            && codigosAceptados.has(partida.areaTrabajoCodigo),
        ),
      }))
      .filter((entrada) => entrada.partidas.length > 0);
  }, [areaFiltro, areas, ordenes]);

  const [ordenId, setOrdenId] = useState<string>(
    () => ordenActivaId ?? ordenesVisibles[0]?.orden.id ?? '',
  );
  const ordenActiva = useMemo(
    () => ordenesVisibles.find((orden) => orden.orden.id === ordenId) ?? ordenesVisibles[0] ?? null,
    [ordenesVisibles, ordenId],
  );
  const [partidaId, setPartidaId] = useState<string>(() => ordenesVisibles[0]?.partidas[0]?.id ?? '');
  const partidaActiva = useMemo(
    () =>
      ordenActiva?.partidas.find((partida) => partida.id === partidaId) ??
      ordenActiva?.partidas[0] ??
      null,
    [ordenActiva, partidaId],
  );

  const [materialId, setMaterialId] = useState('');
  const [cantidadProducida, setCantidadProducida] = useState('0');
  const [cantidadScrapFabricacion, setCantidadScrapFabricacion] = useState('0');
  const [cantidadUsada, setCantidadUsada] = useState('0');
  const [cantidadScrapMaterial, setCantidadScrapMaterial] = useState('0');
  const [operacion, setOperacion] = useState<OperacionPiso>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidratado, setHidratado] = useState(false);
  const materialSeleccionadoId = materialId || partidaActiva?.materialId || '';
  const porcentajePartidaActiva =
    partidaActiva && partidaActiva.cantidadSolicitada > 0
      ? (partidaActiva.cantidadProducida / partidaActiva.cantidadSolicitada) * 100
      : 0;

  useEffect(() => {
    const marco = requestAnimationFrame(() => setHidratado(true));
    return () => cancelAnimationFrame(marco);
  }, []);

  function seleccionarOrdenPiso(nuevoOrdenId: string): void {
    const nuevaOrden = ordenesVisibles.find((orden) => orden.orden.id === nuevoOrdenId) ?? null;
    const nuevaPartida = nuevaOrden?.partidas[0] ?? null;
    setOrdenId(nuevoOrdenId);
    setPartidaId(nuevaPartida?.id ?? '');
    setMaterialId(nuevaPartida?.materialId ?? '');
    seleccionarOrden(nuevoOrdenId || null);
  }

  function seleccionarPartidaPiso(nuevaPartidaId: string): void {
    const nuevaPartida = ordenActiva?.partidas.find((partida) => partida.id === nuevaPartidaId);
    setPartidaId(nuevaPartidaId);
    setMaterialId(nuevaPartida?.materialId ?? '');
  }

  function limpiarResultado(): void {
    setMensaje(null);
    setError(null);
  }

  function notificarOperacionLocal(): void {
    window.dispatchEvent(new Event(EVENTO_OPERACION_LOCAL));
  }

  function confirmarOperacion(exito: boolean, mensajeExito: string, mensajeError: string): void {
    if (exito) {
      setMensaje(mensajeExito);
      router.refresh();
      return;
    }
    setError(mensajeError);
  }

  async function registrarTiempo(accion: 'inicio' | 'pausa' | 'fin'): Promise<void> {
    if (!partidaActiva) {
      setError('Selecciona una partida activa.');
      return;
    }
    limpiarResultado();
    notificarOperacionLocal();
    setOperacion('tiempo');
    try {
      const respuesta = await registrarTiempoOperadorAccion({
        partidaId: partidaActiva.id,
        operadorId,
        accion,
      });
      confirmarOperacion(
        respuesta.exito,
        `Tiempo de ${accion} registrado.`,
        respuesta.exito ? '' : respuesta.error,
      );
    } catch {
      setError('No se pudo registrar el tiempo. Intenta de nuevo.');
    }
    setOperacion(null);
  }

  async function registrarAvance(): Promise<void> {
    if (!partidaActiva) {
      setError('Selecciona una partida activa.');
      return;
    }
    const producida = aNumeroPositivo(cantidadProducida);
    const scrap = aNumeroPositivo(cantidadScrapFabricacion);
    if (producida === null || scrap === null || producida + scrap <= 0) {
      setError('Indica producción o scrap de fabricación mayor a cero.');
      return;
    }

    limpiarResultado();
    notificarOperacionLocal();
    setOperacion('avance');
    try {
      const respuesta = await registrarAvancePartidaAccion({
        partidaId: partidaActiva.id,
        cantidadProducida: producida,
        cantidadScrap: scrap,
      });
      confirmarOperacion(
        respuesta.exito,
        'Avance de partida registrado.',
        respuesta.exito ? '' : respuesta.error,
      );
      if (respuesta.exito) {
        setCantidadProducida('0');
        setCantidadScrapFabricacion('0');
      }
    } catch {
      setError('No se pudo registrar el avance. Intenta de nuevo.');
    }
    setOperacion(null);
  }

  async function registrarConsumo(): Promise<void> {
    if (!partidaActiva || materialSeleccionadoId === '') {
      setError('Selecciona una partida y un material.');
      return;
    }
    const usada = aNumeroPositivo(cantidadUsada);
    const scrap = aNumeroPositivo(cantidadScrapMaterial);
    if (usada === null || scrap === null || usada + scrap <= 0) {
      setError('Indica consumo o scrap de material mayor a cero.');
      return;
    }

    limpiarResultado();
    notificarOperacionLocal();
    setOperacion('consumo');
    try {
      const respuesta = await registrarConsumoOperadorAccion({
        partidaId: partidaActiva.id,
        materialId: materialSeleccionadoId,
        cantidadUsada: usada,
        cantidadScrap: scrap,
      });
      confirmarOperacion(
        respuesta.exito,
        'Consumo de material registrado.',
        respuesta.exito ? '' : respuesta.error,
      );
      if (respuesta.exito) {
        setCantidadUsada('0');
        setCantidadScrapMaterial('0');
      }
    } catch {
      setError('No se pudo registrar el consumo. Intenta de nuevo.');
    }
    setOperacion(null);
  }

  if (ordenes.length === 0) {
    return (
      <section className="rounded-lg border border-borde bg-superficie p-6" aria-live="polite">
        <h1 className="text-lg font-bold text-texto-primario">Control de piso</h1>
        <p className="mt-2 text-texto-secundario">No hay órdenes de producción en proceso.</p>
      </section>
    );
  }

  return (
    <section
      data-testid="control-piso"
      data-hidratado={hidratado ? 'true' : 'false'}
      className="flex max-w-5xl flex-col gap-5"
      aria-label="Control de piso de producción"
    >
      <header className="flex flex-col gap-1 border-b border-borde pb-4">
        <h1 className="text-2xl font-bold text-texto-primario">Control de piso</h1>
        <p className="text-sm text-texto-secundario">
          Registra tiempo, piezas y material. Las operaciones se validan en el servidor.
        </p>
      </header>

      {ordenActiva ? (
        <section
          className="flex flex-col gap-2 rounded-lg border border-borde border-l-4 border-l-acento bg-acento-suave p-4"
          aria-label="Mi OP activa"
          data-testid="mi-op-activa"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-texto-primario">MI OP ACTIVA</h2>
            <BadgeEstado estado={ordenActiva.orden.estado} />
          </div>
          <p className="font-mono text-xl font-bold tracking-wide text-texto-primario">
            {ordenActiva.orden.folio}
            {ordenActiva.orden.esInterna && (
              <span
                className="ml-2 rounded-full bg-superficie-2 px-2 py-0.5 align-middle text-[10px] font-semibold text-texto-secundario"
                title="Trabajo interno (TI): no genera cobranza"
              >
                TI
              </span>
            )}
          </p>
          {partidaActiva ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-texto-secundario">
                {partidaActiva.descripcion ?? partidaActiva.codigoPieza} · Equipo/estación:{' '}
                {partidaActiva.maquinaAsignada ?? 'por definir'} · Avance:{' '}
                {partidaActiva.cantidadProducida}/{partidaActiva.cantidadSolicitada}{' '}
                {partidaActiva.unidadMedida}
              </p>
              <p className="text-sm text-texto-secundario" data-testid="detalle-partida-piso">
                Área:{' '}
                {partidaActiva.areaTrabajoCodigo
                  ? (nombrePorArea.get(partidaActiva.areaTrabajoCodigo) ?? partidaActiva.areaTrabajoCodigo)
                  : 'por definir'}
                {' · '}Responsable: {nombreOperador ?? 'Operador'}
              </p>
              <BarraProgreso
                valor={porcentajePartidaActiva}
                mostrarPorcentaje
                etiqueta={`Avance de ${partidaActiva.codigoPieza}`}
              />
            </div>
          ) : (
            <p className="text-sm text-texto-secundario">La orden no tiene partidas registradas.</p>
          )}
        </section>
      ) : null}

      {ordenesVisibles.length === 0 ? (
        <p className="rounded-lg border border-borde bg-superficie p-4 text-sm text-texto-secundario">
          No tienes partidas en esta área.
        </p>
      ) : (
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="selector-orden-piso" className="text-sm font-medium text-texto-secundario">
            Orden en proceso
          </label>
          <Select
            id="selector-orden-piso"
            data-testid="selector-orden-piso"
            value={ordenActiva?.orden.id ?? ''}
            onChange={(evento) => seleccionarOrdenPiso(evento.target.value)}
          >
            {ordenesVisibles.map(({ orden }) => (
              <option key={orden.id} value={orden.id}>
                {orden.folio}
                {orden.esInterna ? ' · TI' : ''}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="selector-partida-piso" className="text-sm font-medium text-texto-secundario">
            Partida
          </label>
          <Select
            id="selector-partida-piso"
            data-testid="selector-partida-piso"
            value={partidaActiva?.id ?? ''}
            onChange={(evento) => seleccionarPartidaPiso(evento.target.value)}
          >
            {(ordenActiva?.partidas ?? []).map((partida) => (
              <option key={partida.id} value={partida.id}>
                {partida.codigoPieza} — {partida.cantidadProducida}/{partida.cantidadSolicitada}{' '}
                {partida.unidadMedida}
              </option>
            ))}
          </Select>
        </div>

        {/* OBS-09: filtro por área sobre las partidas asignadas al operador. */}
        <div className="flex flex-col gap-1">
          <label htmlFor="selector-area-piso" className="text-sm font-medium text-texto-secundario">
            Área de taller
          </label>
          <Select
            id="selector-area-piso"
            data-testid="selector-area-piso"
            value={areaFiltro}
            onChange={(evento) => setAreaFiltro(evento.target.value)}
          >
            <option value="">Todas mis áreas</option>
            {opcionesArea.map((opcion) => (
              <option key={opcion.codigo} value={opcion.codigo}>
                {opcion.nombre}
              </option>
            ))}
          </Select>
        </div>
      </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4">
          <h2 className="text-lg font-semibold text-texto-primario">Tiempo de operación</h2>
          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              tamano="piso"
              data-testid="iniciar-tiempo"
              onClick={() => void registrarTiempo('inicio')}
              disabled={operacion !== null || !partidaActiva}
              className="w-full"
            >
              Inicio
            </Button>
            <Button
              type="button"
              variante="contorno"
              tamano="piso"
              onClick={() => void registrarTiempo('pausa')}
              disabled={operacion !== null || !partidaActiva}
              className="w-full"
            >
              Pausa
            </Button>
            <Button
              type="button"
              variante="contorno"
              tamano="piso"
              onClick={() => void registrarTiempo('fin')}
              disabled={operacion !== null || !partidaActiva}
              className="w-full"
            >
              Fin
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4">
          <h2 className="text-lg font-semibold text-texto-primario">Piezas y scrap</h2>
          <label className="flex flex-col gap-1 text-sm text-texto-secundario" htmlFor="cantidad-producida">
            Piezas producidas
            <Input
              id="cantidad-producida"
              data-testid="cantidad-producida"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={cantidadProducida}
              onChange={(evento) => setCantidadProducida(evento.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-texto-secundario" htmlFor="cantidad-scrap-fabricacion">
            Scrap de fabricación
            <Input
              id="cantidad-scrap-fabricacion"
              data-testid="cantidad-scrap-fabricacion"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={cantidadScrapFabricacion}
              onChange={(evento) => setCantidadScrapFabricacion(evento.target.value)}
            />
          </label>
          <Button
            type="button"
            tamano="piso"
            data-testid="registrar-avance"
            onClick={() => void registrarAvance()}
            disabled={operacion !== null || !partidaActiva}
            className="w-full"
          >
            Registrar avance
          </Button>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4">
          <h2 className="text-lg font-semibold text-texto-primario">Consumo de material</h2>
          <label className="flex flex-col gap-1 text-sm text-texto-secundario" htmlFor="material-consumo">
            Material
            <Select
              id="material-consumo"
              data-testid="material-consumo"
              value={materialSeleccionadoId}
              onChange={(evento) => setMaterialId(evento.target.value)}
            >
              <option value="">Selecciona un material</option>
              {materiales.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.codigo} — {material.nombre} ({material.stockActualControl}{' '}
                  {material.unidadControl})
                </option>
              ))}
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm text-texto-secundario" htmlFor="cantidad-consumo">
              Usado
              <Input
                id="cantidad-consumo"
                data-testid="cantidad-consumo"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={cantidadUsada}
                onChange={(evento) => setCantidadUsada(evento.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-texto-secundario" htmlFor="cantidad-scrap-material">
              Merma
              <Input
                id="cantidad-scrap-material"
                data-testid="cantidad-scrap-material"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={cantidadScrapMaterial}
                onChange={(evento) => setCantidadScrapMaterial(evento.target.value)}
              />
            </label>
          </div>
          <Button
            type="button"
            tamano="piso"
            data-testid="registrar-consumo"
            onClick={() => void registrarConsumo()}
            disabled={operacion !== null || !partidaActiva || materialSeleccionadoId === ''}
            className="w-full"
          >
            Registrar consumo
          </Button>
        </section>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-peligro/40 bg-peligro-suave px-3 py-2 text-sm font-medium text-peligro-texto">
          {error}
        </p>
      )}
      {mensaje && (
        <p role="status" className="rounded-md border border-exito/40 bg-exito-suave px-3 py-2 text-sm font-medium text-exito-texto">
          {mensaje}
        </p>
      )}
    </section>
  );
}
