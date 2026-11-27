'use client';

import { useState } from 'react';
import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { CLASE_CAMPO_FALTANTE } from '@/modulos/rfq/utilidades/faltantes';
import { turnosDelDia } from '@/modulos/planeacion/utilidades/horario-laboral';
import { hoyIso } from '@/modulos/planeacion/utilidades/fechas-planeacion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { formatearFecha, formatearNumero } from '@/compartido/utilidades/formatear';
import type { LoteTablero } from '@/modulos/produccion/tipos/indice';
import { ETIQUETA_ESTADO_LOTE } from './tarjeta-lote';

interface PropsDialogoDetalleLote {
  lote: LoteTablero | null;
  puedeOperar: boolean;
  procesando?: boolean;
  onIniciar: (lote: LoteTablero, fecha: string, turno: string) => void;
  onCerrar: () => void;
}

/**
 * Un lote se opera una sola vez: sus ítems comparten proceso, material y
 * corrida. La ficha los muestra juntos y ofrece un único inicio de corrida.
 */
export function DialogoDetalleLote({
  lote,
  puedeOperar,
  procesando = false,
  onIniciar,
  onCerrar,
}: PropsDialogoDetalleLote) {
  const [fecha, setFecha] = useState('');
  const [turno, setTurno] = useState('matutino');

  return (
    <Dialog open={lote !== null} onOpenChange={(abierto) => { if (!abierto) onCerrar(); }}>
      {lote ? (
        <DialogContent className="max-w-lg" data-testid="dialogo-detalle-lote">
          <DialogHeader>
            <DialogTitle>Lote {lote.codigo}</DialogTitle>
            <DialogDescription>
              {lote.folioOrden} · {lote.clienteNombre}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variante="info">{ETIQUETA_ESTADO_LOTE[lote.estado]}</Badge>
            <span className="text-sm font-medium text-texto-primario">{lote.procesoNombre}</span>
            <span className="text-xs text-texto-secundario">
              {formatearNumero(lote.cantidadPlanificada, 0)} piezas en {lote.items.length} ítems
            </span>
          </div>

          <ul className="flex flex-col gap-1 rounded-lg border border-borde bg-superficie-2/40 p-2">
            {lote.items.map((item) => (
              <li
                key={item.partidaId}
                className="flex items-center justify-between gap-2 text-sm"
                data-testid={`item-lote-${item.partidaId}`}
              >
                <span className="truncate">{item.codigoItem || 'Pieza'}</span>
                <span className="shrink-0 tabular-nums text-texto-secundario">
                  {formatearNumero(item.cantidad, 0)} piezas
                </span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-texto-secundario">
            Creado el {formatearFecha(lote.creadoEn)}. Los ítems se operan en una sola corrida; al
            cerrar se registra el avance de cada uno.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-texto-secundario">
              Día de la jornada
              <Input
                type="date"
                min={hoyIso()}
                value={fecha}
                onChange={(evento) => {
                  setFecha(evento.target.value);
                  const permitidos = evento.target.value ? turnosDelDia(evento.target.value) : [];
                  if (permitidos.length > 0 && !permitidos.includes(turno as never)) {
                    setTurno(permitidos[0]!);
                  }
                }}
                aria-invalid={fecha === ''}
                className={fecha === '' ? CLASE_CAMPO_FALTANTE : undefined}
                data-testid="fecha-inicio-corrida"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-texto-secundario">
              Turno
              <Select value={turno} onChange={(evento) => setTurno(evento.target.value)}>
                {(fecha ? turnosDelDia(fecha) : ['matutino'] as const).map((valor) => (
                  <option key={valor} value={valor}>{valor}</option>
                ))}
              </Select>
            </label>
          </div>

          <DialogFooter className="flex flex-wrap gap-2">
            {puedeOperar && lote.estado === 'PLANIFICADA' ? (
              <Button
                type="button"
                disabled={procesando || fecha === '' || turnosDelDia(fecha).length === 0}
                onClick={() => onIniciar(lote, fecha, turno)}
                data-testid="iniciar-corrida-lote"
              >
                {procesando ? 'Iniciando…' : 'Iniciar corrida'}
              </Button>
            ) : null}
            <Button type="button" variante="contorno" onClick={onCerrar}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
