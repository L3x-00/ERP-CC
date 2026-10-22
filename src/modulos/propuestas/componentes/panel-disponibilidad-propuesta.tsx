'use client';

import { useRef, useState } from 'react';

import { Button } from '@/compartido/componentes/ui/button';
import { formatearNumero } from '@/compartido/utilidades/formatear';
import { formatearFechaCalendario } from '@/modulos/ordenes/utilidades/formato-ficha';
import { consultarDisponibilidadPropuestaAccion } from '@/modulos/propuestas/acciones/consultar-disponibilidad-propuesta';
import type {
  DisponibilidadGrupo,
  ResumenDisponibilidadPropuesta,
} from '@/modulos/propuestas/tipos/disponibilidad';

type Consulta =
  | { estado: 'inicial' }
  | { estado: 'cargando'; numero: number; revisionId: string }
  | { estado: 'error'; numero: number; revisionId: string; mensaje: string }
  | { estado: 'listo'; numero: number; revisionId: string; resumen: ResumenDisponibilidadPropuesta };

const INICIAL: Consulta = { estado: 'inicial' };

function horas(valor: number): string {
  return `${formatearNumero(valor, 2)} h`;
}

/**
 * Consulta informativa de capacidad junto a la fecha compromiso comercial.
 * No recibe ni toca la fecha: Comercial la decide a mano. Cada clic vuelve a
 * consultar; un resultado tardío de otra petición o de otra revisión se descarta.
 */
export function PanelDisponibilidadPropuesta({
  propuestaId,
  revisionId,
}: {
  propuestaId: string;
  revisionId: string;
}) {
  const [consulta, setConsulta] = useState<Consulta>(INICIAL);
  const [revisionMostrada, setRevisionMostrada] = useState(revisionId);
  const ultimaPeticion = useRef(0);

  // Al cambiar de revisión se olvida la lectura anterior (ajuste en render, sin efecto).
  if (revisionMostrada !== revisionId) {
    setRevisionMostrada(revisionId);
    setConsulta(INICIAL);
  }

  async function consultar(): Promise<void> {
    ultimaPeticion.current += 1;
    const numero = ultimaPeticion.current;
    const solicitada = revisionId;
    setConsulta({ estado: 'cargando', numero, revisionId: solicitada });

    let siguiente: Consulta;
    try {
      const respuesta = await consultarDisponibilidadPropuestaAccion({
        propuestaId,
        revisionId: solicitada,
      });
      if (!respuesta.exito) {
        siguiente = { estado: 'error', numero, revisionId: solicitada, mensaje: respuesta.error };
      } else if (!respuesta.datos || respuesta.datos.revisionId !== solicitada) {
        siguiente = {
          estado: 'error',
          numero,
          revisionId: solicitada,
          mensaje: 'No se pudo consultar la disponibilidad. Inténtalo de nuevo.',
        };
      } else {
        siguiente = { estado: 'listo', numero, revisionId: solicitada, resumen: respuesta.datos };
      }
    } catch {
      siguiente = {
        estado: 'error',
        numero,
        revisionId: solicitada,
        mensaje: 'No se pudo consultar la disponibilidad. Revisa la conexión e inténtalo de nuevo.',
      };
    }

    // Solo aterriza la petición en curso: si hubo otro clic o cambio de revisión, se descarta.
    setConsulta((actual) =>
      actual.estado === 'cargando' && actual.numero === numero && actual.revisionId === solicitada
        ? siguiente
        : actual,
    );
  }

  const vigente = consulta.estado !== 'inicial' && consulta.revisionId === revisionId ? consulta : INICIAL;
  const cargando = vigente.estado === 'cargando';

  return (
    <div className="contents">
      <Button
        tamano="sm"
        variante="contorno"
        onClick={() => void consultar()}
        disabled={cargando}
        data-testid="consultar-disponibilidad"
      >
        {cargando ? 'Consultando…' : vigente.estado === 'inicial' ? 'Consultar disponibilidad' : 'Volver a consultar'}
      </Button>
      {vigente.estado !== 'inicial' && (
        <section
          aria-label="Disponibilidad informativa"
          aria-live="polite"
          aria-busy={cargando}
          data-testid="disponibilidad-propuesta"
          className="order-last flex w-full flex-col gap-2 rounded-base border border-borde bg-superficie p-3 text-sm"
        >
          {vigente.estado === 'cargando' && (
            <p className="text-texto-secundario">Consultando la capacidad de los próximos 14 días…</p>
          )}

          {vigente.estado === 'error' && (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert" className="text-peligro-texto">
                {vigente.mensaje}
              </p>
              <Button tamano="sm" variante="contorno" onClick={() => void consultar()}>
                Reintentar
              </Button>
            </div>
          )}

          {vigente.estado === 'listo' && <ResumenDisponibilidad resumen={vigente.resumen} />}
        </section>
      )}
    </div>
  );
}

function ResumenDisponibilidad({ resumen }: { resumen: ResumenDisponibilidadPropuesta }) {
  const incompleto = resumen.procesosSinGrupo.length > 0 || resumen.itemsSinRuteo.length > 0;

  return (
    <>
      <p className="font-medium text-texto-primario">
        Capacidad del {formatearFechaCalendario(resumen.fechaInicio)} al{' '}
        {formatearFechaCalendario(resumen.fechaFin)} ({resumen.dias} días calendario, hora de la planta)
      </p>

      {resumen.sinItemsActivos ? (
        <p className="text-texto-secundario">La revisión no tiene ítems activos para consultar.</p>
      ) : resumen.grupos.length === 0 ? (
        <p className="text-advertencia-texto">
          No hay grupos de equipo que consultar: los procesos de esta revisión no tienen ruteo o grupo.
        </p>
      ) : (
        <ul aria-label="Capacidad por grupo de equipo" className="flex flex-col">
          {resumen.grupos.map((grupo) => (
            <FilaGrupo key={grupo.codigo} grupo={grupo} />
          ))}
        </ul>
      )}

      {incompleto && (
        <ul className="list-disc pl-5 text-advertencia-texto" data-testid="disponibilidad-incompleta">
          {resumen.procesosSinGrupo.map((proceso) => (
            <li key={proceso.nombre}>
              «{proceso.nombre}» no tiene grupo de equipo: sus {horas(proceso.horasRequeridas)} no se
              comparan con ninguna capacidad.
            </li>
          ))}
          {resumen.itemsSinRuteo.length > 0 && (
            <li>
              Sin ruteo (información incompleta, no cuenta como cero horas):{' '}
              {resumen.itemsSinRuteo.join(', ')}.
            </li>
          )}
        </ul>
      )}

      <p className="text-xs text-texto-secundario">
        Solo informativo: no reserva capacidad ni confirma ninguna fecha. Se calcula con los turnos y
        excepciones configurados y con la carga ya programada; no incluye trabajo sin programar ni
        descuenta las horas ya transcurridas de los turnos de hoy. No garantiza equipos libres.
        La fecha compromiso la decides tú.
      </p>
    </>
  );
}

function FilaGrupo({ grupo }: { grupo: DisponibilidadGrupo }) {
  const avisos: string[] = [];
  if (grupo.turnosSobrecargados > 0) {
    avisos.push(
      grupo.turnosSobrecargados === 1
        ? '1 turno ya está sobrecargado'
        : `${grupo.turnosSobrecargados} turnos ya están sobrecargados`,
    );
  }
  if (grupo.estado === 'con_capacidad' && grupo.recursosSinTurno > 0) {
    avisos.push('hay equipos activos sin turnos configurados; el resumen está incompleto');
  }
  if (grupo.horasDisponibles !== null && grupo.horasRequeridas > grupo.horasDisponibles) {
    avisos.push('lo que pide el ruteo supera lo disponible en el periodo');
  }

  return (
    <li className="border-t border-borde py-2 lg:grid lg:grid-cols-[minmax(12rem,2fr)_repeat(4,minmax(0,1fr))] lg:gap-x-3">
      <div className="min-w-0 break-words font-medium text-texto-primario">
        <p>{grupo.nombre}</p>
        {avisos.length > 0 && (
          <span className="block text-xs font-normal text-advertencia-texto">{avisos.join(' · ')}</span>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 lg:col-span-4 lg:mt-0 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-texto-secundario">Pide el ruteo</dt>
          <dd>{horas(grupo.horasRequeridas)}</dd>
        </div>
        {grupo.estado === 'sin_capacidad_configurada' ||
        grupo.horasCapacidad === null ||
        grupo.horasCarga === null ||
        grupo.horasDisponibles === null ? (
          <div className="self-center text-advertencia-texto">
            <dt className="sr-only">Capacidad</dt>
            <dd>Sin capacidad configurada</dd>
          </div>
        ) : (
          <>
            <div>
              <dt className="text-xs text-texto-secundario">Capacidad</dt>
              <dd>{horas(grupo.horasCapacidad)}</dd>
            </div>
            <div>
              <dt className="text-xs text-texto-secundario">Carga programada</dt>
              <dd>{horas(grupo.horasCarga)}</dd>
            </div>
            <div>
              <dt className="text-xs text-texto-secundario">Disponible</dt>
              <dd>{horas(grupo.horasDisponibles)}</dd>
            </div>
          </>
        )}
      </dl>
    </li>
  );
}
