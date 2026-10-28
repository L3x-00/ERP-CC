'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/compartido/componentes/ui/dialog';
import { Input } from '@/compartido/componentes/ui/input';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';

type ResultadoEntrega = { exito: true; folio: string } | { exito: false; error: string };
type MensajeFormulario = { texto: string; tipo: 'error' | 'estado' };

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

const CLASE_ETIQUETA = 'flex flex-col gap-1 text-sm font-medium text-texto-secundario';

/** Documento de despacho sin precio: la cantidad disponible siempre se vuelve a validar en la RPC. */
export function FormularioNotaEntrega({ orden, procesando, onEnviar }: PropsFormularioNotaEntrega) {
  const [abierto, setAbierto] = useState(false);
  const [recibidoPor, setRecibidoPor] = useState('');
  const [firmaClienteUrl, setFirmaClienteUrl] = useState('');
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<MensajeFormulario | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!orden) return;
    const partidas = orden.partidas.flatMap((partida) => {
      const cantidad = Number(cantidades[partida.id] ?? 0);
      return cantidad > 0 ? [{ partidaId: partida.id, cantidadEntregada: cantidad }] : [];
    });
    if (partidas.length === 0) {
      setMensaje({ texto: 'Registra al menos una cantidad a entregar', tipo: 'error' });
      return;
    }
    try {
      const resultado = await onEnviar({
        ordenId: orden.id,
        recibidoPor,
        ...(firmaClienteUrl.trim() ? { firmaClienteUrl: firmaClienteUrl.trim() } : {}),
        partidas,
      });
      setMensaje(resultado.exito
        ? { texto: `Nota ${resultado.folio} generada`, tipo: 'estado' }
        : { texto: resultado.error, tipo: 'error' });
      if (resultado.exito) {
        setRecibidoPor('');
        setFirmaClienteUrl('');
        setCantidades({});
        setAbierto(false);
      }
    } catch {
      setMensaje({ texto: 'No se pudo generar la nota de entrega. Comprueba los datos y vuelve a intentarlo.', tipo: 'error' });
    }
  }

  return (
    <section
      className="rounded-lg border border-borde bg-superficie p-4"
      aria-labelledby="titulo-nota-entrega"
      data-testid="panel-nota-entrega"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-nota-entrega" className="text-base font-semibold text-texto-primario">
            Nota de entrega
          </h2>
          <p className="mt-1 text-sm text-texto-secundario">Solo piezas producidas y pendientes de entrega. No contiene precios.</p>
        </div>
        <Button
          type="button"
          tamano="sm"
          disabled={!orden || procesando}
          onClick={() => { setMensaje(null); setAbierto(true); }}
          data-testid="abrir-nota-entrega"
        >
          Generar nota de entrega
        </Button>
      </div>
      {mensaje ? (
        <p
          className={mensaje.tipo === 'error' ? 'mt-3 text-sm text-peligro-texto' : 'mt-3 text-sm text-exito-texto'}
          role={mensaje.tipo === 'error' ? 'alert' : 'status'}
        >
          {mensaje.texto}
        </p>
      ) : null}
      {!orden ? <p className="mt-4 text-sm text-texto-secundario">Selecciona una orden para preparar su entrega.</p> : null}
      {orden ? (
        <Dialog open={abierto} onOpenChange={setAbierto}>
          <DialogContent aria-label="Generar nota de entrega">
            <DialogHeader>
              <DialogTitle>Generar nota de entrega</DialogTitle>
              <DialogDescription>
                {orden.folio} · registra únicamente piezas producidas y pendientes de entrega.
              </DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-3" onSubmit={enviar} data-testid="formulario-nota-entrega">
              <label className={CLASE_ETIQUETA}>
                Recibido por
                <Input
                  className="min-h-11"
                  minLength={3}
                  value={recibidoPor}
                  onChange={(evento) => setRecibidoPor(evento.target.value)}
                  required
                />
              </label>
              <label className={CLASE_ETIQUETA}>
                URL de firma del cliente (opcional)
                <Input
                  className="min-h-11"
                  type="url"
                  value={firmaClienteUrl}
                  onChange={(evento) => setFirmaClienteUrl(evento.target.value)}
                />
              </label>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium text-texto-secundario">Cantidades a entregar</legend>
                {orden.partidas.map((partida) => {
                  const disponible = Math.max(partida.cantidadProducida - partida.cantidadEntregada, 0);
                  return (
                    <label key={partida.id} className="grid grid-cols-[1fr_7rem] items-center gap-2 text-sm">
                      <span>{partida.codigoPieza} <span className="text-texto-secundario">({disponible} disponibles)</span></span>
                      <Input
                        className="min-h-11"
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
              {mensaje?.tipo === 'error' ? <p role="alert" className="text-sm text-peligro-texto">{mensaje.texto}</p> : null}
              <DialogFooter>
                <Button type="button" variante="contorno" disabled={procesando} onClick={() => setAbierto(false)}>Cancelar</Button>
                <Button type="submit" tamano="lg" disabled={procesando} data-testid="generar-nota-entrega">Generar nota de entrega</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}
