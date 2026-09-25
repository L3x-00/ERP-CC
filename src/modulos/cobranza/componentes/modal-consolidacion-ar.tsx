'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import {
  consolidarArFaltantesAccion,
  previsualizarConsolidacionAccion,
} from '@/modulos/cobranza/acciones/consolidar-ar';
import type { OrdenConsolidable } from '@/modulos/cobranza/servicios/cobranza-servicio';

type Props = { onCerrar: () => void; onConsolidado: () => void };

/**
 * CFG-12: consolidación administrativa con vista previa, selección y
 * confirmación explícita. Solo crea las AR faltantes confirmadas.
 */
export function ModalConsolidacionAr({ onCerrar, onConsolidado }: Props) {
  const [filas, setFilas] = useState<OrdenConsolidable[]>([]);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ creadas: number; omitidas: number } | null>(null);

  useEffect(() => {
    let vigente = true;
    void previsualizarConsolidacionAccion().then((respuesta) => {
      if (!vigente) return;
      if (respuesta.exito && respuesta.datos) {
        setFilas(respuesta.datos);
        setSeleccion(new Set(respuesta.datos.filter((fila) => fila.elegible).map((fila) => fila.ordenId)));
      } else {
        setError(respuesta.exito ? 'Sin datos de vista previa' : respuesta.error);
      }
      setCargando(false);
    });
    return () => { vigente = false; };
  }, []);

  const elegibles = useMemo(() => filas.filter((fila) => fila.elegible), [filas]);
  const pendientes = useMemo(() => filas.filter((fila) => !fila.elegible), [filas]);

  function alternar(ordenId: string): void {
    setSeleccion((previas) => {
      const copia = new Set(previas);
      if (copia.has(ordenId)) copia.delete(ordenId); else copia.add(ordenId);
      return copia;
    });
  }

  async function confirmar(): Promise<void> {
    if (seleccion.size === 0) {
      setError('Selecciona al menos una orden elegible.');
      return;
    }
    setProcesando(true);
    setError(null);
    const respuesta = await consolidarArFaltantesAccion({ ordenIds: [...seleccion] });
    setProcesando(false);
    if (respuesta.exito && respuesta.datos) {
      setResultado({ creadas: respuesta.datos.creadas, omitidas: respuesta.datos.omitidas });
      onConsolidado();
    } else {
      setError(respuesta.exito ? 'No se pudo consolidar' : respuesta.error);
    }
  }

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto && !procesando) onCerrar(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Consolidar cuentas heredadas</DialogTitle>
          <DialogDescription>
            Vista previa sin escritura. Al confirmar, solo se crean las cuentas por cobrar no
            cobrables que faltan para las órdenes seleccionadas; repetir no duplica.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 text-sm">
          {cargando ? <p className="text-texto-secundario">Calculando elegibilidad…</p> : null}
          {!cargando ? (
            <p className="text-texto-secundario" data-testid="consolidacion-conteo">
              {elegibles.length} elegible(s) · {pendientes.length} con motivo
            </p>
          ) : null}
          {elegibles.length > 0 ? (
            <ul className="grid gap-2">
              {elegibles.map((fila) => (
                <li key={fila.ordenId} className="flex items-center justify-between gap-3 rounded-base border border-borde p-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      data-testid={`consolidar-${fila.folio}`}
                      checked={seleccion.has(fila.ordenId)}
                      onChange={() => alternar(fila.ordenId)}
                    />
                    <span className="font-mono text-xs">{fila.folio}</span>
                    <span className="text-texto-secundario">{fila.clienteNombre}</span>
                  </label>
                  <span>{formatearMoneda(fila.montoTotal, 'MXN')}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {pendientes.length > 0 ? (
            <details className="rounded-base border border-borde p-2">
              <summary className="cursor-pointer text-xs text-texto-secundario">Órdenes no elegibles ({pendientes.length})</summary>
              <ul className="mt-2 grid gap-1 text-xs text-texto-secundario">
                {pendientes.map((fila) => (
                  <li key={fila.ordenId}><span className="font-mono">{fila.folio}</span> · {fila.motivo}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {error ? <p role="alert" className="text-peligro-texto">{error}</p> : null}
          {resultado ? (
            <p role="status" className="text-exito-texto" data-testid="consolidacion-resultado">
              {resultado.creadas} cuenta(s) creada(s); {resultado.omitidas} omitida(s).
            </p>
          ) : null}
        </div>
        <DialogFooter className="static">
          <Button type="button" variante="contorno" disabled={procesando} onClick={onCerrar}>Cerrar</Button>
          {resultado === null ? (
            <Button type="button" data-testid="confirmar-consolidacion" disabled={procesando || cargando || seleccion.size === 0} onClick={() => void confirmar()}>
              {procesando ? 'Consolidando…' : `Confirmar ${seleccion.size} orden(es)`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
