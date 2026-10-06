'use client';

import { useState } from 'react';

import { Button } from '@/compartido/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/compartido/componentes/ui/dialog';
import { Textarea } from '@/compartido/componentes/ui/input';
import type { VerificacionInicio } from '@/modulos/produccion/tipos/indice';

const CAMPOS = [
  { clave: 'material', etiqueta: 'Material verificado' },
  { clave: 'espesor', etiqueta: 'Espesor verificado' },
  { clave: 'cantidad', etiqueta: 'Cantidad verificada' },
  { clave: 'archivo', etiqueta: 'Revisión / archivo vigente' },
  { clave: 'proceso_equipo', etiqueta: 'Proceso / equipo correcto' },
] as const;

/**
 * SII-B6.2: checklist obligatorio de eventos críticos antes de iniciar una
 * sesión o corrida. El servidor revalida el checklist completo.
 */
export function DialogoChecklistInicio({
  abierto,
  procesando,
  titulo,
  onAbiertoCambiar,
  onConfirmar,
}: {
  abierto: boolean;
  procesando: boolean;
  titulo: string;
  onAbiertoCambiar: (abierto: boolean) => void;
  onConfirmar: (verificacion: VerificacionInicio) => Promise<{ exito: true } | { exito: false; error: string }>;
}) {
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState<string | null>(null);

  const completo = CAMPOS.every((campo) => marcados[campo.clave] === true);

  function cerrar(): void {
    if (procesando) return;
    setMarcados({});
    setObservaciones('');
    setError(null);
    onAbiertoCambiar(false);
  }

  async function confirmar(): Promise<void> {
    setError(null);
    const resultado = await onConfirmar({
      material: true,
      espesor: true,
      cantidad: true,
      archivo: true,
      proceso_equipo: true,
      observaciones: observaciones.trim(),
    });
    if (resultado.exito) {
      cerrar();
      return;
    }
    setError(resultado.error);
  }

  return (
    <Dialog open={abierto} onOpenChange={(valor) => (valor ? onAbiertoCambiar(true) : cerrar())}>
      <DialogContent aria-label={`Checklist de inicio: ${titulo}`} data-testid="checklist-inicio">
        <DialogHeader>
          <DialogTitle>Checklist de eventos críticos</DialogTitle>
          <DialogDescription>
            {titulo}. Confirma cada punto antes de iniciar; sin el checklist completo el servidor rechaza el inicio.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Eventos críticos</legend>
          {CAMPOS.map((campo) => (
            <label key={campo.clave} className="flex items-center gap-2 text-sm" htmlFor={`checklist-${campo.clave}`}>
              <input
                id={`checklist-${campo.clave}`}
                type="checkbox"
                checked={marcados[campo.clave] === true}
                onChange={(evento) => setMarcados((previos) => ({
                  ...previos,
                  [campo.clave]: evento.target.checked,
                }))}
              />
              {campo.etiqueta}
            </label>
          ))}
        </fieldset>
        <label className="grid gap-1 text-sm font-medium" htmlFor="checklist-observaciones">
          Observaciones (opcional)
          <Textarea
            id="checklist-observaciones"
            className="min-h-11"
            maxLength={1000}
            value={observaciones}
            onChange={(evento) => setObservaciones(evento.target.value)}
          />
        </label>
        {error !== null && <p role="alert" className="text-sm text-peligro-texto">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variante="contorno" disabled={procesando} onClick={cerrar}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!completo || procesando}
            data-testid="confirmar-checklist-inicio"
            onClick={() => void confirmar()}
          >
            {procesando ? 'Iniciando…' : 'Iniciar con checklist'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
