'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import {
  PRIORIDADES_ORDEN_PRODUCCION,
  type PrioridadOrden,
} from '@/modulos/ordenes/tipos/ordenes';
import type { OrdenCreada } from '@/modulos/ordenes/servicios/ordenes-servicio';

export type ClienteOpcion = { id: string; nombre: string };
export type MaterialOpcion = { id: string; codigo: string; nombre: string };

/**
 * Estado de una partida en el formulario. Los campos numéricos se guardan como
 * texto para no forzar valores mientras el usuario escribe; se convierten al enviar.
 */
type PartidaFormulario = {
  codigoPieza: string;
  descripcion: string;
  cantidadSolicitada: string;
  unidadMedida: string;
  materialId: string;
  tiempoEstimadoMinutos: string;
  maquinaAsignada: string;
};

const ETIQUETA_PRIORIDAD: Record<PrioridadOrden, string> = {
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

const CLASE_INPUT =
  'w-full rounded-base border border-foreground/20 bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primario focus:ring-2 focus:ring-primario/30';
const CLASE_ETIQUETA = 'text-xs font-medium text-foreground/70';
const CLASE_BOTON_PRIMARIO =
  'rounded-base bg-primario px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const CLASE_BOTON_SECUNDARIO =
  'rounded-base border border-foreground/20 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40';

function partidaVacia(): PartidaFormulario {
  return {
    codigoPieza: '',
    descripcion: '',
    cantidadSolicitada: '1',
    unidadMedida: 'pza',
    materialId: '',
    tiempoEstimadoMinutos: '0',
    maquinaAsignada: '',
  };
}

/** Entrada enviada a la Server Action; la validación definitiva es Zod en el servidor. */
type PartidaEnviada = {
  codigoPieza: string;
  descripcion?: string;
  cantidadSolicitada: number;
  unidadMedida: string;
  materialId?: string;
  tiempoEstimadoMinutos: number;
  maquinaAsignada?: string;
};

function aPartidaEnviada(partida: PartidaFormulario): PartidaEnviada {
  const descripcion = partida.descripcion.trim();
  const maquina = partida.maquinaAsignada.trim();

  return {
    codigoPieza: partida.codigoPieza.trim(),
    ...(descripcion === '' ? {} : { descripcion }),
    cantidadSolicitada: Number(partida.cantidadSolicitada),
    unidadMedida: partida.unidadMedida.trim(),
    ...(partida.materialId === '' ? {} : { materialId: partida.materialId }),
    tiempoEstimadoMinutos: Number(partida.tiempoEstimadoMinutos) || 0,
    ...(maquina === '' ? {} : { maquinaAsignada: maquina }),
  };
}

/**
 * Validación mínima de UX (la definitiva vive en la Server Action con Zod):
 * evita enviar cantidades no numéricas o campos obligatorios vacíos.
 */
function validarEnCliente(
  clienteId: string,
  fechaCompromiso: string,
  partidas: PartidaFormulario[],
): string | null {
  if (clienteId === '') return 'Selecciona un cliente.';
  if (fechaCompromiso === '') return 'Indica la fecha compromiso.';

  for (const [indice, partida] of partidas.entries()) {
    const numero = indice + 1;
    if (partida.codigoPieza.trim() === '') {
      return `La partida ${numero} requiere código de pieza.`;
    }
    if (partida.unidadMedida.trim() === '') {
      return `La partida ${numero} requiere unidad de medida.`;
    }
    const cantidad = Number(partida.cantidadSolicitada);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return `La cantidad de la partida ${numero} debe ser mayor a 0.`;
    }
    const tiempo = Number(partida.tiempoEstimadoMinutos);
    if (!Number.isFinite(tiempo) || tiempo < 0) {
      return `El tiempo estimado de la partida ${numero} no puede ser negativo.`;
    }
  }

  return null;
}

/**
 * Convierte la fecha del input (`YYYY-MM-DD`, zona local) a ISO 8601 completo,
 * que es lo que exige `esquemaCrearOrden` (`z.iso.datetime()`).
 */
function aFechaIso(fecha: string): string {
  const instante = new Date(`${fecha}T00:00:00`);
  return Number.isNaN(instante.getTime()) ? '' : instante.toISOString();
}

type PropsFormularioOrden = {
  clientes: ClienteOpcion[];
  materiales: MaterialOpcion[];
  alCrearOrden: (entrada: unknown) => Promise<RespuestaAccion<OrdenCreada>>;
};

/**
 * Alta manual de una orden de producción: cabecera (cliente, fecha compromiso,
 * prioridad) más una o más partidas editables. Al éxito limpia el formulario y
 * solicita una revalidación inmediata de datos tras la creación.
 */
export function FormularioOrden({ clientes, materiales, alCrearOrden }: PropsFormularioOrden) {
  const router = useRouter();
  const idBase = useId();

  const [clienteId, setClienteId] = useState('');
  const [fechaCompromiso, setFechaCompromiso] = useState('');
  const [prioridad, setPrioridad] = useState<PrioridadOrden>('normal');
  const [partidas, setPartidas] = useState<PartidaFormulario[]>(() => [partidaVacia()]);

  const [error, setError] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    const marco = requestAnimationFrame(() => setHidratado(true));
    return () => cancelAnimationFrame(marco);
  }, []);

  function actualizarPartida(
    indice: number,
    campo: keyof PartidaFormulario,
    valor: string,
  ): void {
    setPartidas((previas) =>
      previas.map((partida, i) => (i === indice ? { ...partida, [campo]: valor } : partida)),
    );
  }

  function agregarPartida(): void {
    setPartidas((previas) => [...previas, partidaVacia()]);
  }

  function quitarPartida(indice: number): void {
    setPartidas((previas) =>
      previas.length <= 1 ? previas : previas.filter((_, i) => i !== indice),
    );
  }

  function reiniciarFormulario(): void {
    setClienteId('');
    setFechaCompromiso('');
    setPrioridad('normal');
    setPartidas([partidaVacia()]);
  }

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    setMensajeExito(null);

    const problema = validarEnCliente(clienteId, fechaCompromiso, partidas);
    if (problema !== null) {
      setError(problema);
      return;
    }

    setEnviando(true);
    try {
      const respuesta = await alCrearOrden({
        clienteId,
        prioridad,
        fechaCompromiso: aFechaIso(fechaCompromiso),
        partidas: partidas.map(aPartidaEnviada),
      });

      if (respuesta.exito) {
        setMensajeExito(
          respuesta.datos ? `Orden ${respuesta.datos.folio} creada.` : 'Orden creada.',
        );
        reiniciarFormulario();
        router.refresh();
      } else {
        setError(respuesta.error);
      }
    } catch {
      setError('No se pudo crear la orden. Intenta de nuevo.');
    }
    setEnviando(false);
  }

  return (
    <form
      onSubmit={manejarEnvio}
      data-testid="crear-orden"
      data-hidratado={hidratado ? 'true' : 'false'}
      aria-busy={enviando}
      className="flex flex-col gap-5"
      noValidate
    >
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idBase}-cliente`} className={CLASE_ETIQUETA}>
            Cliente
          </label>
          <select
            id={`${idBase}-cliente`}
            value={clienteId}
            onChange={(evento) => setClienteId(evento.target.value)}
            className={CLASE_INPUT}
            required
          >
            <option value="">Selecciona un cliente</option>
            {clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${idBase}-fecha`} className={CLASE_ETIQUETA}>
            Fecha compromiso
          </label>
          <input
            id={`${idBase}-fecha`}
            type="date"
            value={fechaCompromiso}
            onChange={(evento) => setFechaCompromiso(evento.target.value)}
            className={CLASE_INPUT}
            required
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${idBase}-prioridad`} className={CLASE_ETIQUETA}>
            Prioridad
          </label>
          <select
            id={`${idBase}-prioridad`}
            value={prioridad}
            onChange={(evento) => setPrioridad(evento.target.value as PrioridadOrden)}
            className={CLASE_INPUT}
          >
            {PRIORIDADES_ORDEN_PRODUCCION.map((valor) => (
              <option key={valor} value={valor}>
                {ETIQUETA_PRIORIDAD[valor]}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="flex flex-col gap-3">
        {partidas.map((partida, indice) => (
          <fieldset
            key={indice}
            className="flex flex-col gap-3 rounded-base border border-foreground/10 p-3"
          >
            <legend className="px-1 text-sm font-semibold">Partida {indice + 1}</legend>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor={`${idBase}-codigo-${indice}`} className={CLASE_ETIQUETA}>
                  Código de pieza
                </label>
                <input
                  id={`${idBase}-codigo-${indice}`}
                  data-testid="partida-codigo"
                  type="text"
                  value={partida.codigoPieza}
                  onChange={(evento) =>
                    actualizarPartida(indice, 'codigoPieza', evento.target.value)
                  }
                  className={CLASE_INPUT}
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={`${idBase}-descripcion-${indice}`} className={CLASE_ETIQUETA}>
                  Descripción (opcional)
                </label>
                <input
                  id={`${idBase}-descripcion-${indice}`}
                  type="text"
                  value={partida.descripcion}
                  onChange={(evento) =>
                    actualizarPartida(indice, 'descripcion', evento.target.value)
                  }
                  className={CLASE_INPUT}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="flex flex-col gap-1">
                <label htmlFor={`${idBase}-cantidad-${indice}`} className={CLASE_ETIQUETA}>
                  Cantidad
                </label>
                <input
                  id={`${idBase}-cantidad-${indice}`}
                  data-testid="partida-cantidad"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={partida.cantidadSolicitada}
                  onChange={(evento) =>
                    actualizarPartida(indice, 'cantidadSolicitada', evento.target.value)
                  }
                  className={CLASE_INPUT}
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={`${idBase}-unidad-${indice}`} className={CLASE_ETIQUETA}>
                  Unidad
                </label>
                <input
                  id={`${idBase}-unidad-${indice}`}
                  type="text"
                  value={partida.unidadMedida}
                  onChange={(evento) =>
                    actualizarPartida(indice, 'unidadMedida', evento.target.value)
                  }
                  className={CLASE_INPUT}
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={`${idBase}-material-${indice}`} className={CLASE_ETIQUETA}>
                  Material (opcional)
                </label>
                <select
                  id={`${idBase}-material-${indice}`}
                  data-testid="partida-material"
                  value={partida.materialId}
                  onChange={(evento) =>
                    actualizarPartida(indice, 'materialId', evento.target.value)
                  }
                  className={CLASE_INPUT}
                >
                  <option value="">Sin material</option>
                  {materiales.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.codigo} — {material.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={`${idBase}-tiempo-${indice}`} className={CLASE_ETIQUETA}>
                  Tiempo estimado (min)
                </label>
                <input
                  id={`${idBase}-tiempo-${indice}`}
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={partida.tiempoEstimadoMinutos}
                  onChange={(evento) =>
                    actualizarPartida(indice, 'tiempoEstimadoMinutos', evento.target.value)
                  }
                  className={CLASE_INPUT}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={`${idBase}-maquina-${indice}`} className={CLASE_ETIQUETA}>
                  Máquina (opcional)
                </label>
                <input
                  id={`${idBase}-maquina-${indice}`}
                  type="text"
                  value={partida.maquinaAsignada}
                  onChange={(evento) =>
                    actualizarPartida(indice, 'maquinaAsignada', evento.target.value)
                  }
                  className={CLASE_INPUT}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => quitarPartida(indice)}
                disabled={partidas.length <= 1}
                className="text-xs font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400"
              >
                Quitar partida {indice + 1}
              </button>
            </div>
          </fieldset>
        ))}
      </div>

      <button
        type="button"
        data-testid="agregar-partida"
        onClick={agregarPartida}
        className={`${CLASE_BOTON_SECUNDARIO} self-start`}
      >
        Agregar partida
      </button>

      {error !== null && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {mensajeExito !== null && (
        <p role="status" className="text-sm text-secundario">
          {mensajeExito}
        </p>
      )}

      <button
        type="submit"
        data-testid="enviar-orden"
        disabled={enviando}
        className={`${CLASE_BOTON_PRIMARIO} self-start`}
      >
        {enviando ? 'Creando orden…' : 'Crear orden'}
      </button>
    </form>
  );
}
