'use client';

import { useState } from 'react';

import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { parsearMonto, textoMonto } from '@/compartido/utilidades/monto';
import { guardarGrupoEquipoAccion } from '@/modulos/catalogos/acciones/indice';
import type { GrupoEquipoCatalogo, MonedaTarifa } from '@/modulos/catalogos/tipos/indice';
import {
  ESTACIONES_TARIFA,
  ETIQUETA_ESTACION_TARIFA,
  esEstacionTarifa,
  type EstacionTarifa,
} from '@/modulos/catalogos/utilidades/tarifa-estacion';

type Borrador = { id: string; estacion: string; tarifa: string; moneda: MonedaTarifa };

const formatoMonto = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export function textoTarifa(grupo: Pick<GrupoEquipoCatalogo, 'tarifaHora' | 'tarifaMoneda'>): string {
  if (grupo.tarifaHora === null) return 'Sin tarifa';
  return `${formatoMonto.format(grupo.tarifaHora)} ${grupo.tarifaMoneda}/h`;
}

/**
 * Tarifa estándar del grupo (fuente maestra del ruteo) y su origen.
 * T2 2026-11-06: la estación de Tarifas / TC es solo una referencia para
 * copiar el valor; no se usa como tarifa efectiva.
 */
export function resumenTarifaGrupo(
  grupo: Pick<GrupoEquipoCatalogo, 'tarifaHora' | 'tarifaMoneda'>,
): { texto: string; origen: string } | null {
  if (grupo.tarifaHora === null) return null;
  return { texto: textoTarifa(grupo), origen: 'Tarifa del grupo' };
}

/**
 * Tarifario único del ruteo (obs. cliente 2026-10-13, T2 2026-11-06): la
 * tarifa estándar del Grupo de Equipo es la fuente maestra del costeo. La
 * estación de Tarifas / TC es solo una referencia para copiar su valor; no
 * compite en el cálculo. Sin tarifa estándar el costeo usa el respaldo
 * (excepción V1) o se bloquea.
 */
export function SeccionTarifasGrupos({
  grupos,
  tarifasEstacion,
  tarifaRespaldo,
  puedeEditar,
  onGuardado,
  onError,
}: {
  grupos: GrupoEquipoCatalogo[];
  tarifasEstacion: Record<EstacionTarifa, number>;
  tarifaRespaldo: number | null;
  puedeEditar: boolean;
  onGuardado: (mensaje: string) => Promise<void>;
  onError: (mensaje: string) => void;
}) {
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const sinTarifa = grupos.filter(
    (grupo) => grupo.activo && resumenTarifaGrupo(grupo) === null,
  ).length;

  async function guardar(grupo: GrupoEquipoCatalogo, valor: Borrador): Promise<void> {
    const texto = valor.tarifa.trim();
    const tarifa = texto === '' ? null : parsearMonto(texto);
    if (texto !== '' && tarifa === null) {
      onError('La tarifa estándar debe ser un monto válido (por ejemplo 850.50) o quedar vacía');
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
      estacionTarifa: esEstacionTarifa(valor.estacion) ? valor.estacion : null,
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
          Es la tarifa que usa el costeo del ruteo de las propuestas (preparación y operación). Es la
          fuente maestra: la estación de Tarifas / TC solo sirve para copiar su valor. Una máquina puede
          sustituirla con una tarifa propia en «Equipos y sus tarifas».
        </p>
        {sinTarifa > 0 ? (
          <p className="mt-1 text-sm text-advertencia-texto" data-testid="grupos-sin-tarifa">
            {sinTarifa === 1 ? '1 grupo activo no tiene' : `${sinTarifa} grupos activos no tienen`} tarifa
            estándar.{' '}
            {tarifaRespaldo !== null
              ? 'Su costeo usará la tarifa de respaldo y quedará marcado con advertencia.'
              : 'Su costeo quedará bloqueado hasta configurarla.'}
          </p>
        ) : null}
      </div>
      <ul className="grid gap-2">
        {grupos.map((grupo) => {
          const editando = borrador?.id === grupo.id ? borrador : null;
          const resumen = resumenTarifaGrupo(grupo);
          return (
            <li
              key={grupo.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-borde bg-superficie px-3 py-2"
              data-testid={`tarifa-grupo-${grupo.codigo}`}
            >
              <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-texto-primario">{grupo.nombre}</span>
                {!grupo.activo ? <Badge variante="neutro">Inactivo</Badge> : null}
                {resumen === null ? (
                  <Badge variante="alerta">Sin tarifa</Badge>
                ) : (
                  <>
                    <span className="tabular-nums text-texto-primario">{resumen.texto}</span>
                    <span className="text-xs text-texto-secundario">{resumen.origen}</span>
                  </>
                )}
                {grupo.estacionTarifa !== null ? (
                  <span className="text-xs text-texto-terciario">
                    Referencia: Tarifas / TC · {ETIQUETA_ESTACION_TARIFA[grupo.estacionTarifa]}
                  </span>
                ) : null}
              </span>
              {editando ? (
                <span className="flex min-w-0 flex-wrap items-end gap-2">
                  <label className="grid gap-1 text-xs text-texto-secundario">
                    Tarifa estándar por hora
                    <Input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="850.50"
                      value={editando.tarifa}
                      onChange={(evento) => setBorrador({ ...editando, tarifa: evento.target.value })}
                      aria-label={`Tarifa por hora de ${grupo.nombre}`}
                      className="w-44"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-texto-secundario">
                    Copiar de una estación (opcional)
                    <Select
                      value={editando.estacion}
                      onChange={(evento) => {
                        const estacion = evento.target.value;
                        setBorrador({
                          ...editando,
                          estacion,
                          ...(esEstacionTarifa(estacion)
                            ? { tarifa: textoMonto(tarifasEstacion[estacion]), moneda: 'MXN' }
                            : {}),
                        });
                      }}
                      aria-label={`Estación de Tarifas / TC de ${grupo.nombre}`}
                    >
                      <option value="">Sin referencia</option>
                      {ESTACIONES_TARIFA.map((estacion) => (
                        <option key={estacion} value={estacion}>
                          {ETIQUETA_ESTACION_TARIFA[estacion]} · {formatoMonto.format(tarifasEstacion[estacion])} MXN/h
                        </option>
                      ))}
                    </Select>
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
                      estacion: grupo.estacionTarifa ?? '',
                      tarifa: grupo.tarifaHora === null ? '' : textoMonto(grupo.tarifaHora),
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
