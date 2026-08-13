'use client';

import { useState, type FormEvent } from 'react';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import {
  TURNOS_PLANEACION,
  type ProgramacionArea,
  type RecursoPlaneacion,
  type TurnoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';

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

/** Resultado est\u00e1ndar de las Server Actions, sin adaptar ni exponer errores internos. */
export type ResultadoAsignacionPlaneacion = RespuestaAccion<unknown>;

export interface PropsPanelAsignacionPlaneacion {
  recursos: readonly RecursoPlaneacion[];
  partidasProgramables: readonly PartidaProgramablePlaneacion[];
  /** Programaci\u00f3n en edici\u00f3n; si viene, el panel reprograma en vez de crear. */
  programacion?: ProgramacionArea | null;
  onEnviar: (datos: DatosAsignacionPlaneacion) => Promise<ResultadoAsignacionPlaneacion>;
  onActivarPreparacion?: () => Promise<ResultadoAsignacionPlaneacion>;
  onCancelar?: () => void;
}

const ETIQUETA_TURNO: Record<TurnoPlaneacion, string> = {
  matutino: 'Matutino',
  vespertino: 'Vespertino',
  nocturno: 'Nocturno',
};

const MENSAJE_ERROR_GENERICO = 'No se pudo guardar la programaci\u00f3n';

/**
 * Panel de asignaci\u00f3n/reprogramaci\u00f3n. Solo valida la forma del formulario;
 * capacidad, candados y concurrencia pertenecen a la RPC transaccional.
 */
export function PanelAsignacionPlaneacion({
  recursos,
  partidasProgramables,
  programacion,
  onEnviar,
  onActivarPreparacion,
  onCancelar,
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

  // Al cambiar la selecci\u00f3n, el formulario refleja el estado confirmado por
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
      setErrorFormulario('Selecciona una partida e indica una secuencia v\u00e1lida');
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
        setErrorFormulario('La partida seleccionada ya no est\u00e1 disponible');
        return;
      }

      const resultado = await onEnviar(datos);
      if (!resultado.exito) setErrorFormulario(resultado.error || MENSAJE_ERROR_GENERICO);
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
      setErrorFormulario('No se pudo activar la preparaci\u00f3n');
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

      <p role="alert" aria-live="assertive" className="min-h-4 text-xs text-red-600">
        {errorFormulario ?? ''}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={enviando || preparando} data-testid="guardar-asignacion-planeacion">
          {enviando ? 'Guardando…' : programacion ? 'Reprogramar' : 'Programar'}
        </Button>
        {programacion?.estadoPlaneacion === 'programada' && onActivarPreparacion ? (
          <Button
            type="button"
            variante="secundario"
            disabled={enviando || preparando}
            onClick={() => void activarPreparacion()}
            data-testid="activar-preparacion-planeacion"
          >
            {preparando ? 'Activando…' : 'Iniciar preparaci\u00f3n'}
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
