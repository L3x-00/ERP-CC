'use client';

import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';

/**
 * Error de programación con flujo de solución. Los errores de Planeación no se
 * muestran solo como texto: cada caso ofrece la acción que lo resuelve (elegir
 * una máquina compatible, buscar hueco, actualizar datos o cambiar de operación).
 */
export type ErrorProgramacion = {
  mensaje: string;
  codigo?: string | null;
};

export type RecursoAlternativoProgramacion = {
  id: string;
  codigo: string;
  nombre: string;
};

export interface PropsDialogoErrorPlaneacion {
  error: ErrorProgramacion | null;
  onCerrar: () => void;
  /** Recarga calendario, partidas y capacidad para descartar datos obsoletos. */
  onActualizarDatos?: () => void;
  /** Busca el siguiente día con hueco para las horas capturadas. */
  onBuscarHueco?: () => void;
  buscandoHueco?: boolean;
  /** Máquinas del grupo que pide la operación; se ofrecen como solución directa. */
  recursosCompatibles?: readonly RecursoAlternativoProgramacion[];
  onElegirRecurso?: (recursoId: string) => void;
  /** Salta a la siguiente operación pendiente de la misma partida. */
  onElegirOtraOperacion?: () => void;
  /** Abre el panel de programación para revisar partida, fecha o turno. */
  onAbrirProgramacion?: () => void;
  /** Lleva a Producción para cerrar la sesión que impide mover la operación. */
  onAbrirProduccion?: () => void;
  /** Devuelve a "programada" una preparación atrasada que nunca inició sesión. */
  onLiberarPreparacion?: () => void;
  liberandoPreparacion?: boolean;
}

function tituloDe(codigo: string | null | undefined): string {
  switch (codigo) {
    case 'recurso_incompatible':
      return 'Esa máquina no puede hacer esta operación';
    case 'programacion_duplicada':
      return 'Esta operación ya está programada';
    case 'capacidad_insuficiente':
    case 'capacidad_no_disponible':
      return 'No hay capacidad en ese turno';
    case 'recurso_ocupado':
      return 'La máquina está ocupada';
    case 'programacion_conflicto':
      return 'Los datos cambiaron mientras programabas';
    case 'programacion_no_reprogramable':
      return 'La operación ya está en piso';
    case 'sesion_activa_en_programacion':
      return 'La operación tiene una sesión abierta';
    case 'transicion_preparacion_no_permitida':
      return 'La operación ya no se puede preparar';
    case 'programacion_inexistente':
    case 'partida_inexistente':
    case 'recurso_inexistente':
      return 'La programación o el recurso ya no están disponibles';
    case 'recurso_inactivo':
      return 'La máquina está inactiva';
    case 'reprogramacion_invalida':
    case 'programacion_invalida':
      return 'Revisa los datos de la programación';
    case 'motivo_reprogramacion_requerido':
      return 'Falta el motivo de la reprogramación';
    case 'sin_permiso_planeacion':
      return 'Ya no tienes permiso para modificar Planeación';
    default:
      return 'No se pudo guardar la programación';
  }
}

function pasosDe(codigo: string | null | undefined): string[] {
  switch (codigo) {
    case 'recurso_incompatible':
      return [
        'Elige una máquina del grupo que pide el ruteo.',
        'Si la máquina correcta no aparece, revisa el grupo del proceso en la propuesta.',
      ];
    case 'programacion_duplicada':
      return [
        'Esta partida ya tiene una programación para esa operación.',
        'Elige otra operación pendiente o actualiza los datos para ver la programación existente.',
      ];
    case 'capacidad_insuficiente':
    case 'capacidad_no_disponible':
      return [
        'Cambia la fecha o el turno, o busca el siguiente día con hueco.',
        'También puedes reducir las horas estimadas si el trabajo cabe en menos tiempo.',
      ];
    case 'recurso_ocupado':
      return [
        'La máquina tiene una preparación o sesión activa, a veces de un día anterior.',
        'Puedes mover la operación a otra máquina del mismo grupo o cerrar la sesión en Producción.',
        'Si la máquina debería estar libre, actualiza los datos.',
      ];
    case 'programacion_no_reprogramable':
      return [
        'La operación ya está en preparación o en proceso, o la orden ya terminó.',
        'Pausa o finaliza su sesión en Producción para poder moverla.',
        'Si quedó en preparación sin que nadie iniciara sesión, libera la preparación.',
      ];
    case 'sesion_activa_en_programacion':
      return [
        'Un operador tiene una sesión activa o pausada en esta operación.',
        'Pausa o finaliza esa sesión en Producción para liberar la preparación.',
        'Como administrador puedes cerrarla desde la ficha de la orden.',
      ];
    case 'transicion_preparacion_no_permitida':
      return [
        'La operación ya se completó o se canceló y no admite preparación.',
        'Actualiza los datos para ver su estado vigente.',
      ];
    case 'programacion_conflicto':
      return [
        'Otra persona modificó esta programación.',
        'Actualiza los datos y vuelve a intentarlo con la información vigente.',
      ];
    case 'recurso_inactivo':
      return [
        'La máquina seleccionada está fuera de servicio.',
        'Elige otra máquina activa del grupo que pide la operación.',
      ];
    case 'reprogramacion_invalida':
    case 'programacion_invalida':
      return [
        'Revisa la fecha, el turno, las horas y la prioridad.',
        'Si el problema continúa, actualiza los datos y vuelve a intentarlo.',
      ];
    case 'motivo_reprogramacion_requerido':
      return ['Escribe el motivo de la reprogramación (mínimo 3 caracteres).'];
    case 'sin_permiso_planeacion':
      return ['Solicita el permiso de Planeación a un administrador.'];
    default:
      return [
        'Revisa la partida, la máquina, la fecha y el turno.',
        'Si el problema continúa, actualiza los datos y vuelve a intentarlo.',
      ];
  }
}

export function DialogoErrorPlaneacion({
  error,
  onCerrar,
  onActualizarDatos,
  onBuscarHueco,
  buscandoHueco = false,
  recursosCompatibles = [],
  onElegirRecurso,
  onElegirOtraOperacion,
  onAbrirProgramacion,
  onAbrirProduccion,
  onLiberarPreparacion,
  liberandoPreparacion = false,
}: PropsDialogoErrorPlaneacion) {
  const abierto = error !== null;
  const codigo = error?.codigo ?? null;
  const muestraRecursos =
    onElegirRecurso !== undefined
    && recursosCompatibles.length > 0
    && (codigo === 'recurso_incompatible'
      || codigo === 'recurso_ocupado'
      || codigo === 'recurso_inactivo');

  return (
    <Dialog open={abierto} onOpenChange={(siguiente) => { if (!siguiente) onCerrar(); }}>
      <DialogContent data-testid="dialogo-error-planeacion" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tituloDe(codigo)}</DialogTitle>
          <DialogDescription>{error?.mensaje}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">
              Cómo resolverlo
            </p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-texto-secundario">
              {pasosDe(codigo).map((paso) => (
                <li key={paso}>{paso}</li>
              ))}
            </ol>
          </div>

          {muestraRecursos ? (
            <div className="flex flex-col gap-2 rounded-base border border-borde bg-superficie-2 p-3">
              <p className="text-xs font-medium text-texto-primario">
                Máquinas compatibles con esta operación
              </p>
              <div className="flex flex-wrap gap-2">
                {recursosCompatibles.map((recurso) => (
                  <Button
                    key={recurso.id}
                    type="button"
                    tamano="sm"
                    variante="contorno"
                    onClick={() => onElegirRecurso?.(recurso.id)}
                    data-testid={`error-usar-recurso-${recurso.id}`}
                  >
                    Reprogramar a {recurso.codigo}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-texto-tenue">
                Al elegir una máquina se actualiza la operación. Si estás reprogramando, el cambio
                se guarda en ese momento; después podrás iniciar la preparación con el equipo nuevo.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {(codigo === 'capacidad_insuficiente' || codigo === 'capacidad_no_disponible')
            && onBuscarHueco ? (
            <Button
              type="button"
              variante="secundario"
              tamano="sm"
              disabled={buscandoHueco}
              onClick={onBuscarHueco}
              data-testid="error-buscar-hueco"
            >
              {buscandoHueco ? 'Buscando…' : 'Buscar hueco'}
            </Button>
          ) : null}
          {codigo === 'programacion_duplicada' && onElegirOtraOperacion ? (
            <Button
              type="button"
              variante="secundario"
              tamano="sm"
              onClick={onElegirOtraOperacion}
              data-testid="error-elegir-otra-operacion"
            >
              Elegir otra operación
            </Button>
          ) : null}
          {codigo === 'programacion_no_reprogramable' && onLiberarPreparacion ? (
            <Button
              type="button"
              variante="secundario"
              tamano="sm"
              disabled={liberandoPreparacion}
              onClick={onLiberarPreparacion}
              data-testid="error-liberar-preparacion"
            >
              {liberandoPreparacion ? 'Liberando…' : 'Liberar preparación'}
            </Button>
          ) : null}
          {(codigo === 'programacion_no_reprogramable'
            || codigo === 'transicion_preparacion_no_permitida'
            || codigo === 'sesion_activa_en_programacion'
            || codigo === 'recurso_ocupado')
            && onAbrirProduccion ? (
            <Button
              type="button"
              variante="secundario"
              tamano="sm"
              onClick={onAbrirProduccion}
              data-testid="error-abrir-produccion"
            >
              Ir a Producción
            </Button>
          ) : null}
          {onAbrirProgramacion ? (
            <Button
              type="button"
              variante="contorno"
              tamano="sm"
              onClick={onAbrirProgramacion}
              data-testid="error-abrir-programacion"
            >
              Revisar programación
            </Button>
          ) : null}
          {onActualizarDatos ? (
            <Button
              type="button"
              variante="contorno"
              tamano="sm"
              onClick={onActualizarDatos}
              data-testid="error-actualizar-datos"
            >
              Actualizar datos
            </Button>
          ) : null}
          <Button type="button" variante="fantasma" tamano="sm" onClick={onCerrar}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
