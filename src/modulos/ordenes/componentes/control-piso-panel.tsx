'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { registrarAvancePartidaAccion } from '@/modulos/ordenes/acciones/registrar-avance-partida';
import { registrarConsumoOperadorAccion } from '@/modulos/ordenes/acciones/registrar-consumo';
import { registrarTiempoOperadorAccion } from '@/modulos/ordenes/acciones/registrar-tiempo-operador';
import { usarTiendaOrdenes } from '@/estado/uso-tienda-ordenes';
import type { OrdenConPartidas } from '@/modulos/ordenes/servicios/ordenes-servicio';

export type MaterialPiso = {
  id: string;
  codigo: string;
  nombre: string;
  stockActualControl: number;
  unidadControl: string;
};

type PropsControlPisoPanel = {
  operadorId: string;
  ordenes: OrdenConPartidas[];
  materiales: MaterialPiso[];
};

type OperacionPiso = 'tiempo' | 'avance' | 'consumo' | null;

const EVENTO_OPERACION_LOCAL = 'ordenes:piso-operacion-local';

const CLASE_INPUT =
  'w-full rounded-base border border-zinc-700 bg-zinc-900 px-3 py-2 text-base text-zinc-50 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30';
const CLASE_BOTON =
  'rounded-base border border-zinc-600 px-4 py-3 text-sm font-semibold transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-45';
const CLASE_BOTON_PRIMARIO =
  'rounded-base bg-cyan-500 px-4 py-3 text-sm font-bold text-zinc-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-45';

function aNumeroPositivo(valor: string): number | null {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

/**
 * Consola de piso para sesiones PIN. Las cantidades nunca se acumulan en el
 * navegador: cada acción delega el total a una RPC transaccional de PostgreSQL.
 */
export function ControlPisoPanel({ operadorId, ordenes, materiales }: PropsControlPisoPanel) {
  const router = useRouter();
  const ordenActivaId = usarTiendaOrdenes((estado) => estado.ordenActivaId);
  const seleccionarOrden = usarTiendaOrdenes((estado) => estado.seleccionarOrden);

  const [ordenId, setOrdenId] = useState<string>(() => ordenActivaId ?? ordenes[0]?.orden.id ?? '');
  const ordenActiva = useMemo(
    () => ordenes.find((orden) => orden.orden.id === ordenId) ?? ordenes[0] ?? null,
    [ordenes, ordenId],
  );
  const [partidaId, setPartidaId] = useState<string>(() => ordenes[0]?.partidas[0]?.id ?? '');
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

  useEffect(() => {
    const marco = requestAnimationFrame(() => setHidratado(true));
    return () => cancelAnimationFrame(marco);
  }, []);

  function seleccionarOrdenPiso(nuevoOrdenId: string): void {
    const nuevaOrden = ordenes.find((orden) => orden.orden.id === nuevoOrdenId) ?? null;
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
      <section className="rounded-base border border-zinc-800 bg-zinc-900 p-6" aria-live="polite">
        <h1 className="text-lg font-bold text-zinc-50">Control de piso</h1>
        <p className="mt-2 text-zinc-400">No hay órdenes de producción en proceso.</p>
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
      <header className="flex flex-col gap-1 border-b border-zinc-800 pb-4">
        <h1 className="text-2xl font-bold text-zinc-50">Control de piso</h1>
        <p className="text-sm text-zinc-400">
          Registra tiempo, piezas y material. Las operaciones se validan en el servidor.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="selector-orden-piso" className="text-sm font-medium text-zinc-300">
            Orden en proceso
          </label>
          <select
            id="selector-orden-piso"
            data-testid="selector-orden-piso"
            value={ordenActiva?.orden.id ?? ''}
            onChange={(evento) => seleccionarOrdenPiso(evento.target.value)}
            className={CLASE_INPUT}
          >
            {ordenes.map(({ orden }) => (
              <option key={orden.id} value={orden.id}>
                {orden.folio}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="selector-partida-piso" className="text-sm font-medium text-zinc-300">
            Partida
          </label>
          <select
            id="selector-partida-piso"
            data-testid="selector-partida-piso"
            value={partidaActiva?.id ?? ''}
            onChange={(evento) => seleccionarPartidaPiso(evento.target.value)}
            className={CLASE_INPUT}
          >
            {(ordenActiva?.partidas ?? []).map((partida) => (
              <option key={partida.id} value={partida.id}>
                {partida.codigoPieza} — {partida.cantidadProducida}/{partida.cantidadSolicitada}{' '}
                {partida.unidadMedida}
              </option>
            ))}
          </select>
        </div>
      </div>

      {partidaActiva && (
        <p className="rounded-base border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
          {partidaActiva.descripcion ?? partidaActiva.codigoPieza} · Máquina:{' '}
          {partidaActiva.maquinaAsignada ?? 'sin asignar'} · Avance: {partidaActiva.cantidadProducida}/
          {partidaActiva.cantidadSolicitada} {partidaActiva.unidadMedida}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="flex flex-col gap-3 rounded-base border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="font-semibold text-zinc-50">Tiempo de operación</h2>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              data-testid="iniciar-tiempo"
              onClick={() => void registrarTiempo('inicio')}
              disabled={operacion !== null || !partidaActiva}
              className={CLASE_BOTON_PRIMARIO}
            >
              Inicio
            </button>
            <button
              type="button"
              onClick={() => void registrarTiempo('pausa')}
              disabled={operacion !== null || !partidaActiva}
              className={CLASE_BOTON}
            >
              Pausa
            </button>
            <button
              type="button"
              onClick={() => void registrarTiempo('fin')}
              disabled={operacion !== null || !partidaActiva}
              className={CLASE_BOTON}
            >
              Fin
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-base border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="font-semibold text-zinc-50">Piezas y scrap</h2>
          <label className="flex flex-col gap-1 text-sm text-zinc-300" htmlFor="cantidad-producida">
            Piezas producidas
            <input
              id="cantidad-producida"
              data-testid="cantidad-producida"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={cantidadProducida}
              onChange={(evento) => setCantidadProducida(evento.target.value)}
              className={CLASE_INPUT}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-300" htmlFor="cantidad-scrap-fabricacion">
            Scrap de fabricación
            <input
              id="cantidad-scrap-fabricacion"
              data-testid="cantidad-scrap-fabricacion"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={cantidadScrapFabricacion}
              onChange={(evento) => setCantidadScrapFabricacion(evento.target.value)}
              className={CLASE_INPUT}
            />
          </label>
          <button
            type="button"
            data-testid="registrar-avance"
            onClick={() => void registrarAvance()}
            disabled={operacion !== null || !partidaActiva}
            className={CLASE_BOTON_PRIMARIO}
          >
            Registrar avance
          </button>
        </section>

        <section className="flex flex-col gap-3 rounded-base border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="font-semibold text-zinc-50">Consumo de material</h2>
          <label className="flex flex-col gap-1 text-sm text-zinc-300" htmlFor="material-consumo">
            Material
            <select
              id="material-consumo"
              data-testid="material-consumo"
              value={materialSeleccionadoId}
              onChange={(evento) => setMaterialId(evento.target.value)}
              className={CLASE_INPUT}
            >
              <option value="">Selecciona un material</option>
              {materiales.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.codigo} — {material.nombre} ({material.stockActualControl}{' '}
                  {material.unidadControl})
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm text-zinc-300" htmlFor="cantidad-consumo">
              Usado
              <input
                id="cantidad-consumo"
                data-testid="cantidad-consumo"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={cantidadUsada}
                onChange={(evento) => setCantidadUsada(evento.target.value)}
                className={CLASE_INPUT}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-300" htmlFor="cantidad-scrap-material">
              Merma
              <input
                id="cantidad-scrap-material"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={cantidadScrapMaterial}
                onChange={(evento) => setCantidadScrapMaterial(evento.target.value)}
                className={CLASE_INPUT}
              />
            </label>
          </div>
          <button
            type="button"
            data-testid="registrar-consumo"
            onClick={() => void registrarConsumo()}
            disabled={operacion !== null || !partidaActiva || materialSeleccionadoId === ''}
            className={CLASE_BOTON_PRIMARIO}
          >
            Registrar consumo
          </button>
        </section>
      </div>

      {error && (
        <p role="alert" className="rounded-base border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      {mensaje && (
        <p role="status" className="rounded-base border border-emerald-900 bg-emerald-950 px-3 py-2 text-sm text-emerald-200">
          {mensaje}
        </p>
      )}
    </section>
  );
}
