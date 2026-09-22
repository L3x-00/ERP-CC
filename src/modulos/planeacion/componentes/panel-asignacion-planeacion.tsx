'use client';

import { useMemo, useState, type FormEvent } from 'react';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import {
  evaluarAsignacionTurno,
  type HuecoDisponible,
} from '@/modulos/planeacion/servicios/indice';
import {
  TURNOS_PLANEACION,
  type CargaCapacidadDiaria,
  type DesglosePartidaPlaneacion,
  type ProgramacionArea,
  type RecursoPlaneacion,
  type TurnoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';
import {
  etiquetaArea,
  etiquetaAvancePartida,
  etiquetaMaterial,
  etiquetaProcesos,
  formatearDuracionMinutos,
  textoODefecto,
} from '@/modulos/planeacion/utilidades/desglose';
import { ETIQUETA_TURNO } from '@/modulos/planeacion/utilidades/etiquetas';

/** Partida que el usuario puede asignar sin revelar datos no autorizados. */
export interface PartidaProgramablePlaneacion {
  ordenId: string;
  partidaId: string;
  etiqueta: string;
}

type DatosComunesAsignacion = {
  recursoId: string;
  fechaProgramada: string;
  turno: TurnoPlaneacion;
  horasEstimadas: number;
  ordenPrioridad: number;
};

/** Datos discriminados: crear requiere una partida; reprogramar no permite alterarla. */
export type DatosAsignacionPlaneacion =
  | (DatosComunesAsignacion & {
      tipo: 'crear';
      ordenId: string;
      partidaId: string;
      secuencia: number;
    })
  | (DatosComunesAsignacion & { tipo: 'reprogramar' });

/** Resultado estándar de las Server Actions, sin adaptar ni exponer errores internos. */
export type ResultadoAsignacionPlaneacion = RespuestaAccion<unknown>;

/** Resultado de la búsqueda del primer día hábil con hueco (OBS-19). */
export type ResultadoProponerHueco = RespuestaAccion<HuecoDisponible | null>;

export interface EntradaProponerHueco {
  recursoId: string;
  turno: TurnoPlaneacion;
  horasEstimadas: number;
  desdeFecha: string;
}

export interface PropsPanelAsignacionPlaneacion {
  recursos: readonly RecursoPlaneacion[];
  partidasProgramables: readonly PartidaProgramablePlaneacion[];
  /** Programación en edición; si viene, el panel reprograma en vez de crear. */
  programacion?: ProgramacionArea | null;
  /** Desglose de negocio de las partidas (OBS-08). */
  desglosePartidas?: readonly DesglosePartidaPlaneacion[];
  /** Carga confirmada del rango visible para la previsualización de capacidad. */
  cargas?: readonly CargaCapacidadDiaria[];
  onEnviar: (datos: DatosAsignacionPlaneacion) => Promise<ResultadoAsignacionPlaneacion>;
  onActivarPreparacion?: () => Promise<ResultadoAsignacionPlaneacion>;
  onCancelar?: () => void;
  /** Busca el siguiente día hábil con capacidad comprobada (OBS-19). */
  onProponerHueco?: (entrada: EntradaProponerHueco) => Promise<ResultadoProponerHueco>;
}

const MENSAJE_ERROR_GENERICO = 'No se pudo guardar la programación';

/**
 * Panel de asignación/reprogramación. Solo valida la forma del formulario;
 * capacidad, candados y concurrencia pertenecen a la RPC transaccional. La
 * previsualización y la propuesta de hueco son ayudas de UI, nunca autorización.
 */
export function PanelAsignacionPlaneacion({
  recursos,
  partidasProgramables,
  programacion,
  desglosePartidas = [],
  cargas = [],
  onEnviar,
  onActivarPreparacion,
  onCancelar,
  onProponerHueco,
}: PropsPanelAsignacionPlaneacion) {
  const recursosActivos = recursos.filter((recurso) => recurso.activo);
  const [partidaId, setPartidaId] = useState('');
  const [recursoId, setRecursoId] = useState(programacion?.recursoId ?? '');
  const [fechaProgramada, setFechaProgramada] = useState(programacion?.fechaProgramada ?? '');
  const [turno, setTurno] = useState<TurnoPlaneacion>(programacion?.turno ?? 'matutino');
  const [horasEstimadas, setHorasEstimadas] = useState(
    programacion ? String(programacion.horasEstimadas) : '',
  );
  const [ordenPrioridad, setOrdenPrioridad] = useState(
    programacion ? String(programacion.ordenPrioridad) : '1',
  );
  const [secuencia, setSecuencia] = useState('1');
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [hueco, setHueco] = useState<{ clave: string; datos: HuecoDisponible } | null>(null);
  const [buscandoHueco, setBuscandoHueco] = useState(false);

  const desglosePorId = useMemo(
    () => new Map(desglosePartidas.map((desglose) => [desglose.partidaId, desglose])),
    [desglosePartidas],
  );

  // Al cambiar la selección, el formulario refleja el estado confirmado por
  // servidor sin duplicar programaciones en Zustand.
  const claveProgramacion = programacion?.id ?? '';
  const [clavePrevia, setClavePrevia] = useState(claveProgramacion);
  if (claveProgramacion !== clavePrevia) {
    setClavePrevia(claveProgramacion);
    setRecursoId(programacion?.recursoId ?? '');
    setFechaProgramada(programacion?.fechaProgramada ?? '');
    setTurno(programacion?.turno ?? 'matutino');
    setHorasEstimadas(programacion ? String(programacion.horasEstimadas) : '');
    setOrdenPrioridad(programacion ? String(programacion.ordenPrioridad) : '1');
    setErrorFormulario(null);
    setHueco(null);
  }

  // La propuesta solo es válida para los insumos con los que se calculó: si el
  // usuario cambia recurso, fecha, turno u horas, deja de mostrarse sin efectos.
  const claveFormulario = `${recursoId}|${fechaProgramada}|${turno}|${horasEstimadas}`;
  const huecoVigente = hueco && hueco.clave === claveFormulario ? hueco.datos : null;

  const desgloseSeleccionado = programacion
    ? desglosePorId.get(programacion.partidaId)
    : partidaId
      ? desglosePorId.get(partidaId)
      : undefined;
  const etiquetaPartida = programacion
    ? desgloseSeleccionado
      ? `${desgloseSeleccionado.folio} · ${desgloseSeleccionado.codigoPieza}`
      : 'Partida seleccionada'
    : partidasProgramables.find((partida) => partida.partidaId === partidaId)?.etiqueta;

  const horasNumero = Number(horasEstimadas);
  const horasValidas = Number.isFinite(horasNumero) && horasNumero > 0;
  const cargaDelSlot = cargas.find(
    (carga) =>
      carga.recursoId === recursoId
      && carga.fechaProgramada === fechaProgramada
      && carga.turno === turno,
  );
  const mismoSlot =
    programacion !== undefined
    && programacion !== null
    && programacion.recursoId === recursoId
    && programacion.fechaProgramada === fechaProgramada
    && programacion.turno === turno;
  const evaluacion = evaluarAsignacionTurno(cargaDelSlot, horasValidas ? horasNumero : 0, {
    horasEnSlot: mismoSlot && programacion ? programacion.horasEstimadas : 0,
  });
  const puedePrevisualizar = recursoId !== '' && fechaProgramada !== '' && horasValidas;

  function limpiarEstadoBuscador(): void {
    setHueco(null);
    setErrorFormulario(null);
  }

  async function buscarHueco(): Promise<void> {
    if (!onProponerHueco || buscandoHueco || enviando || preparando || !horasValidas) return;
    limpiarEstadoBuscador();
    setBuscandoHueco(true);
    try {
      const resultado = await onProponerHueco({
        recursoId,
        turno,
        horasEstimadas: horasNumero,
        desdeFecha: fechaProgramada,
      });
      if (!resultado.exito) {
        setErrorFormulario(resultado.error);
        return;
      }
      if (!resultado.datos) {
        setErrorFormulario('No se encontró un día hábil con capacidad en los próximos días');
        return;
      }
      setHueco({ clave: claveFormulario, datos: resultado.datos });
    } catch {
      setErrorFormulario('No se pudo buscar un hueco disponible');
    } finally {
      setBuscandoHueco(false);
    }
  }

  function usarHueco(): void {
    if (!huecoVigente) return;
    setFechaProgramada(huecoVigente.fecha);
    setHueco(null);
    setErrorFormulario(null);
  }

  async function alEnviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (enviando || preparando) return;

    const horas = Number(horasEstimadas);
    const prioridad = Number(ordenPrioridad);
    const secuenciaNumerica = Number(secuencia);

    if (recursoId === '' || fechaProgramada === '') {
      setErrorFormulario('Selecciona un recurso y una fecha');
      return;
    }
    if (!Number.isFinite(horas) || horas <= 0 || horas > 24) {
      setErrorFormulario('Las horas estimadas deben ser mayores a 0 y no exceder 24');
      return;
    }
    if (!Number.isInteger(prioridad) || prioridad <= 0) {
      setErrorFormulario('La prioridad debe ser un entero mayor a 0');
      return;
    }
    if (
      !programacion
      && (partidaId === '' || !Number.isInteger(secuenciaNumerica) || secuenciaNumerica <= 0)
    ) {
      setErrorFormulario('Selecciona una partida e indica una secuencia válida');
      return;
    }

    setErrorFormulario(null);
    setEnviando(true);
    try {
      const datos = programacion
        ? {
            tipo: 'reprogramar' as const,
            recursoId,
            fechaProgramada,
            turno,
            horasEstimadas: horas,
            ordenPrioridad: prioridad,
          }
        : (() => {
            const partida = partidasProgramables.find((actual) => actual.partidaId === partidaId);
            if (!partida) return null;
            return {
              tipo: 'crear' as const,
              ordenId: partida.ordenId,
              partidaId: partida.partidaId,
              secuencia: secuenciaNumerica,
              recursoId,
              fechaProgramada,
              turno,
              horasEstimadas: horas,
              ordenPrioridad: prioridad,
            };
          })();
      if (!datos) {
        setErrorFormulario('La partida seleccionada ya no está disponible');
        return;
      }

      const resultado = await onEnviar(datos);
      if (!resultado.exito) setErrorFormulario(resultado.error || MENSAJE_ERROR_GENERICO);
      else setHueco(null);
    } catch {
      setErrorFormulario(MENSAJE_ERROR_GENERICO);
    } finally {
      setEnviando(false);
    }
  }

  async function activarPreparacion(): Promise<void> {
    if (!onActivarPreparacion || preparando || enviando) return;
    setErrorFormulario(null);
    setPreparando(true);
    try {
      const resultado = await onActivarPreparacion();
      if (!resultado.exito) setErrorFormulario(resultado.error || MENSAJE_ERROR_GENERICO);
    } catch {
      setErrorFormulario('No se pudo activar la preparación');
    } finally {
      setPreparando(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(evento) => void alEnviar(evento)}
      data-testid="panel-asignacion-planeacion"
      noValidate
    >
      <h2 className="text-sm font-medium">
        {programacion ? 'Reprogramar partida' : 'Programar partida'}
      </h2>

      {desgloseSeleccionado ? (
        <section
          className="flex flex-col gap-1 rounded-base border border-borde bg-superficie-2 p-3 text-xs"
          aria-label="Desglose de fabricación"
          data-testid="desglose-partida-planeacion"
        >
          <p className="font-mono text-[11px] font-medium">
            {desgloseSeleccionado.folio} · {desgloseSeleccionado.codigoPieza}
          </p>
          <p className="text-texto-secundario">{textoODefecto(desgloseSeleccionado.descripcion)}</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <div>
              <dt className="text-texto-secundario">Área</dt>
              <dd>{etiquetaArea(desgloseSeleccionado)}</dd>
            </div>
            <div>
              <dt className="text-texto-secundario">Procesos</dt>
              <dd>{etiquetaProcesos(desgloseSeleccionado)}</dd>
            </div>
            <div>
              <dt className="text-texto-secundario">Material</dt>
              <dd>{etiquetaMaterial(desgloseSeleccionado)}</dd>
            </div>
            <div>
              <dt className="text-texto-secundario">Tiempo estimado</dt>
              <dd>{formatearDuracionMinutos(desgloseSeleccionado.tiempoEstimadoMinutos)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-texto-secundario">Avance</dt>
              <dd>{etiquetaAvancePartida(desgloseSeleccionado)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {!programacion ? (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="planeacion-partida">Partida</Label>
            <Select
              id="planeacion-partida"
              value={partidaId}
              onChange={(evento) => setPartidaId(evento.target.value)}
            >
              <option value="">Selecciona una partida</option>
              {partidasProgramables.map((partida) => (
                <option key={partida.partidaId} value={partida.partidaId}>{partida.etiqueta}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="planeacion-secuencia">Secuencia</Label>
            <Input
              id="planeacion-secuencia"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={secuencia}
              onChange={(evento) => setSecuencia(evento.target.value)}
            />
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-1">
        <Label htmlFor="planeacion-recurso">Recurso</Label>
        <Select
          id="planeacion-recurso"
          value={recursoId}
          onChange={(evento) => setRecursoId(evento.target.value)}
        >
          <option value="">Selecciona un recurso</option>
          {recursosActivos.map((recurso) => (
            <option key={recurso.id} value={recurso.id}>
              {recurso.codigo} · {recurso.nombre}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="planeacion-fecha">Fecha programada</Label>
        <Input
          id="planeacion-fecha"
          type="date"
          value={fechaProgramada}
          onChange={(evento) => setFechaProgramada(evento.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="planeacion-turno">Turno</Label>
        <Select
          id="planeacion-turno"
          value={turno}
          onChange={(evento) => setTurno(evento.target.value as TurnoPlaneacion)}
        >
          {TURNOS_PLANEACION.map((valor) => (
            <option key={valor} value={valor}>{ETIQUETA_TURNO[valor]}</option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="planeacion-horas">Horas estimadas</Label>
        <Input
          id="planeacion-horas"
          type="number"
          min="0.25"
          max="24"
          step="0.25"
          inputMode="decimal"
          value={horasEstimadas}
          onChange={(evento) => setHorasEstimadas(evento.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="planeacion-prioridad">Prioridad</Label>
        <Input
          id="planeacion-prioridad"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          value={ordenPrioridad}
          onChange={(evento) => setOrdenPrioridad(evento.target.value)}
        />
      </div>

      {puedePrevisualizar ? (
        <section
          className="flex flex-col gap-1 rounded-base border border-borde p-3 text-xs"
          aria-label="Resumen antes de guardar"
          data-testid="resumen-programacion-planeacion"
        >
          <p className="font-medium">Resumen antes de guardar</p>
          {etiquetaPartida ? <p>Partida: {etiquetaPartida}</p> : null}
          <p>
            {programacion ? 'Reprogramar' : 'Programar'} en{' '}
            {recursos.find((recurso) => recurso.id === recursoId)?.codigo ?? 'recurso'} ·{' '}
            {fechaProgramada} · {ETIQUETA_TURNO[turno]} · {horasNumero} h · prioridad{' '}
            {ordenPrioridad || '1'}
          </p>
          <p className={evaluacion.cabe ? 'text-texto-secundario' : 'text-peligro-texto'}>
            {evaluacion.sinCapacidad
              ? 'Sin capacidad configurada para ese recurso, fecha y turno'
              : `Capacidad tras guardar: ${evaluacion.horasProgramadas}/${evaluacion.horasCapacidad} h · quedan ${evaluacion.holguraHoras} h`}
          </p>
          {!evaluacion.cabe ? (
            <p role="status" className="text-peligro-texto" data-testid="aviso-capacidad-insuficiente">
              El recurso no tiene capacidad disponible en el turno seleccionado. Puedes buscar el
              siguiente día hábil con hueco.
            </p>
          ) : null}
          {onProponerHueco && !evaluacion.cabe ? (
            <Button
              type="button"
              variante="secundario"
              tamano="sm"
              disabled={buscandoHueco || enviando || preparando}
              onClick={() => void buscarHueco()}
              data-testid="buscar-hueco-planeacion"
            >
              {buscandoHueco ? 'Buscando…' : 'Buscar hueco'}
            </Button>
          ) : null}
          {huecoVigente ? (
            <div
              className="flex flex-col gap-1 rounded-base border border-acento bg-superficie-2 p-2"
              data-testid="hueco-sugerido-planeacion"
            >
              <p>
                Siguiente día hábil con hueco: <strong>{huecoVigente.fecha}</strong> · quedan{' '}
                {huecoVigente.horasDisponibles} h de {huecoVigente.horasCapacidad} h.
              </p>
              <Button
                type="button"
                variante="contorno"
                tamano="sm"
                onClick={usarHueco}
                data-testid="usar-hueco-sugerido-planeacion"
              >
                Usar esta fecha
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <p role="alert" aria-live="assertive" className="min-h-4 text-xs text-red-600">
        {errorFormulario ?? ''}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={enviando || preparando} data-testid="guardar-asignacion-planeacion">
          {enviando ? 'Guardando…' : programacion ? 'Reprogramar' : 'Programar'}
        </Button>
        {programacion &&
        (programacion.estadoPlaneacion === 'programada' ||
          programacion.estadoPlaneacion === 'bloqueada') &&
        onActivarPreparacion ? (
          <Button
            type="button"
            variante="secundario"
            disabled={enviando || preparando}
            onClick={() => void activarPreparacion()}
            data-testid="activar-preparacion-planeacion"
          >
            {preparando ? 'Activando…' : 'Iniciar preparación'}
          </Button>
        ) : null}
        {onCancelar ? (
          <Button type="button" variante="contorno" onClick={onCancelar} disabled={enviando || preparando}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
