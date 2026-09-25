'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { configurarMetasProcesoAccion } from '@/modulos/ordenes/acciones/configurar-metas-proceso';
import type { OrdenTabla } from '@/modulos/ordenes/componentes/tabla-ordenes';

type ProcesoEditable = { nombre: string; meta: string };

function procesosDePartida(partida: OrdenTabla['partidas'][number]): ProcesoEditable[] {
  const guardados = partida.metasProceso.map((proceso) => ({
    nombre: proceso.nombre, meta: String(proceso.metaPiezas),
  }));
  return guardados.length > 0 ? guardados
    : [{ nombre: 'Fabricación', meta: String(partida.cantidadSolicitada) }];
}

/** ORD-07: configura una ruta por partida sin alterar órdenes con historial. */
export function ConfigurarProcesosDialog({ orden, onCerrar, onGuardado }: {
  orden: OrdenTabla;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [partidaId, setPartidaId] = useState(orden.partidas[0]?.id ?? '');
  const partida = orden.partidas.find((actual) => actual.id === partidaId) ?? null;
  const [procesos, setProcesos] = useState<ProcesoEditable[]>(() =>
    orden.partidas[0] ? procesosDePartida(orden.partidas[0]) : []);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function seleccionarPartida(id: string): void {
    const siguiente = orden.partidas.find((actual) => actual.id === id);
    setPartidaId(id);
    setProcesos(siguiente ? procesosDePartida(siguiente) : []);
    setError(null);
  }

  function actualizar(indice: number, campo: keyof ProcesoEditable, valor: string): void {
    setProcesos((actuales) => actuales.map((proceso, posicion) =>
      posicion === indice ? { ...proceso, [campo]: valor } : proceso));
  }

  function agregar(): void {
    if (!partida || procesos.length >= 20) return;
    setProcesos((actuales) => [
      ...actuales,
      { nombre: '', meta: String(partida.cantidadSolicitada) },
    ]);
  }

  function quitar(indice: number): void {
    if (!partida || procesos.length <= 1) return;
    setProcesos((actuales) => actuales.filter((_, posicion) => posicion !== indice)
      .map((proceso, posicion, restantes) =>
        posicion === restantes.length - 1
          ? { ...proceso, meta: String(partida.cantidadSolicitada) } : proceso));
  }

  function mover(indice: number, direccion: -1 | 1): void {
    if (!partida || indice + direccion < 0 || indice + direccion >= procesos.length) return;
    setProcesos((actuales) => {
      const siguiente = [...actuales];
      [siguiente[indice], siguiente[indice + direccion]] = [
        siguiente[indice + direccion], siguiente[indice],
      ];
      return siguiente.map((proceso, posicion) =>
        posicion === siguiente.length - 1
          ? { ...proceso, meta: String(partida.cantidadSolicitada) } : proceso);
    });
  }

  async function guardar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!partida) return;
    setError(null);
    const valores = procesos.map((proceso, indice) => ({
      nombre: proceso.nombre.trim(),
      metaPiezas: indice === procesos.length - 1
        ? partida.cantidadSolicitada : Number(proceso.meta),
    }));
    if (valores.some((valor) => !valor.nombre || !Number.isFinite(valor.metaPiezas)
      || valor.metaPiezas <= 0)) {
      setError('Completa el nombre y la meta de cada proceso.');
      return;
    }
    setGuardando(true);
    try {
      const resultado = await configurarMetasProcesoAccion({
        partidaId: partida.id,
        ordenActualizadoEn: orden.actualizadoEn,
        procesos: valores,
      });
      if (!resultado.exito) {
        setError(resultado.error);
        return;
      }
      onGuardado();
      onCerrar();
    } catch {
      setError('No se pudieron guardar los procesos. Revisa la orden antes de repetir.');
    } finally {
      setGuardando(false);
    }
  }

  return <Dialog open onOpenChange={(abierto) => { if (!abierto && !guardando) onCerrar(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Procesos de {orden.folio}</DialogTitle>
        <DialogDescription>
          Define el orden y la meta de cada proceso. La última etapa produce la cantidad física de la partida.
        </DialogDescription>
      </DialogHeader>
      <form className="flex min-h-0 flex-col gap-4" onSubmit={(evento) => void guardar(evento)} noValidate>
        <div className="grid min-h-0 gap-4 overflow-y-auto pr-1">
          <div className="grid gap-1">
            <Label htmlFor="ruta-partida">Partida</Label>
            <Select id="ruta-partida" value={partidaId} onChange={(evento) => seleccionarPartida(evento.target.value)}>
              {orden.partidas.map((actual) => <option key={actual.id} value={actual.id}>
                {actual.codigoPieza} · {actual.cantidadSolicitada} {actual.unidadMedida}
              </option>)}
            </Select>
          </div>
          {procesos.map((proceso, indice) => <fieldset key={indice}
            className="grid gap-3 rounded-base border border-borde p-3 sm:grid-cols-[1fr_9rem]">
            <legend className="px-1 text-sm font-semibold">Proceso {indice + 1}</legend>
            <div className="grid gap-1">
              <Label htmlFor={`ruta-nombre-${indice}`}>Nombre</Label>
              <Input id={`ruta-nombre-${indice}`} value={proceso.nombre} maxLength={60}
                onChange={(evento) => actualizar(indice, 'nombre', evento.target.value)} required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`ruta-meta-${indice}`}>Meta de piezas</Label>
              <Input id={`ruta-meta-${indice}`} type="number" min="0.0001" step="0.0001"
                value={indice === procesos.length - 1 ? partida?.cantidadSolicitada ?? '' : proceso.meta}
                onChange={(evento) => actualizar(indice, 'meta', evento.target.value)}
                disabled={indice === procesos.length - 1} required />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="button" variante="contorno" tamano="sm" disabled={indice === 0}
                onClick={() => mover(indice, -1)}>Subir</Button>
              <Button type="button" variante="contorno" tamano="sm" disabled={indice === procesos.length - 1}
                onClick={() => mover(indice, 1)}>Bajar</Button>
              <Button type="button" variante="contorno" tamano="sm" disabled={procesos.length === 1}
                onClick={() => quitar(indice)}>Quitar</Button>
            </div>
          </fieldset>)}
          <Button type="button" variante="secundario" disabled={procesos.length >= 20}
            onClick={agregar}>Agregar proceso</Button>
          {error && <p role="alert" className="text-sm text-peligro-texto">{error}</p>}
        </div>
        <DialogFooter className="static shrink-0">
          <Button type="button" variante="contorno" disabled={guardando} onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" disabled={guardando || !partida}>
            {guardando ? 'Guardando…' : 'Guardar procesos'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
