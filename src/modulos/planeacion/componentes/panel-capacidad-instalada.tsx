'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { crearClienteSupabase } from '@/nucleo/supabase/cliente';
import { actualizarCapacidadRecursoAccion } from '@/modulos/planeacion/acciones/actualizar-capacidad-recurso';
import {
  capacidadInstaladaHoras,
  jornadaBaseHoras,
} from '@/modulos/planeacion/utilidades/capacidad';
import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';

const CLAVE_CAPACIDAD = ['planeacion', 'capacidad-instalada'] as const;

interface RecursoCapacidad {
  id: string;
  codigo: string;
  nombre: string;
  area: string;
  cantidadEquipos: number;
  overrideHoras: number | null;
  horasTurno: number[];
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
          'id, codigo, nombre, area, cantidad_equipos, capacidad_jornada_override_horas, capacidades_recurso_turno(horas_capacidad)',
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
        horasTurno: (recurso.capacidades_recurso_turno ?? []).map((turno) =>
          Number(turno.horas_capacidad),
        ),
      }));
    },
    staleTime: 30_000,
  });

  return (
    <section
      className="rounded-lg border border-borde bg-superficie p-4"
      aria-labelledby="titulo-capacidad-instalada"
      data-testid="panel-capacidad-instalada"
    >
      <h2 id="titulo-capacidad-instalada" className="text-base font-semibold text-texto-primario">
        Capacidad instalada
      </h2>
      <p className="mt-1 text-sm text-texto-secundario">
        Capacidad por jornada = equipos × jornada. La jornada estándar es de 8 h y puede
        sobrescribirse por recurso (por ejemplo, un turno de 6 h).
      </p>

      {consulta.isLoading && <p className="mt-4 text-sm text-texto-secundario">Cargando recursos…</p>}
      {consulta.isError && (
        <p role="alert" className="mt-4 text-sm text-peligro-texto">
          No se pudo cargar la capacidad de los recursos.
        </p>
      )}

      {consulta.data && consulta.data.length === 0 && (
        <p className="mt-4 text-sm text-texto-secundario">No hay recursos activos.</p>
      )}

      {consulta.data && consulta.data.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {consulta.data.map((recurso) => (
            <FilaCapacidad key={recurso.id} recurso={recurso} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FilaCapacidad({ recurso }: { recurso: RecursoCapacidad }) {
  const clienteConsultas = useQueryClient();
  const [equipos, setEquipos] = useState(String(recurso.cantidadEquipos));
  const [override, setOverride] = useState(
    recurso.overrideHoras === null ? '' : String(recurso.overrideHoras),
  );
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const jornada = jornadaBaseHoras(
    recurso.horasTurno,
    override.trim() === '' ? null : Number(override),
  );
  const capacidad = capacidadInstaladaHoras(Number(equipos), jornada);

  async function guardar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setMensaje(null);
    const equiposNumero = Number(equipos);
    if (!Number.isInteger(equiposNumero) || equiposNumero < 1 || equiposNumero > 100) {
      setMensaje('Los equipos deben ser un entero entre 1 y 100');
      return;
    }
    const overrideNumero = override.trim() === '' ? null : Number(override);
    if (
      overrideNumero !== null &&
      (!Number.isFinite(overrideNumero) || overrideNumero < 0.5 || overrideNumero > 24)
    ) {
      setMensaje('La jornada debe estar entre 0.5 y 24 horas');
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
      await clienteConsultas.invalidateQueries({ queryKey: CLAVE_CAPACIDAD });
    } catch {
      setMensaje('No se pudo comunicar el cambio; vuelve a intentarlo');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <li
      className="grid gap-2 rounded-lg border border-borde px-3 py-3 lg:grid-cols-[1fr_auto]"
      data-testid={`capacidad-recurso-${recurso.codigo}`}
    >
      <form className="grid items-end gap-3 sm:grid-cols-3" onSubmit={guardar}>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-texto-primario">
            {recurso.codigo} · {recurso.nombre}
          </span>
          <span className="text-xs text-texto-secundario">
            {recurso.area} · Turnos: {recurso.horasTurno.map((horas) => `${horas} h`).join(' / ') || 'sin turnos'}
          </span>
        </div>
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
            onChange={(evento) => setEquipos(evento.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`jornada-${recurso.id}`}>Jornada por equipo (h, opcional)</Label>
          <div className="flex items-center gap-2">
            <Input
              id={`jornada-${recurso.id}`}
              type="number"
              min="0.5"
              max="24"
              step="0.5"
              placeholder={`${jornadaBaseHoras(recurso.horasTurno, null)}`}
              value={override}
              onChange={(evento) => setOverride(evento.target.value)}
            />
            <Button type="submit" variante="contorno" tamano="sm" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      </form>
      <div className="flex flex-col items-start justify-center gap-1 text-sm lg:items-end">
        <span className="font-medium text-texto-primario" data-testid={`capacidad-total-${recurso.codigo}`}>
          Equipos × jornada = {capacidad} h por jornada
        </span>
        {mensaje !== null && (
          <span role="status" className="text-xs text-texto-secundario">
            {mensaje}
          </span>
        )}
      </div>
    </li>
  );
}
