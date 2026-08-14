'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';

type ResultadoEntrega = { exito: true; folio: string } | { exito: false; error: string };

export interface PropsFormularioNotaEntrega {
  orden: OrdenTableroProduccion | null;
  procesando: boolean;
  onEnviar: (datos: {
    ordenId: string;
    recibidoPor: string;
    firmaClienteUrl?: string;
    partidas: { partidaId: string; cantidadEntregada: number }[];
  }) => Promise<ResultadoEntrega>;
}

/** Documento de despacho sin precio: la cantidad disponible siempre se vuelve a validar en la RPC. */
export function FormularioNotaEntrega({ orden, procesando, onEnviar }: PropsFormularioNotaEntrega) {
  const [recibidoPor, setRecibidoPor] = useState('');
  const [firmaClienteUrl, setFirmaClienteUrl] = useState('');
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!orden) return;
    const partidas = orden.partidas.flatMap((partida) => {
      const cantidad = Number(cantidades[partida.id] ?? 0);
      return cantidad > 0 ? [{ partidaId: partida.id, cantidadEntregada: cantidad }] : [];
    });
    if (partidas.length === 0) {
      setMensaje('Registra al menos una cantidad a entregar');
      return;
    }
    const resultado = await onEnviar({
      ordenId: orden.id,
      recibidoPor,
      ...(firmaClienteUrl.trim() ? { firmaClienteUrl: firmaClienteUrl.trim() } : {}),
      partidas,
    });
    setMensaje(resultado.exito ? `Nota ${resultado.folio} generada` : resultado.error);
    if (resultado.exito) {
      setRecibidoPor('');
      setFirmaClienteUrl('');
      setCantidades({});
    }
  }

  return (
    <section className="rounded-base border border-foreground/10 p-4" aria-labelledby="titulo-nota-entrega" data-testid="panel-nota-entrega">
      <h2 id="titulo-nota-entrega" className="text-sm font-medium">Nota de entrega</h2>
      <p className="mt-1 text-xs text-foreground/60">Solo piezas producidas y pendientes de entrega. No contiene precios.</p>
      {mensaje ? <p className="mt-3 text-sm" role="status">{mensaje}</p> : null}
      {!orden ? <p className="mt-4 text-sm text-foreground/60">Selecciona una orden para preparar su entrega.</p> : null}
      {orden ? (
        <form className="mt-4 flex flex-col gap-3" onSubmit={enviar} data-testid="formulario-nota-entrega">
          <p className="text-sm font-medium">{orden.folio}</p>
          <label className="flex flex-col gap-1 text-xs">
            Recibido por
            <Input minLength={3} value={recibidoPor} onChange={(evento) => setRecibidoPor(evento.target.value)} required />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            URL de firma del cliente (opcional)
            <Input type="url" value={firmaClienteUrl} onChange={(evento) => setFirmaClienteUrl(evento.target.value)} />
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs font-medium">Cantidades a entregar</legend>
            {orden.partidas.map((partida) => {
              const disponible = Math.max(partida.cantidadProducida - partida.cantidadEntregada, 0);
              return (
                <label key={partida.id} className="grid grid-cols-[1fr_7rem] items-center gap-2 text-xs">
                  <span>{partida.codigoPieza} <span className="text-foreground/60">({disponible} disponibles)</span></span>
                  <Input
                    aria-label={`Cantidad entregada ${partida.codigoPieza}`}
                    disabled={disponible <= 0}
                    max={disponible}
                    min="0"
                    step="0.001"
                    type="number"
                    value={cantidades[partida.id] ?? ''}
                    onChange={(evento) => setCantidades((actuales) => ({ ...actuales, [partida.id]: evento.target.value }))}
                  />
                </label>
              );
            })}
          </fieldset>
          <Button type="submit" disabled={procesando} data-testid="generar-nota-entrega">Generar nota de entrega</Button>
        </form>
      ) : null}
    </section>
  );
}
