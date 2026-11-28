'use client';

import { useState } from 'react';
import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { formatearFecha, formatearNumero } from '@/compartido/utilidades/formatear';
import { hoyIso } from '@/modulos/planeacion/utilidades/fechas-planeacion';
import { turnosDelDia } from '@/modulos/planeacion/utilidades/horario-laboral';
import type { LoteTablero } from '@/modulos/produccion/tipos/indice';
import { MOTIVOS_PAUSA_CATALOGO } from '@/modulos/produccion/tipos/indice';
import type { MotivoPausaCatalogo } from '@/modulos/produccion/servicios/consultas-b6-servicio';
import {
  etiquetaFechaHora,
  tiempoAcumuladoLegible,
} from '@/modulos/produccion/utilidades/formato-operador';
import { ContadorSesionVivo } from './contador-sesion-vivo';
import { ETIQUETA_ESTADO_LOTE } from './tarjeta-lote';

interface PropsDialogoDetalleLote {
  lote: LoteTablero | null;
  puedeOperar: boolean;
  procesando?: boolean;
  onIniciar?: (lote: LoteTablero, fecha: string, turno: string) => void;
  motivosPausa?: readonly MotivoPausaCatalogo[];
  onPausar?: (lote: LoteTablero, datos: { motivoPausa: string; notas?: string }) => void;
  onFinalizar?: (lote: LoteTablero) => void;
  onReanudar?: (lote: LoteTablero) => void;
  onAbrirItem?: (partidaId: string) => void;
  onCerrar: () => void;
}

/**
 * Ficha del lote: la misma tarjeta se abre desde el tablero y desde el enlace
 * «Ver lote» de la ficha del ítem. PLANIFICADA ofrece el inicio; EN_PROCESO y
 * PAUSADA muestran la sesión y sus acciones, sin campos de inicio editables.
 */
export function DialogoDetalleLote({
  lote,
  puedeOperar,
  procesando = false,
  motivosPausa,
  onIniciar,
  onPausar,
  onFinalizar,
  onReanudar,
  onAbrirItem,
  onCerrar,
}: PropsDialogoDetalleLote) {
  const [fecha, setFecha] = useState(hoyIso());
  const [turno, setTurno] = useState('matutino');
  const [motivoPausa, setMotivoPausa] = useState<string>('DUDA');
  const [notasPausa, setNotasPausa] = useState('');

  const enCurso = lote !== null && lote.estado !== 'PLANIFICADA';
  const requiereNota = motivosPausa?.find((motivo) => motivo.codigo === motivoPausa)?.requiereNota
    ?? ['FALLA', 'OTRA', 'problema_tecnico', 'mantenimiento', 'otro'].includes(motivoPausa);
  const sesion = lote?.sesion ?? null;
  const piezasHechas = lote?.items.reduce((total, item) => total + (item.hechoPiezas ?? 0), 0) ?? 0;
  const avance = lote && lote.cantidadPlanificada > 0
    ? Math.min(100, Math.round(piezasHechas / lote.cantidadPlanificada * 100))
    : 0;

  return (
    <Dialog open={lote !== null} onOpenChange={(abierto) => { if (!abierto) onCerrar(); }}>
      {lote ? (
        <DialogContent className="max-w-2xl" data-testid="dialogo-detalle-lote">
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

          <section className="grid gap-2 rounded-lg border border-borde bg-superficie-2/40 p-3" aria-label="Ítems del lote">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">
              Qué fabricar
            </h3>
            <ul className="grid gap-2">
              {lote.items.map((item) => (
                <li
                  key={item.partidaId}
                  className="grid gap-1 rounded-md border border-borde p-2 text-sm"
                  data-testid={`item-lote-${item.partidaId}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      <span className="font-mono">{item.codigoItem}</span>
                      {item.descripcion ? ` · ${item.descripcion}` : ''}
                    </span>
                    <span className="tabular-nums text-texto-secundario">
                      {formatearNumero(item.cantidad, 0)} piezas
                    </span>
                  </div>
                  {item.materialCodigo ? (
                    <p className="text-xs text-texto-secundario" data-testid={`material-lote-${item.partidaId}`}>
                      {item.materialCodigo} · {item.materialNombre ?? 'Material'}
                      {item.anchoMm != null && item.largoMm != null
                        ? ` · ${item.anchoMm} × ${item.largoMm} mm`
                        : ''}
                      {item.pendientePiezas != null ? ` · ${item.pendientePiezas} pendientes` : ''}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {item.primeraPiezaPendiente ? (
                      <Badge variante="alerta">Primera pieza pendiente</Badge>
                    ) : null}
                    {onAbrirItem ? (
                      <button
                        type="button"
                        className="text-acento-texto underline"
                        onClick={() => onAbrirItem(item.partidaId)}
                        data-testid={`ver-item-lote-${item.partidaId}`}
                      >
                        Ver ficha del ítem
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-texto-secundario">
              Creado el {formatearFecha(lote.creadoEn)}. Los ítems se operan en una sola corrida; al
              cerrar se registra el avance de cada uno.
            </p>
          </section>

          {enCurso ? (
            <section className="grid gap-2 rounded-lg border border-borde p-3" aria-label="Seguimiento de la corrida">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">
                Esta corrida
              </h3>
              {sesion ? (
                <>
                  <div className="flex flex-wrap items-baseline gap-3 text-sm">
                    <span data-testid="tiempo-acumulado-lote">
                      Tiempo acumulado: <strong>{tiempoAcumuladoLegible(sesion.horasNetas)}</strong>
                    </span>
                    <ContadorSesionVivo
                      fechaInicio={sesion.fechaInicio}
                      limiteHoras={lote.limiteHoras ?? 0}
                      testId="contador-sesion-lote"
                    />
                    <span className="text-xs text-texto-secundario">
                      Sesión iniciada {etiquetaFechaHora(sesion.fechaInicio)}
                      {sesion.operadorNombre ? ` · ${sesion.operadorNombre}` : ''}
                    </span>
                  </div>
                  <div className="grid gap-1">
                    <div className="flex justify-between text-xs text-texto-secundario">
                      <span>Avance del lote</span>
                      <span>{avance}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-superficie-2">
                      <div className="h-full bg-acento" style={{ width: `${avance}%` }} />
                    </div>
                  </div>
                  {lote.items.some((item) => item.primeraPiezaPendiente) ? (
                    <p className="text-xs text-advertencia-texto">
                      Hay ítems con primera pieza pendiente. Abre su ficha para liberarla antes de cerrar.
                    </p>
                  ) : null}
                  {puedeOperar ? (
                    <div className="grid gap-2 border-t border-borde pt-2">
                      {lote.estado === 'EN_PROCESO' ? (
                        <>
                          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
                            Motivo de pausa
                            <Select value={motivoPausa} onChange={(evento) => setMotivoPausa(evento.target.value)}>
                              {motivosPausa && motivosPausa.length > 0
                                ? motivosPausa.map((motivo) => (
                                  <option key={motivo.codigo} value={motivo.codigo}>{motivo.nombre}</option>
                                ))
                                : MOTIVOS_PAUSA_CATALOGO.map((motivo) => (
                                  <option key={motivo} value={motivo}>{motivo}</option>
                                ))}
                            </Select>
                          </label>
                          <Input
                            aria-label="Notas de la pausa"
                            value={notasPausa}
                            onChange={(evento) => setNotasPausa(evento.target.value)}
                            placeholder={requiereNota ? 'Notas obligatorias para este motivo' : 'Notas (opcional)'}
                            data-testid="notas-pausa-lote"
                          />
                          {requiereNota && !notasPausa.trim() ? (
                            <p className="text-xs text-advertencia-texto">
                              Este motivo exige una nota para pausar.
                            </p>
                          ) : null}
                        </>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {onPausar && lote.estado === 'EN_PROCESO' ? (
                          <Button
                            type="button"
                            variante="contorno"
                            disabled={procesando || (requiereNota && !notasPausa.trim())}
                            onClick={() => onPausar(lote, {
                              motivoPausa,
                              ...(notasPausa.trim() ? { notas: notasPausa.trim() } : {}),
                            })}
                            data-testid="pausar-lote"
                          >
                            {procesando ? 'Pausando…' : 'Pausar sesión'}
                          </Button>
                        ) : null}
                        {onFinalizar ? (
                          <Button
                            type="button"
                            disabled={procesando}
                            onClick={() => onFinalizar(lote)}
                            data-testid="finalizar-lote"
                          >
                            {procesando ? 'Abriendo ficha…' : 'Finalizar sesión'}
                          </Button>
                        ) : null}
                        {lote.estado === 'PAUSADA' && onReanudar ? (
                          <Button
                            type="button"
                            variante="secundario"
                            disabled={procesando}
                            onClick={() => onReanudar(lote)}
                            data-testid="reanudar-lote"
                          >
                            {procesando ? 'Reanudando…' : 'Continuar sesión pausada'}
                          </Button>
                        ) : null}
                      </div>
                      {onFinalizar ? (
                        <p className="text-xs text-texto-secundario">
                          «Finalizar sesión» abre la ficha del ítem para registrar piezas, consumo y primera pieza.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-texto-secundario">
                  La corrida está en curso pero todavía no hay datos de sesión. Actualiza el tablero.
                </p>
              )}
            </section>
          ) : (
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
          )}

          <DialogFooter className="flex flex-wrap gap-2">
            {puedeOperar && onIniciar && lote.estado === 'PLANIFICADA' ? (
              <Button
                type="button"
                disabled={procesando}
                onClick={() => onIniciar(lote, fecha, turno)}
                data-testid="iniciar-corrida-lote"
              >
                {procesando ? 'Iniciando…' : 'Iniciar corrida'}
              </Button>
            ) : null}
            <Button type="button" variante="contorno" onClick={onCerrar} data-testid="cerrar-detalle-lote">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
