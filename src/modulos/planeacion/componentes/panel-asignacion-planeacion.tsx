'use client';

import { useMemo, useState, type FormEvent } from 'react';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import {
  evaluarAsignacionTurno,
  type HuecoDisponible,
} from '@/modulos/planeacion/servicios/indice';
import { InsigniaSaturacion } from '@/modulos/planeacion/componentes/insignia-saturacion';
import {
  TURNOS_PLANEACION,
  type CargaCapacidadDiaria,
  type DesglosePartidaPlaneacion,
  type OperacionProgramablePartida,
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
import { formatearHoras } from '@/modulos/planeacion/utilidades/carga-semanal';
import {
  evaluarCompatibilidadRecurso,
  type CompatibilidadRecursosPlaneacion,
} from '@/modulos/planeacion/utilidades/compatibilidad';
import { ETIQUETA_TURNO } from '@/modulos/planeacion/utilidades/etiquetas';

/** Partida que el usuario puede asignar sin revelar datos no autorizados. */
export interface PartidaProgramablePlaneacion {
  ordenId: string;
  partidaId: string;
  etiqueta: string;
  /**
   * C9.0/P-01 B: operaciones del ruteo con su estado de programación. Con
   * operaciones el panel elige «Secuencia · Operación»; sin ruteo conserva la
   * captura manual de secuencia (partidas heredadas).
   */
  operaciones: readonly OperacionProgramablePartida[];
  /** C9.2/P06: máxima secuencia vigente + 1; 1 cuando no hay programaciones. */
  secuenciaSugerida: number;
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
      /** C9.0: nula cuando se programa una operación del ruteo. */
      secuencia: number | null;
      /** C9.0: operación del ruteo; nula en partidas heredadas. */
      metaProcesoId: string | null;
    })
  | (DatosComunesAsignacion & { tipo: 'reprogramar'; motivo: string });

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
  /** C9.2/P06: total de partidas antes del tope, para avisar «mostrando N de M». */
  partidasTotal?: number;
  /** C9.2/P10+P-04: grupos de equipo para la compatibilidad del recurso (tolerante). */
  compatibilidad?: CompatibilidadRecursosPlaneacion;
  /** C9.2/P09: hay una consulta de capacidad en curso para una fecha fuera del rango. */
  verificandoCapacidad?: boolean;
  onEnviar: (datos: DatosAsignacionPlaneacion) => Promise<ResultadoAsignacionPlaneacion>;
  onActivarPreparacion?: () => Promise<ResultadoAsignacionPlaneacion>;
  onCancelar?: () => void;
  /** Busca el siguiente día hábil con capacidad comprobada (OBS-19). */
  onProponerHueco?: (entrada: EntradaProponerHueco) => Promise<ResultadoProponerHueco>;
  /** C9.2/P09: notifica la fecha capturada para consultar capacidad fuera del rango. */
  onCambiarFecha?: (fecha: string) => void;
}

const MENSAJE_ERROR_GENERICO = 'No se pudo guardar la programación';

/** C9.0: preselecciona la primera operación pendiente del ruteo (o la primera). */
function operacionInicial(partida?: PartidaProgramablePlaneacion): string {
  const operaciones = partida?.operaciones ?? [];
  const pendiente = operaciones.find((operacion) => !operacion.programada);
  return (pendiente ?? operaciones[0])?.metaProcesoId ?? '';
}

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
  partidasTotal,
  compatibilidad,
  verificandoCapacidad = false,
  onEnviar,
  onActivarPreparacion,
  onCancelar,
  onProponerHueco,
  onCambiarFecha,
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
  const [operacionId, setOperacionId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [hueco, setHueco] = useState<{ clave: string; datos: HuecoDisponible } | null>(null);
  const [buscandoHueco, setBuscandoHueco] = useState(false);

  // C9.2/P10+P-04: compatibilidad entre el ruteo de la partida elegida y el grupo
  // del recurso. Con «sin dato» de cualquier lado no se advierte ni bloquea; los
  // compatibles se ofrecen primero y elegir otro grupo impide guardar (la RPC
  // `recurso_incompatible` conserva la última palabra).
  const partidaEfectivaId = programacion?.partidaId ?? partidaId;
  const gruposRequeridos = compatibilidad?.gruposRequeridosPorPartida[partidaEfectivaId] ?? null;
  const estadoCompatibilidadSeleccionada = evaluarCompatibilidadRecurso(
    gruposRequeridos,
    compatibilidad?.grupoPorRecurso[recursoId]?.id ?? null,
  );
  const recursosPorCompatibilidad = recursosActivos
    .map((recurso) => {
      const grupo = compatibilidad?.grupoPorRecurso[recurso.id] ?? null;
      return {
        recurso,
        grupo,
        estado: evaluarCompatibilidadRecurso(gruposRequeridos, grupo?.id ?? null),
      };
    })
    .sort((a, b) => (a.estado === 'compatible' ? 0 : 1) - (b.estado === 'compatible' ? 0 : 1));

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
    setMotivo('');
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

  // C9.0: con ruteo se programa por operación; sin ruteo se conserva la
  // secuencia manual de las partidas heredadas.
  const operacionesDePartida = programacion
    ? []
    : partidasProgramables.find((partida) => partida.partidaId === partidaId)?.operaciones ?? [];
  const usaOperaciones = operacionesDePartida.length > 0;
  const operacionElegida = operacionesDePartida.find(
    (operacion) => operacion.metaProcesoId === operacionId,
  );

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
  // C9.2/P09: el aviso dice cuántas horas se exceden, con las horas del turno.
  const excesoHoras = Math.max(0, evaluacion.horasProgramadas - evaluacion.horasCapacidad);
  const textoAvisoCapacidad = evaluacion.sinCapacidad
    ? 'El recurso no tiene capacidad disponible en el turno seleccionado. Puedes buscar el siguiente día hábil con hueco.'
    : `Excede la capacidad por ${formatearHoras(excesoHoras)} h (${formatearHoras(evaluacion.horasProgramadas)}/${formatearHoras(evaluacion.horasCapacidad)} h). Puedes buscar el siguiente día hábil con hueco.`;
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
    onCambiarFecha?.(huecoVigente.fecha);
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
    if (programacion && motivo.trim().length < 3) {
      setErrorFormulario('Indica el motivo de la reprogramación');
      return;
    }
    if (!programacion && partidaId === '') {
      setErrorFormulario('Selecciona una partida');
      return;
    }
    if (!programacion && usaOperaciones && operacionId === '') {
      setErrorFormulario('Selecciona la operación del ruteo');
      return;
    }
    if (
      !programacion
      && !usaOperaciones
      && (!Number.isInteger(secuenciaNumerica) || secuenciaNumerica <= 0)
    ) {
      setErrorFormulario('Indica una secuencia válida');
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
            motivo: motivo.trim(),
          }
        : (() => {
            const partida = partidasProgramables.find((actual) => actual.partidaId === partidaId);
            if (!partida) return null;
            const conOperaciones = partida.operaciones.length > 0;
            return {
              tipo: 'crear' as const,
              ordenId: partida.ordenId,
              partidaId: partida.partidaId,
              secuencia: conOperaciones ? null : secuenciaNumerica,
              metaProcesoId: conOperaciones ? operacionId : null,
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
      aria-label={programacion ? 'Reprogramar partida' : 'Programar partida'}
      noValidate
    >
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
              <dt className="text-texto-secundario">Equipo / estación</dt>
              <dd>{textoODefecto(desgloseSeleccionado.maquinaAsignada)}</dd>
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
              onChange={(evento) => {
                const nuevaPartidaId = evento.target.value;
                setPartidaId(nuevaPartidaId);
                const partidaElegida = partidasProgramables.find(
                  (partida) => partida.partidaId === nuevaPartidaId,
                );
                setOperacionId(operacionInicial(partidaElegida));
                setSecuencia(String(partidaElegida?.secuenciaSugerida ?? 1));
              }}
            >
              <option value="">Selecciona una partida</option>
              {partidasProgramables.map((partida) => (
                <option key={partida.partidaId} value={partida.partidaId}>{partida.etiqueta}</option>
              ))}
            </Select>
          </div>
          {partidasTotal !== undefined && partidasTotal > partidasProgramables.length ? (
            <p
              role="status"
              className="text-xs text-texto-secundario"
              data-testid="aviso-partidas-truncadas-planeacion"
            >
              Mostrando {partidasProgramables.length} de {partidasTotal} partidas.
            </p>
          ) : null}
          {usaOperaciones ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="planeacion-operacion">Operación</Label>
              <Select
                id="planeacion-operacion"
                value={operacionId}
                onChange={(evento) => setOperacionId(evento.target.value)}
              >
                <option value="">Selecciona una operación</option>
                {operacionesDePartida.map((operacion) => (
                  <option key={operacion.metaProcesoId} value={operacion.metaProcesoId}>
                    {operacion.secuencia} · {operacion.nombre}
                    {operacion.programada ? ' (ya programada)' : ''}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
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
          )}
        </>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex flex-col gap-1">
          <Label htmlFor="planeacion-recurso">Recurso</Label>
          <Select
            id="planeacion-recurso"
            value={recursoId}
            onChange={(evento) => setRecursoId(evento.target.value)}
          >
            <option value="">Selecciona un recurso</option>
            {recursosPorCompatibilidad.map(({ recurso, grupo, estado }) => (
              <option key={recurso.id} value={recurso.id}>
                {recurso.codigo} · {recurso.nombre} — {grupo?.nombre ?? 'sin grupo'}
                {estado === 'incompatible' ? ' (otro grupo)' : ''}
              </option>
            ))}
          </Select>
          {estadoCompatibilidadSeleccionada === 'incompatible' ? (
            <p
              role="status"
              className="text-xs text-peligro-texto"
              data-testid="aviso-compatibilidad-planeacion"
            >
              El recurso es de otro grupo de equipo del que pide el ruteo de la partida. Elige un
              equipo compatible para guardar.
            </p>
          ) : null}
        </div>

        {programacion ? (
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="planeacion-motivo">Motivo de la reprogramación</Label>
            <Textarea
              id="planeacion-motivo"
              value={motivo}
              maxLength={500}
              rows={2}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Ej. Ajuste por disponibilidad de máquina"
            />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="planeacion-fecha">Fecha programada</Label>
          <Input
            id="planeacion-fecha"
            type="date"
            value={fechaProgramada}
            onChange={(evento) => {
              setFechaProgramada(evento.target.value);
              onCambiarFecha?.(evento.target.value);
            }}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1">
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

        <div className="flex min-w-0 flex-col gap-1">
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

        <details className="col-span-2">
          <summary className="cursor-pointer text-xs font-medium text-texto-secundario">
            Opciones avanzadas (prioridad)
          </summary>
          <div className="mt-2 flex flex-col gap-1">
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
        </details>
      </div>

      {puedePrevisualizar ? (
        <section
          className="flex flex-col gap-1 rounded-base border border-borde p-3 text-xs"
          aria-label="Resumen antes de guardar"
          data-testid="resumen-programacion-planeacion"
        >
          <p className="font-medium">Capacidad del turno</p>
          {!programacion && operacionElegida ? (
            <p>Operación: {operacionElegida.secuencia} · {operacionElegida.nombre}</p>
          ) : null}
          {programacion?.operacionNombre ? (
            <p>Operación: {programacion.secuencia} · {programacion.operacionNombre}</p>
          ) : null}
          <p>
            {programacion ? 'Reprogramar' : 'Programar'} en{' '}
            {recursos.find((recurso) => recurso.id === recursoId)?.codigo ?? 'recurso'} ·{' '}
            {fechaProgramada} · {ETIQUETA_TURNO[turno]} · {horasNumero} h · prioridad{' '}
            {ordenPrioridad || '1'}
          </p>
          {verificandoCapacidad ? (
            <p
              role="status"
              className="text-texto-secundario"
              data-testid="verificando-capacidad-planeacion"
            >
              Verificando capacidad…
            </p>
          ) : (
            <p className={evaluacion.cabe ? 'text-texto-secundario' : 'text-peligro-texto'}>
              {evaluacion.sinCapacidad
                ? 'Sin capacidad configurada para ese recurso, fecha y turno'
                : `Capacidad tras guardar: ${evaluacion.horasProgramadas}/${evaluacion.horasCapacidad} h · quedan ${evaluacion.holguraHoras} h`}
            </p>
          )}
          {!verificandoCapacidad && !evaluacion.cabe ? (
            <p
              role="status"
              className="flex items-center gap-1.5 text-peligro-texto"
              data-testid="aviso-capacidad-insuficiente"
            >
              {!evaluacion.sinCapacidad ? (
                <InsigniaSaturacion
                  nivel="sobrecargado"
                  variante="celda"
                  horasProgramadas={evaluacion.horasProgramadas}
                  horasCapacidad={evaluacion.horasCapacidad}
                />
              ) : null}
              {textoAvisoCapacidad}
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

      <p role="alert" aria-live="assertive" className="min-h-4 text-xs text-peligro-texto">
        {errorFormulario ?? ''}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={enviando || preparando || estadoCompatibilidadSeleccionada === 'incompatible'}
          data-testid="guardar-asignacion-planeacion"
        >
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
