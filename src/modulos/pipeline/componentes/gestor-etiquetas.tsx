'use client';

import { useState, type KeyboardEvent } from 'react';

import { actualizarEtiquetasAccion } from '@/modulos/pipeline/acciones/actualizar-etiquetas';
import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';

const MAX_ETIQUETAS = 20;

type PropsGestorEtiquetas = {
  oportunidadId: string;
  etiquetas: string[];
  /** Solo muestra las etiquetas, sin controles de edición. */
  soloLectura?: boolean;
  /** Aviso al contenedor con el nuevo conjunto tras guardar. */
  onCambio?: (etiquetas: string[]) => void;
};

/**
 * Gestor de etiquetas de una oportunidad (RFQ-12): muestra las etiquetas como
 * chips y permite añadir o quitar cada una sin tocar la etapa. Cada cambio
 * persiste el conjunto completo con `actualizarEtiquetasAccion`. En
 * `soloLectura` solo muestra los chips.
 */
export function GestorEtiquetas({
  oportunidadId,
  etiquetas,
  soloLectura = false,
  onCambio,
}: PropsGestorEtiquetas) {
  const [borrador, setBorrador] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function persistir(siguientes: string[]): Promise<void> {
    setError(null);
    setGuardando(true);
    try {
      const respuesta = await actualizarEtiquetasAccion({ id: oportunidadId, etiquetas: siguientes });
      if (respuesta.exito) onCambio?.(respuesta.datos?.etiquetas ?? siguientes);
      else setError(respuesta.error);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  function agregar(): void {
    const limpia = borrador.trim();
    if (limpia === '') return;
    if (etiquetas.some((etiqueta) => etiqueta.toLowerCase() === limpia.toLowerCase())) {
      setBorrador('');
      return;
    }
    if (etiquetas.length >= MAX_ETIQUETAS) {
      setError(`Máximo ${MAX_ETIQUETAS} etiquetas`);
      return;
    }
    setBorrador('');
    void persistir([...etiquetas, limpia]);
  }

  function quitar(etiqueta: string): void {
    void persistir(etiquetas.filter((actual) => actual !== etiqueta));
  }

  function alTeclear(evento: KeyboardEvent<HTMLInputElement>): void {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      agregar();
    }
  }

  if (soloLectura) {
    if (etiquetas.length === 0) return null;
    return (
      <ul className="flex flex-wrap gap-1" aria-label="Etiquetas">
        {etiquetas.map((etiqueta) => (
          <li
            key={etiqueta}
            className="rounded-full bg-superficie-2 px-2.5 py-0.5 text-xs text-texto-secundario"
          >
            {etiqueta}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-borde px-4 py-3">
      <Label htmlFor={`etiqueta-nueva-${oportunidadId}`}>Etiquetas</Label>
      <ul className="flex flex-wrap gap-1" aria-label="Etiquetas">
        {etiquetas.length === 0 && <li className="text-xs text-texto-tenue">Sin etiquetas</li>}
        {etiquetas.map((etiqueta) => (
          <li
            key={etiqueta}
            className="flex items-center gap-1 rounded-full bg-superficie-2 px-2.5 py-0.5 text-xs text-texto-secundario"
          >
            <span>{etiqueta}</span>
            <button
              type="button"
              onClick={() => quitar(etiqueta)}
              disabled={guardando}
              aria-label={`Quitar ${etiqueta}`}
              className="text-texto-tenue hover:text-peligro-texto"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          id={`etiqueta-nueva-${oportunidadId}`}
          type="text"
          value={borrador}
          onChange={(evento) => setBorrador(evento.target.value)}
          onKeyDown={alTeclear}
          placeholder="Nueva etiqueta"
          maxLength={40}
          disabled={guardando}
        />
        <Button
          type="button"
          variante="contorno"
          tamano="sm"
          onClick={agregar}
          disabled={guardando || borrador.trim() === ''}
        >
          Agregar
        </Button>
      </div>
      {error !== null && (
        <p role="alert" className="text-xs text-peligro-texto">
          {error}
        </p>
      )}
    </div>
  );
}
