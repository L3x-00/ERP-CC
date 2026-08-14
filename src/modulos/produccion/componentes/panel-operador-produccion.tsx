'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';
import type { SesionActivaProduccion } from '@/estado/uso-tienda-produccion';
import { MOTIVOS_PAUSA_SESION, type MotivoPausaSesion } from '@/modulos/produccion/tipos/indice';

type ResultadoOperacion = { exito: true } | { exito: false; error: string };

export interface PropsPanelOperadorProduccion {
  orden: OrdenTableroProduccion | null;
  sesionActiva: SesionActivaProduccion | null;
  operadorDisponible: boolean;
  procesando: boolean;
  onIniciar: (datos: { ordenId: string; partidaId: string; programacionId: string }) => Promise<ResultadoOperacion>;
  onCerrar: (datos: {
    sesionId: string;
    piezasProducidas: number;
    estadoDestino: 'pausada' | 'finalizada';
    motivoPausa?: MotivoPausaSesion;
    notas?: string;
    pinConfirmacion: string;
  }) => Promise<ResultadoOperacion>;
}

const ETIQUETAS_MOTIVO: Record<MotivoPausaSesion, string> = {
  falta_informacion: 'Falta de información',
  material_pendiente: 'Material pendiente',
  aprobacion_cliente: 'Aprobación de cliente',
  problema_tecnico: 'Problema técnico',
  mantenimiento: 'Mantenimiento',
  otro: 'Otro',
};

/** Panel rápido: el navegador solicita acciones, PostgreSQL confirma cada transición. */
export function PanelOperadorProduccion({
  orden,
  sesionActiva,
  operadorDisponible,
  procesando,
  onIniciar,
  onCerrar,
}: PropsPanelOperadorProduccion) {
  const preparaciones = useMemo(() => orden?.partidas.flatMap((partida) => (
    partida.programaciones
      .filter((programacion) => programacion.estadoPlaneacion === 'en_preparacion')
      .map((programacion) => ({
        partidaId: partida.id,
        programacionId: programacion.id,
        etiqueta: `${partida.codigoPieza} · ${programacion.fechaProgramada} / ${programacion.turno}`,
      }))
  )) ?? [], [orden]);
  const [programacionId, setProgramacionId] = useState('');
  const [piezasProducidas, setPiezasProducidas] = useState('0');
  const [estadoDestino, setEstadoDestino] = useState<'pausada' | 'finalizada'>('finalizada');
  const [motivoPausa, setMotivoPausa] = useState<MotivoPausaSesion>('otro');
  const [notas, setNotas] = useState('');
  const [pinConfirmacion, setPinConfirmacion] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  const seleccion = preparaciones.find((item) => item.programacionId === programacionId)
    ?? preparaciones[0]
    ?? null;

  async function iniciar(): Promise<void> {
    if (!orden || !seleccion) return;
    const resultado = await onIniciar({
      ordenId: orden.id,
      partidaId: seleccion.partidaId,
      programacionId: seleccion.programacionId,
    });
    setMensaje(resultado.exito ? 'Sesión iniciada' : resultado.error);
  }

  async function cerrar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!sesionActiva) return;
    const resultado = await onCerrar({
      sesionId: sesionActiva.id,
      piezasProducidas: Number(piezasProducidas),
      estadoDestino,
      ...(estadoDestino === 'pausada' ? { motivoPausa } : {}),
      ...(notas.trim() ? { notas: notas.trim() } : {}),
      pinConfirmacion,
    });
    setMensaje(resultado.exito ? 'Sesión registrada y recurso liberado' : resultado.error);
    if (resultado.exito) setPinConfirmacion('');
  }

  return (
    <section className="rounded-base border border-foreground/10 p-4" aria-labelledby="titulo-panel-operador" data-testid="panel-operador-produccion">
      <h2 id="titulo-panel-operador" className="text-sm font-medium">Panel de operador</h2>
      <p className="mt-1 text-xs text-foreground/60">
        {operadorDisponible
          ? 'La identidad de piso está confirmada por sesión HMAC.'
          : 'Ingresa por /operador con tu PIN antes de iniciar o cerrar una sesión.'}
      </p>
      {mensaje ? <p className="mt-3 text-sm" role="status">{mensaje}</p> : null}

      {sesionActiva ? (
        <form className="mt-4 flex flex-col gap-3" onSubmit={cerrar}>
          <p className="text-sm">Sesión activa en la orden seleccionada.</p>
          <label className="flex flex-col gap-1 text-xs">
            Piezas producidas ahora
            <Input min="0" step="0.001" type="number" value={piezasProducidas} onChange={(evento) => setPiezasProducidas(evento.target.value)} required />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Resultado
            <Select value={estadoDestino} onChange={(evento) => setEstadoDestino(evento.target.value as 'pausada' | 'finalizada')}>
              <option value="finalizada">Finalizar sesión</option>
              <option value="pausada">Pausar sesión</option>
            </Select>
          </label>
          {estadoDestino === 'pausada' ? (
            <label className="flex flex-col gap-1 text-xs">
              Motivo de pausa
              <Select value={motivoPausa} onChange={(evento) => setMotivoPausa(evento.target.value as MotivoPausaSesion)}>
                {MOTIVOS_PAUSA_SESION.map((motivo) => <option key={motivo} value={motivo}>{ETIQUETAS_MOTIVO[motivo]}</option>)}
              </Select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-xs">
            Notas operativas
            <Textarea maxLength={1000} value={notas} onChange={(evento) => setNotas(evento.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Confirmar PIN
            <Input inputMode="numeric" maxLength={6} pattern="[0-9]{4,6}" type="password" value={pinConfirmacion} onChange={(evento) => setPinConfirmacion(evento.target.value)} required />
          </label>
          <Button type="submit" disabled={procesando || !operadorDisponible} data-testid="cerrar-sesion-produccion">
            {estadoDestino === 'pausada' ? 'Pausar sesión' : 'Finalizar sesión'}
          </Button>
        </form>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {!orden ? <p className="text-sm text-foreground/60">Selecciona una orden del Kanban.</p> : null}
          {orden && preparaciones.length === 0 ? <p className="text-sm text-foreground/60">La orden no tiene una programación en preparación disponible.</p> : null}
          {preparaciones.length > 0 ? (
            <>
              <label className="flex flex-col gap-1 text-xs">
                Partida preparada
                <Select value={seleccion?.programacionId ?? ''} onChange={(evento) => setProgramacionId(evento.target.value)}>
                  {preparaciones.map((item) => <option key={item.programacionId} value={item.programacionId}>{item.etiqueta}</option>)}
                </Select>
              </label>
              <Button type="button" disabled={procesando || !operadorDisponible} onClick={() => void iniciar()} data-testid="iniciar-sesion-produccion">
                Iniciar sesión
              </Button>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
