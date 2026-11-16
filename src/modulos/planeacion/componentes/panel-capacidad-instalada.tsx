'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { crearClienteSupabase } from '@/nucleo/supabase/cliente';
import { actualizarCapacidadRecursoAccion } from '@/modulos/planeacion/acciones/actualizar-capacidad-recurso';
import { CLAVE_CALENDARIO_PLANEACION } from '@/modulos/planeacion/componentes/claves-consulta';
import {
  capacidadInstaladaHoras,
  jornadaBaseHoras,
} from '@/modulos/planeacion/utilidades/capacidad';
import {
  HORAS_JORNADA_SABADO,
} from '@/modulos/planeacion/utilidades/horario-laboral';
import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { SeccionDesplegable } from '@/compartido/componentes/ui/seccion-desplegable';

const CLAVE_CAPACIDAD = ['planeacion', 'capacidad-instalada'] as const;

interface RecursoCapacidad {
  id: string;
  codigo: string;
  nombre: string;
  area: string;
  cantidadEquipos: number;
  overrideHoras: number | null;
  horasTurno: { turno: string; horas: number }[];
}

/**
 * D-02 — Capacidad instalada: separa la jornada laboral de la cantidad de
 * equipos. Cada recurso define sus equipos y, si aplica, una jornada distinta a
 * la de sus turnos (override). La programación sigue validando contra PostgreSQL
 * (`equipos × jornada`); este panel solo mantiene el dato.
 */
export function PanelCapacidadInstalada() {
  const consulta = useQuery({
    queryKey: CLAVE_CAPACIDAD,
    queryFn: async (): Promise<RecursoCapacidad[]> => {
      const cliente = crearClienteSupabase();
      const { data, error } = await cliente
        .from('recursos_planeacion')
        .select(
          'id, codigo, nombre, area, cantidad_equipos, capacidad_jornada_override_horas, capacidades_recurso_turno(turno, horas_capacidad)',
        )
        .eq('activo', true)
        .order('codigo');
      if (error) throw new Error(error.message);
      return (data ?? []).map((recurso) => ({
        id: recurso.id,
        codigo: recurso.codigo,
        nombre: recurso.nombre,
        area: recurso.area,
        cantidadEquipos: Number(recurso.cantidad_equipos),
        overrideHoras:
          recurso.capacidad_jornada_override_horas === null
            ? null
            : Number(recurso.capacidad_jornada_override_horas),
        horasTurno: (recurso.capacidades_recurso_turno ?? []).map((turno) => ({
          turno: turno.turno,
          horas: Number(turno.horas_capacidad),
        })),
      }));
    },
    staleTime: 30_000,
  });

  return (
    <div id="capacidad-instalada" className="scroll-mt-24">
      <SeccionDesplegable
        titulo="Capacidad instalada"
        descripcion="Equipos y jornada de cada recurso; de lunes a viernes la jornada es de 9 h"
        dataTestId="panel-capacidad-instalada"
        dataTestIdBoton="toggle-capacidad-instalada"
        claseContenido="pt-0"
      >
        <p
          className="mt-3 rounded-base border border-advertencia/40 bg-advertencia-suave px-3 py-2 text-xs text-advertencia-texto"
          data-testid="nota-turnos-capacidad"
        >
          La capacidad se calcula como equipos × jornada. El horario de la empresa es lunes a
          viernes de 08:00 a 17:00 (9 h) y sábado de 08:00 a 12:00 (4 h); el domingo no se labora.
          El matutino cubre 08:00–13:00 (5 h) y el vespertino 13:00–17:00 (4 h). Si el equipo
          todavía no tiene turnos, al guardar se registran ambos turnos base.
        </p>
        {consulta.isLoading && <p className="text-sm text-texto-secundario">Cargando recursos…</p>}
        {consulta.isError && (
          <p role="alert" className="mt-3 text-sm text-peligro-texto">
            No se pudo cargar la capacidad de los recursos.
          </p>
        )}

        {consulta.data && consulta.data.length === 0 && (
          <p className="mt-3 text-sm text-texto-secundario">No hay recursos activos.</p>
        )}

        {consulta.data && consulta.data.length > 0 && (
          <ul className="mt-3 flex flex-col gap-3">
            {consulta.data.map((recurso) => (
              <FilaCapacidad key={recurso.id} recurso={recurso} />
            ))}
          </ul>
        )}
      </SeccionDesplegable>
    </div>
  );
}

function FilaCapacidad({ recurso }: { recurso: RecursoCapacidad }) {
  const clienteConsultas = useQueryClient();
  const [equipos, setEquipos] = useState(String(recurso.cantidadEquipos));
  const [override, setOverride] = useState(
    recurso.overrideHoras === null ? '' : String(recurso.overrideHoras),
  );
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const jornada = jornadaBaseHoras(
    recurso.horasTurno.map((turno) => turno.horas),
    override.trim() === '' ? null : Number(override),
  );
  const capacidad = capacidadInstaladaHoras(Number(equipos), jornada);

  async function guardar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setMensaje(null);
    setGuardado(false);
    const equiposNumero = Number(equipos);
    if (!Number.isInteger(equiposNumero) || equiposNumero < 1 || equiposNumero > 100) {
      setMensaje('Los equipos deben ser un entero entre 1 y 100');
      return;
    }
    const overrideNumero = override.trim() === '' ? null : Number(override);
    if (
      overrideNumero !== null &&
      (!Number.isFinite(overrideNumero) || overrideNumero < 0.5 || overrideNumero > 9)
    ) {
      setMensaje('La jornada debe estar entre 0.5 y 9 horas (lunes a viernes)');
      return;
    }

    setGuardando(true);
    try {
      const respuesta = await actualizarCapacidadRecursoAccion({
        recursoId: recurso.id,
        cantidadEquipos: equiposNumero,
        jornadaOverrideHoras: overrideNumero,
      });
      if (!respuesta.exito) {
        setMensaje(respuesta.error);
        return;
      }
      setMensaje('Capacidad guardada.');
      setGuardado(true);
      await Promise.all([
        clienteConsultas.invalidateQueries({ queryKey: CLAVE_CAPACIDAD }),
        clienteConsultas.invalidateQueries({ queryKey: CLAVE_CALENDARIO_PLANEACION }),
      ]);
    } catch {
      setMensaje('No se pudo comunicar el cambio; vuelve a intentarlo');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <li
      className="grid gap-2 rounded-lg border border-borde px-3 py-3"
      data-testid={`capacidad-recurso-${recurso.codigo}`}
    >
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-texto-primario">
          {recurso.codigo} · {recurso.nombre}
        </span>
        <span className="text-xs text-texto-secundario">
          {recurso.area} · Turnos:{' '}
          {recurso.horasTurno
            .map((turno) => `${turno.turno} ${turno.horas} h`)
            .join(' / ') || 'sin turnos'}
        </span>
      </div>
      <form className="grid items-end gap-3 sm:grid-cols-3" onSubmit={guardar}>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`equipos-${recurso.id}`} obligatorio>
            Equipos ({recurso.codigo})
          </Label>
          <Input
            id={`equipos-${recurso.id}`}
            type="number"
            min="1"
            max="100"
            step="1"
            value={equipos}
            onChange={(evento) => {
              setEquipos(evento.target.value);
              setGuardado(false);
              setMensaje(null);
            }}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`jornada-${recurso.id}`}>Jornada por equipo (h, opcional)</Label>
          <Input
            id={`jornada-${recurso.id}`}
            type="number"
            min="0.5"
            max="9"
            step="0.5"
            placeholder={`${jornadaBaseHoras(recurso.horasTurno.map((turno) => turno.horas), null)}`}
            value={override}
            onChange={(evento) => {
              setOverride(evento.target.value);
              setGuardado(false);
              setMensaje(null);
            }}
          />
        </div>
        <Button
          type="submit"
          variante="contorno"
          tamano="sm"
          disabled={guardando}
          className={
            guardado
              ? 'border-exito/40 bg-exito-suave text-exito-texto hover:bg-exito-suave'
              : undefined
          }
          data-testid={`guardar-capacidad-${recurso.codigo}`}
        >
          {guardando ? 'Guardando…' : guardado ? 'Guardado' : 'Guardar'}
        </Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium text-texto-primario" data-testid={`capacidad-total-${recurso.codigo}`}>
          Equipos × jornada = {capacidad} h de lunes a viernes ·{' '}
          {Math.round(Math.min(capacidad, Number(equipos) * HORAS_JORNADA_SABADO) * 100) / 100} h el
          sábado
        </span>
        {mensaje !== null && (
          <span
            role="status"
            className={`text-xs ${guardado ? 'text-exito-texto' : 'text-texto-secundario'}`}
          >
            {mensaje}
          </span>
        )}
      </div>
    </li>
  );
}
