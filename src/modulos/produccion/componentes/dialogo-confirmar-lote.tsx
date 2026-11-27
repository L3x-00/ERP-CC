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
import { formatearNumero } from '@/compartido/utilidades/formatear';
import type { SugerenciaCorrida } from '@/modulos/produccion/utilidades/agrupacion-corridas';

/**
 * Segunda confirmación antes de crear una corrida. El operador ve exactamente
 * qué ítems se van a unir, con qué material y en qué área, porque el tablero
 * superior ya no muestra el resumen de la sugerencia.
 */
export function DialogoConfirmarLote({
  sugerencia,
  procesando,
  onCancelar,
  onConfirmar,
}: {
  sugerencia: SugerenciaCorrida | null;
  procesando: boolean;
  onCancelar: () => void;
  onConfirmar: (sugerencia: SugerenciaCorrida) => void;
}) {
  const primero = sugerencia?.procesos[0];
  const areas = sugerencia
    ? [...new Set(sugerencia.procesos.map((proceso) => proceso.areaNombre))]
    : [];
  const areaTexto = areas.length === 1
    ? areas[0] || 'Sin área'
    : 'áreas distintas, revisa la ficha de cada ítem';
  const piezas = sugerencia?.procesos.reduce((total, proceso) => total + proceso.pendientePiezas, 0) ?? 0;
  const material = primero?.material;
  const folioSii = primero?.folioSii?.trim();
  const folioTexto = folioSii
    ? `Orden ${primero?.folioOrden ?? ''} · SII ${folioSii}`
    : `Orden ${primero?.folioOrden ?? ''}`;

  return (
    <Dialog
      open={sugerencia !== null}
      onOpenChange={(abierto) => {
        if (!abierto && !procesando) onCancelar();
      }}
    >
      {sugerencia && primero ? (
        <DialogContent data-testid="dialogo-confirmar-lote">
          <DialogHeader>
            <DialogTitle>Confirmar creación de lote</DialogTitle>
            <DialogDescription>
              {folioTexto} · {primero.clienteNombre}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 text-sm text-texto-primario">
            <p data-testid="confirmar-lote-resumen">
              Se creará una sola corrida con los ítems de esta orden para el proceso{' '}
              <strong>{sugerencia.procesoNombre}</strong>, con el material{' '}
              <strong>{material ? `${material.codigo} (${material.nombre})` : 'sin material'}</strong>
              {material?.espesorMm != null ? `, calibre ${material.espesorMm} mm` : ''} en el área{' '}
              <strong>{areaTexto}</strong>.
            </p>

            <ul className="grid gap-1 rounded-md border border-borde bg-superficie-2/60 p-3" data-testid="confirmar-lote-items">
              {sugerencia.procesos.map((proceso) => (
                <li key={proceso.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <strong className="font-mono">{proceso.codigoPieza}</strong>
                    {proceso.descripcion ? ` · ${proceso.descripcion}` : ''}
                  </span>
                  <span className="text-texto-secundario">
                    {formatearNumero(proceso.pendientePiezas, 0)} {proceso.unidadMedida} pendientes
                  </span>
                </li>
              ))}
            </ul>

            <p className="text-xs text-texto-secundario" data-testid="confirmar-lote-total">
              Total: {sugerencia.procesos.length} ítem(s) · {formatearNumero(piezas, 0)} pieza(s) pendientes.
              El lote se creará en Bandeja; deberás iniciarlo con el checklist para pasarlo a En proceso.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variante="contorno"
              disabled={procesando}
              onClick={onCancelar}
              data-testid="cancelar-crear-lote"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={procesando}
              aria-busy={procesando}
              onClick={() => onConfirmar(sugerencia)}
              data-testid="confirmar-crear-lote"
            >
              {procesando ? 'Creando…' : 'Confirmar Lote'}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
