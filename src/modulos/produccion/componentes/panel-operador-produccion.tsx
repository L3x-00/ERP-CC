'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/compartido/componentes/ui/dialog';
import { formatearFecha, formatearHora, formatearNumero } from '@/compartido/utilidades/formatear';
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
  onReanudar: (datos: { ordenId: string; partidaId: string; programacionId: string; actualizadoEnEsperado: string }) => Promise<ResultadoOperacion>;
  responsables: Readonly<Record<string, string>>;
  onCerrar: (datos: {
    sesionId: string;
    piezasProducidas: number;
    estadoDestino: 'pausada' | 'finalizada';
    metaProcesoId?: string;
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

const CLASE_ETIQUETA = 'flex flex-col gap-1 text-sm font-medium text-texto-secundario';

/** Panel rápido: el navegador solicita acciones, PostgreSQL confirma cada transición. */
export function PanelOperadorProduccion({
  orden,
  sesionActiva,
  operadorDisponible,
  procesando,
  onIniciar,
  onReanudar,
  responsables,
  onCerrar,
}: PropsPanelOperadorProduccion) {
  const enrutador = useRouter();
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
  const [metaProcesoId, setMetaProcesoId] = useState('');
  const [estadoDestino, setEstadoDestino] = useState<'pausada' | 'finalizada'>('finalizada');
  const [motivoPausa, setMotivoPausa] = useState<MotivoPausaSesion>('otro');
  const [notas, setNotas] = useState('');
  const [pinConfirmacion, setPinConfirmacion] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [confirmarReanudacion, setConfirmarReanudacion] = useState(false);
  const [errorReanudacion, setErrorReanudacion] = useState<string | null>(null);

  const seleccion = preparaciones.find((item) => item.programacionId === programacionId)
    ?? preparaciones[0]
    ?? null;
  // PRD-09: la sesión activa pertenece a una partida con metas; se preselecciona
  // el proceso de su programación y, si no coincide, el primero con pendientes.
  const partidaSesionActiva = sesionActiva
    ? orden?.partidas.find((partida) => partida.id === sesionActiva.partidaId) ?? null
    : null;
  const metasSesion = partidaSesionActiva?.metasProceso ?? [];
  const secuenciaProgramacion = sesionActiva
    ? partidaSesionActiva?.programaciones.find(
      (programacion) => programacion.id === sesionActiva.programacionId,
    )?.secuencia
    : undefined;
  const metaPorDefecto = metasSesion.find((meta) => meta.secuencia === secuenciaProgramacion)
    ?? metasSesion.find((meta) => meta.pendientePiezas > 0)
    ?? metasSesion[metasSesion.length - 1]
    ?? null;
  const metaSeleccionada = metasSesion.find((meta) => meta.id === metaProcesoId) ?? metaPorDefecto;
  const ultimaPausa = (() => {
    if (!orden || orden.estadoKanban !== 'pausada') return null;
    const sesiones = [...orden.sesiones]
      .sort((primera, segunda) => segunda.creadoEn.localeCompare(primera.creadoEn)
        || segunda.id.localeCompare(primera.id));
    const programacionesVistas = new Set<string>();
    for (const sesion of sesiones) {
      if (programacionesVistas.has(sesion.programacionId)) continue;
      programacionesVistas.add(sesion.programacionId);
      if (sesion.estadoSesion !== 'pausada') continue;
      const partida = orden.partidas.find((item) => item.id === sesion.partidaId);
      const programacion = partida?.programaciones.find((item) =>
        item.id === sesion.programacionId && item.estadoPlaneacion === 'bloqueada');
      if (partida && programacion) return { sesion, partida, programacion };
    }
    return null;
  })();

  async function reanudar(): Promise<void> {
    if (!orden || !ultimaPausa) return;
    setErrorReanudacion(null);
    const resultado = await onReanudar({
      ordenId: orden.id, partidaId: ultimaPausa.partida.id,
      programacionId: ultimaPausa.programacion.id,
      actualizadoEnEsperado: ultimaPausa.programacion.actualizadoEn,
    });
    if (resultado.exito) {
      setConfirmarReanudacion(false);
      setMensaje('Sesión reanudada y recurso reservado');
    } else setErrorReanudacion(resultado.error);
  }

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
      ...(metaSeleccionada ? { metaProcesoId: metaSeleccionada.id } : {}),
      ...(estadoDestino === 'pausada' ? { motivoPausa } : {}),
      ...(notas.trim() ? { notas: notas.trim() } : {}),
      pinConfirmacion,
    });
    setMensaje(resultado.exito ? 'Sesión registrada y recurso liberado' : resultado.error);
    if (resultado.exito) setPinConfirmacion('');
  }

  return (
    <section
      id="panel-operador-produccion"
      className="rounded-lg border border-borde bg-superficie p-4"
      aria-labelledby="titulo-panel-operador"
      data-testid="panel-operador-produccion"
    >
      <h2 id="titulo-panel-operador" className="text-base font-semibold text-texto-primario">
        Panel de operador
      </h2>
      {orden ? (
        <p className="mt-1 text-sm text-texto-secundario" data-testid="orden-seleccionada-panel">
          Orden seleccionada: <span className="font-mono font-medium text-texto-primario">{orden.folio}</span>
        </p>
      ) : null}
      <p className="mt-1 text-sm text-texto-secundario">
        {operadorDisponible
          ? 'La identidad de piso está confirmada por sesión HMAC.'
          : 'Ingresa por /operador con tu PIN antes de iniciar o cerrar una sesión.'}
      </p>
      {!operadorDisponible ? (
        <Button
          type="button"
          variante="contorno"
          tamano="sm"
          className="mt-2 self-start"
          data-testid="abrir-terminal-operador"
          onClick={() => enrutador.push('/operador')}
        >
          Abrir terminal de operador (/operador)
        </Button>
      ) : null}
      {mensaje ? <p className="mt-3 text-sm text-texto-primario" role="status">{mensaje}</p> : null}

      {sesionActiva ? (
        <form className="mt-4 flex flex-col gap-3" onSubmit={cerrar}>
          <p className="text-sm text-texto-secundario">Sesión activa en la orden seleccionada.</p>
          <label className={CLASE_ETIQUETA}>
            Piezas producidas ahora
            <Input
              className="min-h-11"
              min="0"
              step="0.001"
              type="number"
              value={piezasProducidas}
              onChange={(evento) => setPiezasProducidas(evento.target.value)}
              required
            />
          </label>
          {metasSesion.length > 1 ? (
            <label className={CLASE_ETIQUETA}>
              Proceso trabajado
              <Select
                className="min-h-11"
                data-testid="meta-proceso-cierre"
                value={metaSeleccionada?.id ?? ''}
                onChange={(evento) => setMetaProcesoId(evento.target.value)}
              >
                {metasSesion.map((meta) => (
                  <option key={meta.id} value={meta.id}>
                    {meta.nombre} · {formatearNumero(meta.hechoPiezas)}/{formatearNumero(meta.metaPiezas)}
                    {' · '}{formatearNumero(meta.pendientePiezas)} pend · {Math.round(meta.porcentaje)}%
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          <label className={CLASE_ETIQUETA}>
            Resultado
            <Select
              className="min-h-11"
              value={estadoDestino}
              onChange={(evento) => setEstadoDestino(evento.target.value as 'pausada' | 'finalizada')}
            >
              <option value="finalizada">Finalizar sesión</option>
              <option value="pausada">Pausar sesión</option>
            </Select>
          </label>
          {estadoDestino === 'pausada' ? (
            <label className={CLASE_ETIQUETA}>
              Motivo de pausa
              <Select
                className="min-h-11"
                value={motivoPausa}
                onChange={(evento) => setMotivoPausa(evento.target.value as MotivoPausaSesion)}
              >
                {MOTIVOS_PAUSA_SESION.map((motivo) => <option key={motivo} value={motivo}>{ETIQUETAS_MOTIVO[motivo]}</option>)}
              </Select>
            </label>
          ) : null}
          <label className={CLASE_ETIQUETA}>
            Notas operativas
            <Textarea
              className="min-h-11"
              maxLength={1000}
              value={notas}
              onChange={(evento) => setNotas(evento.target.value)}
            />
          </label>
          <label className={CLASE_ETIQUETA}>
            Confirmar PIN
            <Input
              className="min-h-11"
              inputMode="numeric"
              maxLength={6}
              pattern="[0-9]{4,6}"
              type="password"
              value={pinConfirmacion}
              onChange={(evento) => setPinConfirmacion(evento.target.value)}
              required
            />
          </label>
          <Button type="submit" tamano="lg" disabled={procesando || !operadorDisponible} data-testid="cerrar-sesion-produccion">
            {estadoDestino === 'pausada' ? 'Pausar sesión' : 'Finalizar sesión'}
          </Button>
        </form>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {!orden ? <p className="text-sm text-texto-secundario">Selecciona una orden del Kanban.</p> : null}
          {orden && preparaciones.length === 0 && !ultimaPausa ? (
            <div className="flex flex-col gap-2 rounded-md border border-borde bg-superficie-2/40 p-3">
              <p className="text-sm text-texto-secundario">
                Para operar {orden.folio}: primero programa su partida y usa «Iniciar preparación»
                en Planeación; después entra por /operador con el PIN del operador y vuelve a esta
                pantalla para iniciar o cerrar la sesión.
              </p>
              <Button
                type="button"
                variante="contorno"
                tamano="sm"
                className="self-start"
                data-testid="ir-planeacion-preparar"
                onClick={() => enrutador.push('/planeacion')}
              >
                Programar la partida en Planeación
              </Button>
            </div>
          ) : null}
          {preparaciones.length > 0 ? (
            <>
              <label className={CLASE_ETIQUETA}>
                Partida preparada
                <Select
                  className="min-h-11"
                  value={seleccion?.programacionId ?? ''}
                  onChange={(evento) => setProgramacionId(evento.target.value)}
                >
                  {preparaciones.map((item) => <option key={item.programacionId} value={item.programacionId}>{item.etiqueta}</option>)}
                </Select>
              </label>
              <Button type="button" tamano="lg" disabled={procesando || !operadorDisponible} onClick={() => void iniciar()} data-testid="iniciar-sesion-produccion">
                Iniciar sesión
              </Button>
            </>
          ) : null}
          {ultimaPausa && operadorDisponible ? (
            <Button type="button" tamano="lg" variante="secundario"
              disabled={procesando} onClick={() => { setErrorReanudacion(null); setConfirmarReanudacion(true); }}>
              Continuar sesión pausada
            </Button>
          ) : null}
        </div>
      )}
      <Dialog open={confirmarReanudacion} onOpenChange={(abierto) => {
        if (!procesando) setConfirmarReanudacion(abierto);
      }}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Reanudar {orden?.folio}</DialogTitle>
            <DialogDescription>Revisa la última sesión. Continuar vuelve a comprobar capacidad, recurso y operador; cancelar conserva la pausa.</DialogDescription>
          </DialogHeader>
          {ultimaPausa ? <div className="grid max-h-[45vh] min-h-0 shrink gap-1 overflow-y-auto pr-1 text-sm">
            <p>Operador: {responsables[ultimaPausa.sesion.operadorId] ?? 'Operador histórico'}</p>
            <p>Horario: {formatearFecha(ultimaPausa.sesion.fechaInicio)} · {formatearHora(ultimaPausa.sesion.fechaInicio)}–{ultimaPausa.sesion.fechaFin ? formatearHora(ultimaPausa.sesion.fechaFin) : 'sin cierre'}</p>
            <p>Partida: {ultimaPausa.partida.codigoPieza} · {formatearNumero(ultimaPausa.sesion.piezasProducidas)} piezas · {formatearNumero(ultimaPausa.sesion.horasNetas)} h netas</p>
            {ultimaPausa.sesion.motivoPausa ? <p>Motivo: {ETIQUETAS_MOTIVO[ultimaPausa.sesion.motivoPausa]}</p> : null}
            {ultimaPausa.sesion.notas ? <p className="whitespace-pre-wrap">Notas: {ultimaPausa.sesion.notas}</p> : null}
          </div> : null}
          {errorReanudacion ? <p role="alert" className="text-sm text-peligro-texto">{errorReanudacion}</p> : null}
          <DialogFooter className="static mt-2 shrink-0">
            <Button type="button" variante="contorno" disabled={procesando} onClick={() => setConfirmarReanudacion(false)}>Cancelar</Button>
            <Button type="button" disabled={procesando || !ultimaPausa} onClick={() => void reanudar()}>{procesando ? 'Reanudando…' : 'Continuar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
