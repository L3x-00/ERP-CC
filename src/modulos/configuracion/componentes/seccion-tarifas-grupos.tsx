'use client';

import { useState } from 'react';

import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { guardarGrupoEquipoAccion } from '@/modulos/catalogos/acciones/indice';
import type { GrupoEquipoCatalogo, MonedaTarifa } from '@/modulos/catalogos/tipos/indice';

type Borrador = { id: string; tarifa: string; moneda: MonedaTarifa };

export function textoTarifa(grupo: Pick<GrupoEquipoCatalogo, 'tarifaHora' | 'tarifaMoneda'>): string {
  if (grupo.tarifaHora === null) return 'Sin tarifa';
  const monto = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    .format(grupo.tarifaHora);
  return `${monto} ${grupo.tarifaMoneda}/h`;
}

/**
 * C3.2/DC-07: tarifa estándar por hora de cada Grupo de Equipo (preparación +
 * operación). Sin tarifa, el costeo de ruteo de ese grupo se bloquea; cada
 * cambio queda en el historial versionado del grupo.
 */
export function SeccionTarifasGrupos({
  grupos,
  puedeEditar,
  onGuardado,
  onError,
}: {
  grupos: GrupoEquipoCatalogo[];
  puedeEditar: boolean;
  onGuardado: (mensaje: string) => Promise<void>;
  onError: (mensaje: string) => void;
}) {
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const sinTarifa = grupos.filter((grupo) => grupo.activo && grupo.tarifaHora === null).length;

  async function guardar(grupo: GrupoEquipoCatalogo, valor: Borrador): Promise<void> {
    const texto = valor.tarifa.trim();
    const tarifa = texto === '' ? null : Number(texto);
    if (tarifa !== null && (!Number.isFinite(tarifa) || tarifa < 0)) {
      onError('La tarifa debe ser un número mayor o igual a 0');
      return;
    }
    setGuardando(true);
    const respuesta = await guardarGrupoEquipoAccion({
      id: grupo.id,
      codigo: grupo.codigo,
      nombre: grupo.nombre,
      activo: grupo.activo,
      orden: grupo.orden,
      tarifaHora: tarifa,
      tarifaMoneda: valor.moneda,
    });
    setGuardando(false);
    if (!respuesta.exito) {
      onError(respuesta.error ?? 'No se pudo guardar la tarifa');
      return;
    }
    setBorrador(null);
    await onGuardado(`Tarifa de ${grupo.nombre} guardada`);
  }

  return (
    <section className="grid min-w-0 gap-3" aria-label="Tarifas por grupo de equipo" data-testid="seccion-tarifas-grupos">
      <div>
        <h3 className="text-base font-semibold text-texto-primario">Tarifas por grupo de equipo</h3>
        <p className="text-sm text-texto-secundario">
          Tarifa estándar por hora para costear el ruteo (preparación y operación). Una máquina puede
          tener su propia tarifa en «Tarifas por máquina».
        </p>
        {sinTarifa > 0 ? (
          <p className="mt-1 text-sm text-advertencia-texto" data-testid="grupos-sin-tarifa">
            {sinTarifa === 1 ? '1 grupo activo no tiene' : `${sinTarifa} grupos activos no tienen`} tarifa: su
            costeo quedará bloqueado hasta configurarla.
          </p>
        ) : null}
      </div>
      <ul className="grid gap-2">
        {grupos.map((grupo) => {
          const editando = borrador?.id === grupo.id ? borrador : null;
          return (
            <li
              key={grupo.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-borde bg-superficie px-3 py-2"
              data-testid={`tarifa-grupo-${grupo.codigo}`}
            >
              <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-texto-primario">{grupo.nombre}</span>
                {grupo.tarifaHora === null ? (
                  <Badge variante="alerta">Sin tarifa</Badge>
                ) : (
                  <span className="tabular-nums text-texto-secundario">{textoTarifa(grupo)}</span>
                )}
              </span>
              {editando ? (
                <span className="flex min-w-0 flex-wrap items-end gap-2">
                  <label className="grid gap-1 text-xs text-texto-secundario">
                    Tarifa por hora
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={editando.tarifa}
                      onChange={(evento) => setBorrador({ ...editando, tarifa: evento.target.value })}
                      aria-label={`Tarifa por hora de ${grupo.nombre}`}
                      className="w-32"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-texto-secundario">
                    Moneda
                    <Select
                      value={editando.moneda}
                      onChange={(evento) =>
                        setBorrador({ ...editando, moneda: evento.target.value === 'USD' ? 'USD' : 'MXN' })
                      }
                      aria-label={`Moneda de la tarifa de ${grupo.nombre}`}
                    >
                      <option value="MXN">MXN</option>
                      <option value="USD">USD</option>
                    </Select>
                  </label>
                  <Button type="button" tamano="sm" disabled={guardando} onClick={() => void guardar(grupo, editando)}>
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
                      id: grupo.id,
                      tarifa: grupo.tarifaHora === null ? '' : String(grupo.tarifaHora),
                      moneda: grupo.tarifaMoneda,
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
