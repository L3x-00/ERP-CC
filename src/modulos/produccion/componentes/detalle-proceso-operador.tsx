'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { BarraProgreso } from '@/compartido/componentes/diseno/barra-progreso';
import { cn } from '@/compartido/utilidades/cn';
import { formatearNumero } from '@/compartido/utilidades/formatear';
import type { MotivoPausaCatalogo } from '@/modulos/produccion/servicios/consultas-b6-servicio';
import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/indice';
import { obtenerUrlArchivoPisoAccion } from '@/modulos/ordenes/acciones/obtener-url-archivo-piso';
import {
  etiquetaDiaLargo,
  etiquetaFechaHora,
  horasLegibles,
  tamanoLegible,
  textoCompromiso,
  turnoLegible,
} from '@/modulos/produccion/utilidades/formato-operador';

export type ResultadoOperacion = { exito: true } | { exito: false; error: string };

export interface AccionesDetalleProceso {
  reclamar: (proceso: ProcesoEspacioOperador, fecha: string, turno: string) => Promise<ResultadoOperacion>;
  mover: (proceso: ProcesoEspacioOperador, fecha: string, turno: string) => Promise<ResultadoOperacion>;
  liberar: (proceso: ProcesoEspacioOperador) => Promise<ResultadoOperacion>;
  iniciar: (proceso: ProcesoEspacioOperador) => void;
  reanudar: (proceso: ProcesoEspacioOperador) => Promise<ResultadoOperacion>;
  cerrar: (proceso: ProcesoEspacioOperador, datos: {
    sesionId: string;
    piezasProducidas: number;
    estadoDestino: 'pausada' | 'finalizada';
    motivoPausa?: string;
    notas?: string;
    pinConfirmacion: string;
  }) => Promise<ResultadoOperacion>;
}

export interface PropsDetalleProceso {
  proceso: ProcesoEspacioOperador | null;
  hoy: string;
  soloLectura: boolean;
  procesando: boolean;
  motivosPausa: MotivoPausaCatalogo[];
  acciones: AccionesDetalleProceso;
  onCerrar: () => void;

  presentacion?: 'dialogo' | 'integrado';
}

const TURNOS = ['matutino', 'vespertino', 'nocturno'] as const;
const CLASE_ETIQUETA = 'grid gap-1 text-sm font-medium text-texto-secundario';

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-texto-tenue">{etiqueta}</dt>
      <dd className="break-words text-sm font-medium text-texto-primario">{valor}</dd>
    </div>
  );
}

/** C10: ficha completa de la operaciÃ³n con las acciones que permite su estado. */
export function DetalleProcesoOperador({
  proceso,
  hoy,
  soloLectura,
  procesando,
  motivosPausa,
  acciones,
  onCerrar,
  presentacion = 'dialogo',
}: PropsDetalleProceso) {
  const [fecha, setFecha] = useState(proceso?.reclamo?.fecha ?? hoy);
  const [turno, setTurno] = useState<string>(proceso?.reclamo?.turno ?? 'matutino');
  const [piezas, setPiezas] = useState('0');
  const [estadoDestino, setEstadoDestino] = useState<'pausada' | 'finalizada'>('finalizada');
  const [motivoPausa, setMotivoPausa] = useState('');
  const [notas, setNotas] = useState('');
  const [pin, setPin] = useState('');
  const [mensaje, setMensaje] = useState<ResultadoOperacion | null>(null);
  const [archivoAbriendo, setArchivoAbriendo] = useState<string | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);

  if (!proceso) return null;

  const motivoSeleccionado = motivosPausa.find((motivo) => motivo.codigo === motivoPausa)
    ?? motivosPausa[0]
    ?? null;
  const puedeReclamar = !soloLectura && !proceso.reclamo && proceso.columna !== 'lista';
  const puedeMover = !soloLectura && proceso.reclamadoPorMi === true
    && proceso.sesionActiva === null
    && proceso.programacion?.estadoPlaneacion !== 'en_proceso'
    && proceso.programacion?.estadoPlaneacion !== 'bloqueada';
  const puedeLiberar = !soloLectura && proceso.reclamadoPorMi === true
    && proceso.sesionActiva === null
    && proceso.programacion?.estadoPlaneacion !== 'en_proceso'
    && proceso.programacion?.estadoPlaneacion !== 'bloqueada';
  const abrirHoja = proceso.estadoOrden === 'en_proceso'
    && (proceso.reclamadoPorMi || proceso.sesionActiva !== null);

  async function reclamar(): Promise<void> {
    const resultado = await acciones.reclamar(proceso!, fecha, turno);
    setMensaje(resultado);
  }

  async function mover(): Promise<void> {
    const resultado = await acciones.mover(proceso!, fecha, turno);
    setMensaje(resultado);
  }

  async function liberar(): Promise<void> {
    const resultado = await acciones.liberar(proceso!);
    setMensaje(resultado);
  }

  async function reanudar(): Promise<void> {
    const resultado = await acciones.reanudar(proceso!);
    setMensaje(resultado);
  }

  async function cerrar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!proceso?.sesionActiva) return;
    if (!/^\d{4,6}$/.test(pin)) {
      setMensaje({ exito: false, error: 'El PIN debe tener entre 4 y 6 dÃ­gitos' });
      return;
    }
    const resultado = await acciones.cerrar(proceso, {
      sesionId: proceso.sesionActiva.id,
      piezasProducidas: Number(piezas),
      estadoDestino,
      ...(estadoDestino === 'pausada' && motivoSeleccionado ? { motivoPausa: motivoSeleccionado.codigo } : {}),
      ...(notas.trim() ? { notas: notas.trim() } : {}),
      pinConfirmacion: pin,
    });
    setMensaje(resultado);
    if (resultado.exito) {
      setPin('');
      setNotas('');
    }
  }

  async function abrirArchivo(archivoId: string): Promise<void> {
    if (!proceso || archivoAbriendo !== null) return;
    setArchivoAbriendo(archivoId);
    setErrorArchivo(null);
    try {
      const respuesta = await obtenerUrlArchivoPisoAccion({
        ordenId: proceso.ordenId,
        archivoId,
      });
      if (!respuesta.exito) {
        setErrorArchivo(respuesta.error);
        return;
      }
      // La URL firmada dura cinco minutos y no se conserva en el estado.
      // Se abre en la pestaña actual para evitar el bloqueo de ventanas emergentes.
      if (!respuesta.datos?.url) {
        setMensaje({
          exito: false,
          error: 'No se pudo obtener el enlace de descarga del archivo.',
        });
        return;
      }

      window.location.assign(respuesta.datos.url);
    } catch {
      setErrorArchivo('No se pudo abrir el archivo. Intenta de nuevo.');
    } finally {
      setArchivoAbriendo(null);
    }
  }

  const contenido = (
    <div className="flex flex-col gap-4">
        <header className="space-y-1">
          {presentacion === 'dialogo' ? (
            <>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-texto-secundario">{proceso.folioOrden}</span>
                <span>{proceso.codigoPieza}</span>
                <Badge variante={proceso.urgencia === 'vencida' || proceso.urgencia === 'urgente' ? 'peligro' : proceso.urgencia === 'proxima' ? 'alerta' : 'neutro'}>
                  {textoCompromiso(proceso.fechaCompromiso, hoy)}
                </Badge>
                {proceso.prioridad !== 'normal' ? (
                  <Badge variante="alerta">Prioridad {proceso.prioridad}</Badge>
                ) : null}
              </DialogTitle>
              <DialogDescription>
                {proceso.clienteNombre} Â· {proceso.descripcion ?? 'Sin descripciÃ³n de pieza'}
              </DialogDescription>
            </>
          ) : (
            <>
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-texto-primario">
                <span className="font-mono text-sm text-texto-secundario">{proceso.folioOrden}</span>
                <span>{proceso.codigoPieza}</span>
                <Badge variante={proceso.urgencia === 'vencida' || proceso.urgencia === 'urgente' ? 'peligro' : proceso.urgencia === 'proxima' ? 'alerta' : 'neutro'}>
                  {textoCompromiso(proceso.fechaCompromiso, hoy)}
                </Badge>
                {proceso.prioridad !== 'normal' ? (
                  <Badge variante="alerta">Prioridad {proceso.prioridad}</Badge>
                ) : null}
              </h2>
              <p className="text-sm text-texto-secundario">
                {proceso.clienteNombre} Â· {proceso.descripcion ?? 'Sin descripciÃ³n de pieza'}
              </p>
            </>
          )}
        </header>

        {proceso.notas ? (
          <p className="rounded-md bg-superficie-2 p-3 text-sm text-texto-secundario">
            <span className="font-semibold text-texto-primario">Notas de la orden: </span>
            {proceso.notas}
          </p>
        ) : null}

        <section aria-label="Datos de la orden y la partida" className="grid gap-3 sm:grid-cols-2">
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-superficie-2/60 p-3">
            <Dato etiqueta="Cliente" valor={proceso.clienteNombre} />
            <Dato etiqueta="Compromiso" valor={`${etiquetaDiaLargo(proceso.fechaCompromiso)} Â· ${textoCompromiso(proceso.fechaCompromiso, hoy)}`} />
            <Dato etiqueta="Estado orden" valor={`${proceso.estadoOrden} / ${proceso.estadoSii}`} />
            <Dato etiqueta="Fecha operativa" valor={etiquetaDiaLargo(proceso.fechaOperativa)} />
            <Dato etiqueta="Pieza" valor={proceso.codigoPieza} />
            <Dato etiqueta="Unidad" valor={proceso.unidadMedida} />
            <Dato etiqueta="Solicitada" valor={formatearNumero(proceso.cantidadSolicitada, 0)} />
            <Dato etiqueta="Producida" valor={formatearNumero(proceso.cantidadProducida, 0)} />
            {proceso.esExterno ? <Dato etiqueta="Externo" valor={proceso.proveedorExterno ?? 'SÃ­'} /> : null}
            {proceso.folioSii ? <Dato etiqueta="Folio SII" valor={proceso.folioSii} /> : null}
          </dl>

          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-superficie-2/60 p-3">
            <Dato etiqueta="Proceso" valor={`${proceso.secuencia}. ${proceso.procesoNombre}`} />
            <Dato etiqueta="Ãrea" valor={proceso.areaNombre} />
            <Dato etiqueta="Meta del proceso" valor={`${formatearNumero(proceso.hechoPiezas, 0)}/${formatearNumero(proceso.metaPiezas, 0)}`} />
            <Dato etiqueta="Pendiente" valor={formatearNumero(proceso.pendientePiezas, 0)} />
            <Dato etiqueta="Horas estimadas" valor={horasLegibles(proceso.horasEstimadas)} />
            <Dato etiqueta="Material" valor={proceso.material
              ? `${proceso.material.codigo} Â· ${proceso.material.nombre}`
              : 'Sin material registrado'} />
            {proceso.material?.anchoMm && proceso.material.largoMm ? (
              <Dato etiqueta="Dimensiones" valor={`${formatearNumero(proceso.material.anchoMm, 0)} Ã— ${formatearNumero(proceso.material.largoMm, 0)} mm`} />
            ) : null}
            <Dato etiqueta="ProgramaciÃ³n" valor={proceso.programacion
              ? `${etiquetaDiaLargo(proceso.programacion.fecha)} Â· ${turnoLegible(proceso.programacion.turno)} Â· ${proceso.programacion.recursoNombre ?? 'recurso'}`
              : 'Sin programar'} />
          </dl>
        </section>

        <div className="grid gap-1">
          <p className="text-xs uppercase tracking-wide text-texto-tenue">Avance del proceso</p>
          <BarraProgreso valor={proceso.porcentaje} tono={proceso.columna === 'lista' ? 'exito' : 'acento'} mostrarPorcentaje etiqueta="Avance del proceso" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <section aria-label="Ruta de procesos" className="rounded-lg border border-borde p-3">
            <h3 className="mb-2 text-sm font-semibold text-texto-primario">Ruta de fabricaciÃ³n</h3>
            <ol className="grid gap-1.5">
              {proceso.procesosRuteo.map((paso) => {
                const actual = paso.id === proceso.metaProcesoId
                  || (proceso.metaProcesoId === null && paso.id === `${proceso.partidaId}:sin-proceso`);
                return (
                  <li
                    key={paso.id}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm',
                      actual ? 'bg-acento-suave font-semibold text-acento-texto' : 'text-texto-secundario',
                    )}
                  >
                    <span className="truncate">
                      {paso.completado ? 'âœ“ ' : `${paso.secuencia}. `}
                      {paso.nombre}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatearNumero(paso.hechoPiezas, 0)}/{formatearNumero(paso.metaPiezas, 0)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          <section aria-label="Archivos de la orden" className="rounded-lg border border-borde p-3">
            <h3 className="mb-2 text-sm font-semibold text-texto-primario">
              Planos y archivos ({proceso.archivos.length})
            </h3>
            {proceso.archivos.length === 0 ? (
              <p className="text-sm text-texto-secundario">Sin archivos vigentes en la orden.</p>
            ) : (
              <ul className="grid max-h-40 gap-1 overflow-y-auto pr-1 text-sm">
                {proceso.archivos.map((archivo) => (
                  <li key={archivo.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate" title={archivo.nombre}>{archivo.nombre}</span>
                    <span className="shrink-0 text-xs text-texto-tenue">{tamanoLegible(archivo.tamanoBytes)}</span>
                    <button
                      type="button"
                      onClick={() => void abrirArchivo(archivo.id)}
                      disabled={archivoAbriendo !== null}
                      className="shrink-0 text-xs font-semibold text-acento-texto underline-offset-2 hover:underline disabled:opacity-50"
                      aria-label={`Abrir o descargar ${archivo.nombre}`}
                    >
                      {archivoAbriendo === archivo.id ? 'Abriendo…' : 'Ver / Descargar'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {errorArchivo ? (
              <p role="alert" className="mt-2 text-xs text-peligro-texto">{errorArchivo}</p>
            ) : null}
            {abrirHoja ? (
              <Link
                href={`/produccion-piso/hoja/${proceso.ordenId}`}
                className="mt-2 inline-flex text-sm font-semibold text-acento-texto underline-offset-2 hover:underline"
                data-testid="abrir-hoja-detalle"
              >
                Abrir hoja de trabajo
              </Link>
            ) : null}
          </section>
        </div>

        <section aria-label="Historial de sesiones" className="rounded-lg border border-borde p-3">
          <h3 className="mb-2 text-sm font-semibold text-texto-primario">
            Sesiones registradas ({proceso.sesiones.length})
          </h3>
          {proceso.sesiones.length === 0 ? (
            <p className="text-sm text-texto-secundario">AÃºn no hay sesiones para este proceso.</p>
          ) : (
            <ul className="grid max-h-44 gap-2 overflow-y-auto pr-1 text-sm">
              {proceso.sesiones.map((sesion) => (
                <li key={sesion.id} className="rounded-md bg-superficie-2/60 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{sesion.operadorNombre}</span>
                    <Badge variante={sesion.estadoSesion === 'activa' ? 'exito' : sesion.estadoSesion === 'pausada' ? 'alerta' : 'neutro'}>
                      {sesion.estadoSesion}
                    </Badge>
                  </div>
                  <p className="text-xs text-texto-secundario">
                    {etiquetaFechaHora(sesion.fechaInicio)} â†’ {etiquetaFechaHora(sesion.fechaFin)}
                    {' Â· '}{formatearNumero(sesion.piezasProducidas, 0)} piezas
                    {' Â· '}{horasLegibles(sesion.horasNetas)} netas
                  </p>
                  {sesion.motivoPausa ? (
                    <p className="text-xs text-advertencia-texto">Motivo: {sesion.motivoPausa}</p>
                  ) : null}
                  {sesion.notas ? (
                    <p className="whitespace-pre-wrap text-xs text-texto-secundario">{sesion.notas}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {soloLectura ? (
          <p className="rounded-md bg-advertencia-suave p-3 text-sm text-advertencia-texto">
            Vista de solo lectura: no puedes reclamar, iniciar ni cerrar procesos.
          </p>
        ) : null}

        {mensaje ? (
          <p
            role="alert"
            className={cn('text-sm', mensaje.exito ? 'text-exito-texto' : 'text-peligro-texto')}
          >
            {mensaje.exito ? 'AcciÃ³n registrada. Actualizando el tableroâ€¦' : mensaje.error}
          </p>
        ) : null}

        {proceso.reclamo ? (
          <p className="rounded-md bg-superficie-2 p-3 text-sm text-texto-secundario">
            <span className="font-semibold text-texto-primario">Reserva: </span>
            {proceso.reclamadoPorMi ? 'tuya' : `de ${proceso.nombreReclamante ?? 'otro operador'}`}
            {' Â· '}{etiquetaDiaLargo(proceso.reclamo.fecha)} Â· {turnoLegible(proceso.reclamo.turno)}
            {' Â· '}{horasLegibles(proceso.reclamo.horasEstimadas)}
          </p>
        ) : null}

        {!soloLectura ? (
          <section aria-label="Acciones del proceso" className="grid gap-3 rounded-lg border border-borde-fuerte p-3">
            {proceso.sesionActiva ? (
              <form className="grid gap-3" onSubmit={cerrar}>
                <p className="text-sm font-semibold text-texto-primario">Cerrar la sesiÃ³n en marcha</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={CLASE_ETIQUETA}>
                    Piezas producidas
                    <Input
                      min="0"
                      step="0.001"
                      type="number"
                      value={piezas}
                      onChange={(evento) => setPiezas(evento.target.value)}
                      required
                    />
                  </label>
                  <label className={CLASE_ETIQUETA}>
                    Resultado
                    <Select value={estadoDestino} onChange={(evento) => setEstadoDestino(evento.target.value as 'pausada' | 'finalizada')}>
                      <option value="finalizada">Finalizar sesiÃ³n de trabajo</option>
                      <option value="pausada">Pausar sesiÃ³n de trabajo</option>
                    </Select>
                  </label>
                  {estadoDestino === 'pausada' ? (
                    <label className={CLASE_ETIQUETA}>
                      Motivo de pausa
                      <Select value={motivoSeleccionado?.codigo ?? ''} onChange={(evento) => setMotivoPausa(evento.target.value)}>
                        {motivosPausa.map((motivo) => (
                          <option key={motivo.codigo} value={motivo.codigo}>
                            {motivo.nombre}{motivo.requiereNota ? ' (nota obligatoria)' : ''}
                          </option>
                        ))}
                      </Select>
                    </label>
                  ) : null}
                  <label className={CLASE_ETIQUETA}>
                    PIN de confirmaciÃ³n
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      pattern="[0-9]{4,6}"
                      type="password"
                      value={pin}
                      onChange={(evento) => setPin(evento.target.value)}
                      required
                    />
                  </label>
                </div>
                <label className={CLASE_ETIQUETA}>
                  Notas{estadoDestino === 'pausada' && motivoSeleccionado?.requiereNota ? ' (obligatorias)' : ' (opcional)'}
                  <Textarea
                    maxLength={1000}
                    value={notas}
                    onChange={(evento) => setNotas(evento.target.value)}
                    required={estadoDestino === 'pausada' && motivoSeleccionado?.requiereNota === true}
                  />
                </label>
                <Button type="submit" tamano="lg" disabled={procesando} data-testid="cerrar-sesion-detalle">
                  {estadoDestino === 'pausada'
                    ? 'Pausar sesiÃ³n de trabajo'
                    : 'Finalizar sesiÃ³n de trabajo'}
                </Button>
              </form>
            ) : null}

            {proceso.columna !== 'lista' && !proceso.sesionActiva ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className={CLASE_ETIQUETA}>
                  DÃ­a de la jornada
                  <Input
                    type="date"
                    min={hoy}
                    value={fecha}
                    onChange={(evento) => setFecha(evento.target.value)}
                  />
                </label>
                <label className={CLASE_ETIQUETA}>
                  Turno
                  <Select value={turno} onChange={(evento) => setTurno(evento.target.value)}>
                    {TURNOS.map((valor) => (
                      <option key={valor} value={valor}>{turnoLegible(valor)}</option>
                    ))}
                  </Select>
                </label>
                {puedeReclamar ? (
                  <Button type="button" tamano="lg" disabled={procesando} onClick={() => void reclamar()} data-testid="reclamar-detalle">
                    Reclamar
                  </Button>
                ) : null}
                {puedeMover ? (
                  <Button type="button" tamano="lg" variante="contorno" disabled={procesando} onClick={() => void mover()} data-testid="mover-detalle">
                    Mover reserva
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {proceso.puedeIniciar ? (
                <Button type="button" tamano="lg" disabled={procesando} onClick={() => acciones.iniciar(proceso)} data-testid="iniciar-detalle">
                  Iniciar proceso
                </Button>
              ) : null}
              {proceso.puedeReanudar ? (
                <Button type="button" tamano="lg" variante="secundario" disabled={procesando} onClick={() => void reanudar()} data-testid="reanudar-detalle">
                  Continuar sesiÃ³n pausada
                </Button>
              ) : null}
              {puedeLiberar ? (
                <Button type="button" variante="destructivo" disabled={procesando} onClick={() => void liberar()} data-testid="liberar-detalle">
                  Liberar reserva
                </Button>
              ) : null}
            </div>

            {proceso.motivoNoInicia ? (
              <p className="text-xs text-texto-secundario">{proceso.motivoNoInicia}</p>
            ) : null}
          </section>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" variante="contorno" onClick={onCerrar}>Cerrar ficha</Button>
        </div>
    </div>
  );

  if (presentacion === 'integrado') {
    return (
      <section
        data-testid="detalle-proceso-integrado"
        aria-label={`Detalle de ${proceso.folioOrden} ${proceso.codigoPieza}`}
        className="rounded-xl border border-borde bg-superficie p-4"
      >
        {contenido}
      </section>
    );
  }

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto) onCerrar(); }}>
      <DialogContent
        className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-[880px] flex-col gap-4 overflow-y-auto"
        data-testid="detalle-proceso"
        aria-label={`Detalle de ${proceso.folioOrden} ${proceso.codigoPieza}`}
      >
        {contenido}
      </DialogContent>
    </Dialog>
  );
}

