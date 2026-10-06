'use client';

import { useRef, useState, type PointerEvent } from 'react';

import { Button } from '@/compartido/componentes/ui/button';

/**
 * SII-B7.2: captura de firma digital en pantalla (canvas → PNG).
 * `onFirma` recibe el archivo PNG generado y devuelve `true` si se registró
 * (el lienzo se limpia solo en ese caso).
 */
export function CapturaFirma({
  onFirma,
  deshabilitado = false,
}: {
  onFirma: (archivo: File) => Promise<boolean>;
  deshabilitado?: boolean;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [tieneTrazos, setTieneTrazos] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  function contexto(): CanvasRenderingContext2D | null {
    return lienzo.current?.getContext('2d') ?? null;
  }

  function posicion(evento: PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const canvas = lienzo.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((evento.clientX - rect.left) / rect.width) * canvas.width,
      y: ((evento.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function iniciar(evento: PointerEvent<HTMLCanvasElement>): void {
    const ctx = contexto();
    const punto = posicion(evento);
    if (!ctx || !punto) return;
    evento.currentTarget.setPointerCapture(evento.pointerId);
    dibujando.current = true;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';
    ctx.beginPath();
    ctx.moveTo(punto.x, punto.y);
  }

  function mover(evento: PointerEvent<HTMLCanvasElement>): void {
    if (!dibujando.current) return;
    const ctx = contexto();
    const punto = posicion(evento);
    if (!ctx || !punto) return;
    ctx.lineTo(punto.x, punto.y);
    ctx.stroke();
    if (!tieneTrazos) setTieneTrazos(true);
  }

  function terminar(): void {
    dibujando.current = false;
  }

  function limpiar(): void {
    const canvas = lienzo.current;
    const ctx = contexto();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTieneTrazos(false);
  }

  async function adjuntar(): Promise<void> {
    const canvas = lienzo.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolver) =>
      canvas.toBlob(resolver, 'image/png'),
    );
    if (!blob) return;
    setOcupado(true);
    try {
      const archivo = new File([blob], `firma-digital-${Date.now()}.png`, {
        type: 'image/png',
      });
      const registrada = await onFirma(archivo);
      if (registrada) limpiar();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="captura-firma">
      <canvas
        ref={lienzo}
        width={600}
        height={180}
        data-testid="firma-canvas"
        aria-label="Área de firma"
        className="h-40 w-full touch-none rounded-md border border-borde bg-white"
        onPointerDown={iniciar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerLeave={terminar}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variante="contorno"
          tamano="sm"
          data-testid="firma-limpiar"
          disabled={ocupado || !tieneTrazos}
          onClick={limpiar}
        >
          Limpiar
        </Button>
        <Button
          type="button"
          tamano="sm"
          data-testid="firma-adjuntar"
          disabled={ocupado || deshabilitado || !tieneTrazos}
          onClick={() => void adjuntar()}
        >
          {ocupado ? 'Guardando…' : 'Adjuntar firma'}
        </Button>
      </div>
    </div>
  );
}
