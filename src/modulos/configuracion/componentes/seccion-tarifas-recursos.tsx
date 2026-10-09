'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import {
  guardarTarifaRecursoAccion,
  listarTarifasRecursosAccion,
  type TarifaRecurso,
} from '@/modulos/catalogos/acciones/indice';
import type { GrupoEquipoCatalogo, MonedaTarifa } from '@/modulos/catalogos/tipos/indice';

import { textoTarifa } from './seccion-tarifas-grupos';

const CLAVE_TARIFAS_RECURSOS = ['configuracion', 'tarifas-recursos'] as const;

type Borrador = { id: string; propia: boolean; tarifa: string; moneda: MonedaTarifa };

/**
 * C3.2/DC-07: tarifa propia opcional por máquina. Sin tarifa propia la máquina
 * usa la de su Grupo de Equipo; una tarifa propia en cero es explícita y válida.
 */
export function SeccionTarifasRecursos({
  grupos,
  puedeEditar,
  onMensaje,
  onError,
}: {
  grupos: GrupoEquipoCatalogo[];
  puedeEditar: boolean;
  onMensaje: (mensaje: string) => void;
  onError: (mensaje: string) => void;
}) {
  const clienteQuery = useQueryClient();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const consulta = useQuery({
    queryKey: CLAVE_TARIFAS_RECURSOS,
    queryFn: async () => {
      const respuesta = await listarTarifasRecursosAccion();
      if (!respuesta.exito || !respuesta.datos) throw new Error(respuesta.exito ? 'Sin datos' : respuesta.error);
      return respuesta.datos;
    },
  });
  const grupoPorId = new Map(grupos.map((grupo) => [grupo.id, grupo]));

  function descripcion(recurso: TarifaRecurso): string {
    if (recurso.overrideActivo && recurso.tarifaHora !== null && recurso.moneda) {
      return `Tarifa propia: ${textoTarifa({ tarifaHora: recurso.tarifaHora, tarifaMoneda: recurso.moneda })}`;
    }
    const grupo = recurso.grupoEquipoId ? grupoPorId.get(recurso.grupoEquipoId) : undefined;
    if (!grupo) return 'Sin grupo de equipo ni tarifa propia: su costeo quedará bloqueado';
    return `Usa la tarifa de ${grupo.nombre}: ${textoTarifa(grupo)}`;
  }

  async function guardar(valor: Borrador): Promise<void> {
    const tarifa = Number(valor.tarifa);
    if (valor.propia && (valor.tarifa.trim() === '' || !Number.isFinite(tarifa) || tarifa < 0)) {
      onError('La tarifa propia debe ser un número mayor o igual a 0');
      return;
    }
    setGuardando(true);
    const respuesta = await guardarTarifaRecursoAccion(
      valor.propia
        ? { recursoId: valor.id, overrideActivo: true, tarifaHora: tarifa, moneda: valor.moneda }
        : { recursoId: valor.id, overrideActivo: false },
    );
    setGuardando(false);
    if (!respuesta.exito) {
      onError(respuesta.error);
      return;
    }
    setBorrador(null);
    await clienteQuery.invalidateQueries({ queryKey: CLAVE_TARIFAS_RECURSOS });
    onMensaje('Tarifa de la máquina guardada');
  }

  return (
    <section className="grid min-w-0 gap-3" aria-label="Tarifas por máquina" data-testid="seccion-tarifas-recursos">
      <div>
        <h3 className="text-base font-semibold text-texto-primario">Tarifas por máquina</h3>
        <p className="text-sm text-texto-secundario">
          Activa una tarifa propia solo si la máquina cuesta distinto que su grupo. Al quitarla vuelve a
          usar la tarifa del grupo.
        </p>
      </div>
      {consulta.isPending ? <p className="text-sm text-texto-secundario">Cargando máquinas…</p> : null}
      {consulta.isError ? (
        <p role="alert" className="text-sm text-peligro-texto">
          No se pudieron cargar las tarifas por máquina.
        </p>
      ) : null}
      <ul className="grid gap-2">
        {(consulta.data ?? []).filter((recurso) => recurso.activo).map((recurso) => {
          const editando = borrador?.id === recurso.id ? borrador : null;
          return (
            <li
              key={recurso.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-borde bg-superficie px-3 py-2"
              data-testid={`tarifa-recurso-${recurso.codigo}`}
            >
              <span className="flex min-w-0 flex-col text-sm">
                <span className="font-medium text-texto-primario">{recurso.nombre}</span>
                <span className="text-texto-secundario">{descripcion(recurso)}</span>
              </span>
              {editando ? (
                <span className="flex min-w-0 flex-wrap items-end gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editando.propia}
                      onChange={(evento) => setBorrador({ ...editando, propia: evento.target.checked })}
                    />
                    Tarifa propia
                  </label>
                  {editando.propia ? (
                    <>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={editando.tarifa}
                        onChange={(evento) => setBorrador({ ...editando, tarifa: evento.target.value })}
                        aria-label={`Tarifa propia por hora de ${recurso.nombre}`}
                        className="w-32"
                      />
                      <Select
                        value={editando.moneda}
                        onChange={(evento) =>
                          setBorrador({ ...editando, moneda: evento.target.value === 'USD' ? 'USD' : 'MXN' })
                        }
                        aria-label={`Moneda de la tarifa de ${recurso.nombre}`}
                      >
                        <option value="MXN">MXN</option>
                        <option value="USD">USD</option>
                      </Select>
                    </>
                  ) : null}
                  <Button type="button" tamano="sm" disabled={guardando} onClick={() => void guardar(editando)}>
                    Guardar
                  </Button>
                  <Button type="button" variante="contorno" tamano="sm" onClick={() => setBorrador(null)}>
                    Cancelar
                  </Button>
                </span>
              ) : puedeEditar ? (
                <Button
                  type="button"
                  variante="contorno"
                  tamano="sm"
                  onClick={() =>
                    setBorrador({
                      id: recurso.id,
                      propia: recurso.overrideActivo,
                      tarifa: recurso.tarifaHora === null ? '' : String(recurso.tarifaHora),
                      moneda: recurso.moneda ?? 'MXN',
                    })
                  }
                >
                  Editar tarifa
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
