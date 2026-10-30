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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { BarraProgreso } from '@/compartido/componentes/diseno/barra-progreso';
import { cn } from '@/compartido/utilidades/cn';
import { formatearNumero } from '@/compartido/utilidades/formatear';
import type { MotivoPausaCatalogo } from '@/modulos/produccion/servicios/consultas-b6-servicio';
import type { CierreSesionRegistrado } from '@/modulos/produccion/servicios/sesiones-servicio';
import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/indice';
import { ETIQUETAS_COLUMNA } from '@/modulos/produccion/tipos/indice';
import { registrarInspeccionAccion } from '@/modulos/produccion/acciones/registrar-inspeccion';
import { obtenerUrlArchivoPisoAccion } from '@/modulos/ordenes/acciones/obtener-url-archivo-piso';
import {
  etiquetaDiaLargo,
  etiquetaFechaHora,
  horasLegibles,
  tamanoLegible,
  textoCompromiso,
  turnoLegible,
} from '@/modulos/produccion/utilidades/formato-operador';
import {
  resumirConsumosMateriales,
  type ConsumoMaterialVisible,
} from '@/modulos/produccion/utilidades/consumo-material-operador';
import type { MaterialPiso } from '@/modulos/ordenes/componentes/control-piso-panel';

export type ResultadoOperacion =
  | { exito: true; datos?: CierreSesionRegistrado }
  | { exito: false; error: string; codigo?: string };

interface ResumenCierreSesion {
  material: MaterialPiso;
  cantidadUsada: number;
  cantidadMerma: number;
  notas: string | null;
  resultado: CierreSesionRegistrado;
}

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
    consumo?: {
      materialId: string;
      cantidadUsada: number;
      cantidadScrap: number;
    };
  }) => Promise<ResultadoOperacion>;
}

export interface PropsDetalleProceso {
  proceso: ProcesoEspacioOperador | null;
  hoy: string;
  soloLectura: boolean;
  procesando: boolean;
  motivosPausa: MotivoPausaCatalogo[];
  acciones: AccionesDetalleProceso;
  materiales: MaterialPiso[];
  consumos: ConsumoMaterialVisible[];
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

/** C10: ficha completa de la operación con las acciones que permite su estado. */
export function DetalleProcesoOperador({
  proceso,
  hoy,
  soloLectura,
  procesando,
  motivosPausa,
  acciones,
  materiales,
  consumos,
  onCerrar,
  presentacion = 'dialogo',
}: PropsDetalleProceso) {
  const [fecha, setFecha] = useState(proceso?.reclamo?.fecha ?? hoy);
  const [turno, setTurno] = useState<string>(proceso?.reclamo?.turno ?? 'matutino');
  const [piezas, setPiezas] = useState('0');
  const [materialId, setMaterialId] = useState('');
  const [cantidadUsada, setCantidadUsada] = useState('0');
  const [cantidadMerma, setCantidadMerma] = useState('0');
  const [estadoDestino, setEstadoDestino] = useState<'pausada' | 'finalizada'>('finalizada');
  const [motivoPausa, setMotivoPausa] = useState('');
  const [notas, setNotas] = useState('');
  const [pin, setPin] = useState('');
  const [mensaje, setMensaje] = useState<ResultadoOperacion | null>(null);
  const [resumenCierre, setResumenCierre] = useState<ResumenCierreSesion | null>(null);
  const [archivoAbriendo, setArchivoAbriendo] = useState<string | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [primeraPiezaAbierta, setPrimeraPiezaAbierta] = useState(false);
  const [resultadoPrimeraPieza, setResultadoPrimeraPieza] = useState<'APROBADA' | 'RECHAZADA'>('APROBADA');
  const [observacionesPrimeraPieza, setObservacionesPrimeraPieza] = useState('');
  const [procesandoPrimeraPieza, setProcesandoPrimeraPieza] = useState(false);
  const [mensajePrimeraPieza, setMensajePrimeraPieza] = useState<
    { tipo: 'ok' | 'error'; texto: string } | null
  >(null);

  if (!proceso) return null;

  const consumosDePartida = resumirConsumosMateriales(consumos).filter(
    (consumo) => consumo.partidaId === proceso.partidaId,
  );

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

  async function ejecutarCierre(): Promise<void> {
    if (!proceso?.sesionActiva) return;
    if (!/^\d{4,6}$/.test(pin)) {
      setMensaje({ exito: false, error: 'El PIN debe tener entre 4 y 6 dígitos' });
      return;
    }
    const usada = Number(cantidadUsada);
    const merma = Number(cantidadMerma);
    const materialSeleccionado = materiales.find((material) => material.id === materialId) ?? null;

    if (
      estadoDestino === 'finalizada' &&
      (
        !materialSeleccionado ||
        !Number.isFinite(usada) ||
        !Number.isFinite(merma) ||
        usada < 0 ||
        merma < 0 ||
        usada + merma <= 0
      )
    ) {
      setMensaje({
        exito: false,
        error: 'Selecciona un material e indica consumo o merma mayor a cero.',
      });
      return;
    }
    const resultado = await acciones.cerrar(proceso, {
      sesionId: proceso.sesionActiva.id,
      piezasProducidas: Number(piezas),
      estadoDestino,
      ...(estadoDestino === 'pausada' && motivoSeleccionado ? { motivoPausa: motivoSeleccionado.codigo } : {}),
      ...(notas.trim() ? { notas: notas.trim() } : {}),
      ...(estadoDestino === 'finalizada'
      ? {
          consumo: {
            materialId,
            cantidadUsada: usada,
            cantidadScrap: merma,
          },
        }
      : {}),
      pinConfirmacion: pin,
    });
    setMensaje(resultado);
    if (resultado.exito) {
      setPin('');
      setNotas('');
      if (estadoDestino === 'finalizada' && materialSeleccionado && resultado.datos) {
        setResumenCierre({
          material: materialSeleccionado,
          cantidadUsada: usada,
          cantidadMerma: merma,
          notas: notas.trim() || null,
          resultado: resultado.datos,
        });
      }
    }
  }

  function cerrar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    void ejecutarCierre();
  }

  async function liberarPrimeraPieza(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!proceso || procesandoPrimeraPieza) return;
    setProcesandoPrimeraPieza(true);
    setMensajePrimeraPieza(null);
    try {
      const aprobada = resultadoPrimeraPieza === 'APROBADA';
      const respuesta = await registrarInspeccionAccion({
        ordenId: proceso.ordenId,
        corridaId: proceso.sesionActiva?.corridaId ?? null,
        partidaId: proceso.partidaId,
        codigoItem: proceso.codigoPieza,
        tipo: 'PRIMERA_PIEZA',
        resultado: resultadoPrimeraPieza,
        cantidadInspeccionada: 1,
        cantidadOk: aprobada ? 1 : 0,
        cantidadNok: aprobada ? 0 : 1,
        cantidadRetrabajo: 0,
        ...(observacionesPrimeraPieza.trim()
          ? { observaciones: observacionesPrimeraPieza.trim() }
          : {}),
      });
      if (!respuesta.exito) {
        setMensajePrimeraPieza({ tipo: 'error', texto: respuesta.error });
        return;
      }
      setMensajePrimeraPieza({
        tipo: 'ok',
        texto: aprobada
          ? 'Primera pieza liberada. Ya puedes finalizar la sesión sin salir de este proceso.'
          : 'Primera pieza rechazada. Corrige la pieza y vuelve a liberarla antes de declarar producción.',
      });
      setPrimeraPiezaAbierta(false);
    } catch {
      setMensajePrimeraPieza({
        tipo: 'error',
        texto: 'No se pudo registrar la primera pieza. Revisa la corrida y vuelve a intentarlo.',
      });
    } finally {
      setProcesandoPrimeraPieza(false);
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
              {proceso.clienteNombre} · {proceso.descripcion ?? 'Sin descripción de pieza'}
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
              {proceso.clienteNombre} · {proceso.descripcion ?? 'Sin descripción de pieza'}
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

      <section
        aria-label="Resumen de la orden"
        className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie-2/60 p-3"
        data-testid="resumen-orden-operador"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-texto-tenue">Ruta de fabricación</p>
            <p className="mt-1 flex flex-wrap items-center gap-1 text-sm font-medium text-texto-primario">
              {(proceso.procesosRuteo.length > 0
                ? proceso.procesosRuteo
                : [{
                  id: proceso.metaProcesoId ?? `${proceso.partidaId}:sin-proceso`,
                  secuencia: proceso.secuencia,
                  nombre: proceso.procesoNombre,
                  hechoPiezas: proceso.hechoPiezas,
                  metaPiezas: proceso.metaPiezas,
                }]
              ).map((paso, indice) => {
                const actual = paso.id === proceso.metaProcesoId
                  || (proceso.metaProcesoId === null && paso.id === `${proceso.partidaId}:sin-proceso`);
                return (
                  <span key={paso.id}>
                    {indice > 0 ? <span className="mx-1 text-texto-tenue">→</span> : null}
                    <span className={actual ? 'font-semibold text-acento-texto' : undefined}>
                      {indice + 1}. {paso.nombre}
                    </span>
                  </span>
                );
              })}
            </p>
          </div>
          <Badge variante={proceso.columna === 'lista' ? 'exito' : proceso.columna === 'pausada' ? 'alerta' : 'info'}>
            {ETIQUETAS_COLUMNA[proceso.columna]}
          </Badge>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Dato etiqueta="Estado" valor={proceso.estadoOrden} />
          <Dato etiqueta="Fecha entrega" valor={etiquetaDiaLargo(proceso.fechaCompromiso)} />
          <Dato etiqueta="Planeado" valor={proceso.programacion ? etiquetaDiaLargo(proceso.programacion.fecha) : 'Sin programar'} />
          <Dato
            etiqueta="Sesiones"
            valor={`${proceso.sesiones.length} registrada${proceso.sesiones.length === 1 ? '' : 's'}`}
          />
        </dl>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <section aria-label="Qué fabricar" className="rounded-lg border border-borde p-3">
          <h3 className="mb-2 text-sm font-semibold text-texto-primario">Qué fabricar</h3>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-texto-tenue">Descripción</dt>
              <dd className="break-words font-medium text-texto-primario">
                {proceso.descripcion ?? 'Sin descripción de pieza'}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-texto-tenue">Material</dt>
              <dd className="break-words">
                {proceso.material
                  ? `${proceso.material.codigo} · ${proceso.material.nombre}`
                  : 'Sin material registrado'}
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-texto-tenue">Medidas</dt>
                <dd>
                  {proceso.material?.anchoMm && proceso.material.largoMm
                    ? `${formatearNumero(proceso.material.anchoMm, 0)} × ${formatearNumero(proceso.material.largoMm, 0)} mm`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-texto-tenue">Cantidad</dt>
                <dd className="tabular-nums">
                  {formatearNumero(proceso.cantidadSolicitada, 0)} {proceso.unidadMedida}
                </dd>
              </div>
            </div>
          </dl>
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

      <section aria-label="Datos de la operación" className="rounded-lg border border-borde p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-texto-primario">
            Esta operación: {proceso.secuencia}. {proceso.procesoNombre}
          </h3>
          <span className="text-xs text-texto-secundario">{proceso.areaNombre}</span>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Dato
            etiqueta="Meta"
            valor={`${formatearNumero(proceso.hechoPiezas, 0)}/${formatearNumero(proceso.metaPiezas, 0)} ${proceso.unidadMedida}`}
          />
          <Dato etiqueta="Pendiente" valor={`${formatearNumero(proceso.pendientePiezas, 0)} ${proceso.unidadMedida}`} />
          <Dato etiqueta="Horas estimadas" valor={horasLegibles(proceso.horasEstimadas)} />
          <Dato
            etiqueta="Programación"
            valor={proceso.programacion
              ? `${turnoLegible(proceso.programacion.turno)} · ${proceso.programacion.recursoNombre ?? 'recurso'}`
              : 'Sin programar'}
          />
          {proceso.piezasDisponibles !== null ? (
            <Dato
              etiqueta="Piezas disponibles"
              valor={`${formatearNumero(proceso.piezasDisponibles, 0)} ${proceso.unidadMedida}${proceso.procesoPrevioNombre ? ` · de ${proceso.procesoPrevioNombre}` : ''}`}
            />
          ) : null}
          {proceso.esExterno ? <Dato etiqueta="Externo" valor={proceso.proveedorExterno ?? 'Sí'} /> : null}
        </dl>
        <div className="mt-3 grid gap-1">
          <p className="text-xs uppercase tracking-wide text-texto-tenue">Avance del proceso</p>
          <BarraProgreso valor={proceso.porcentaje} tono={proceso.columna === 'lista' ? 'exito' : 'acento'} mostrarPorcentaje etiqueta="Avance del proceso" />
        </div>
      </section>

        <section aria-label="Historial de sesiones" className="rounded-lg border border-borde p-3">
          <details>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm font-semibold text-texto-primario marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40">
              <span>Sesiones registradas ({proceso.sesiones.length})</span>
              {proceso.sesionActiva ? <Badge variante="exito">sesión activa</Badge> : null}
            </summary>
            <div className="mt-3">
              {proceso.sesiones.length === 0 ? (
                <p className="text-sm text-texto-secundario">Aún no hay sesiones para este proceso.</p>
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
                        {etiquetaFechaHora(sesion.fechaInicio)} → {etiquetaFechaHora(sesion.fechaFin)}
                        {' . '}{formatearNumero(sesion.piezasProducidas, 0)} piezas
                        {' . '}{horasLegibles(sesion.horasNetas)} netas
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
            </div>
          </details>
        </section>

        <section aria-label="Consumo acumulado de materiales de la partida" className="rounded-lg border border-borde p-3">
          <details>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm font-semibold text-texto-primario marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40">
              <span>Consumo acumulado de materiales ({consumosDePartida.length})</span>
            </summary>
            <div className="mt-3">
              <p className="text-xs text-texto-secundario">
                Cantidades registradas para toda la partida, no exclusivamente para este proceso.
              </p>
              {consumosDePartida.length === 0 ? (
                <p className="mt-2 text-sm text-texto-secundario">
                  Todavía no se registraron consumos para esta partida.
                </p>
              ) : (
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {consumosDePartida.map((consumo) => {
                    const material = materiales.find((item) => item.id === consumo.materialId);
                    const unidad = material?.unidadBase ?? '';
                    return (
                      <div
                        key={`${consumo.partidaId}-${consumo.materialId}`}
                        className="rounded-md bg-superficie-2/60 p-2"
                      >
                        <dt className="text-xs text-texto-secundario">
                          {material
                            ? `${material.codigo} · ${material.nombre}`
                            : `Material ${consumo.materialId}`}
                        </dt>
                        <dd className="mt-1 text-sm tabular-nums text-texto-primario">
                          Usado: {formatearNumero(consumo.cantidadUsada, 3)} {unidad}
                          {' · '}Merma: {formatearNumero(consumo.cantidadScrap, 3)} {unidad}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </div>
          </details>
        </section>

        {soloLectura ? (
          <p className="rounded-md bg-advertencia-suave p-3 text-sm text-advertencia-texto">
            Vista de solo lectura: no puedes reclamar, iniciar ni cerrar procesos.
          </p>
        ) : null}

        {mensaje && mensaje.exito ? (
          <p role="status" className="text-sm text-exito-texto">
            Acción registrada. Actualizando el tablero…
          </p>
        ) : null}

        {mensaje && !mensaje.exito && mensaje.codigo !== 'primera_pieza_pendiente' ? (
          <p role="alert" className="text-sm text-peligro-texto">
            {mensaje.error}
          </p>
        ) : null}

        {proceso.reclamo ? (
          <p className="rounded-md bg-superficie-2 p-3 text-sm text-texto-secundario">
            <span className="font-semibold text-texto-primario">Reserva: </span>
            {proceso.reclamadoPorMi ? 'tuya' : `de ${proceso.nombreReclamante ?? 'otro operador'}`}
            {' . '}{etiquetaDiaLargo(proceso.reclamo.fecha)} . {turnoLegible(proceso.reclamo.turno)}
            {' . '}{horasLegibles(proceso.reclamo.horasEstimadas)}
          </p>
        ) : null}

        {!soloLectura ? (
          <section aria-label="Acciones del proceso" className="grid gap-3 rounded-lg border border-borde-fuerte p-3">
            {proceso.sesionActiva ? (
              <form className="grid gap-3" onSubmit={cerrar}>
                <p className="text-sm font-semibold text-texto-primario">Cerrar la sesión en marcha</p>
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
                      <option value="finalizada">Finalizar sesión de trabajo</option>
                      <option value="pausada">Pausar sesión de trabajo</option>
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
                  {estadoDestino === 'finalizada' && (
                    <div className="col-span-full grid gap-3 rounded-lg border border-borde p-3">
                      <p className="text-sm font-semibold">Consumo de material</p>

                      <label className={CLASE_ETIQUETA}>
                        Material
                        <Select
                          value={materialId}
                          onChange={(evento) => setMaterialId(evento.target.value)}
                          required
                        >
                          <option value="">Selecciona un material</option>
                          {materiales.map((material) => (
                            <option key={material.id} value={material.id}>
                              {material.codigo} — {material.nombre} ({material.unidadBase})
                            </option>
                          ))}
                        </Select>
                      </label>

                      <div className="grid grid-cols-2 gap-3">
                        <label className={CLASE_ETIQUETA}>
                          Usado
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={cantidadUsada}
                            onChange={(evento) => setCantidadUsada(evento.target.value)}
                            required
                          />
                        </label>

                        <label className={CLASE_ETIQUETA}>
                          Merma
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={cantidadMerma}
                            onChange={(evento) => setCantidadMerma(evento.target.value)}
                            required
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
                  <label className={CLASE_ETIQUETA}>
                    PIN de confirmación
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

                  <label className={CLASE_ETIQUETA}>
                    Notas{estadoDestino === 'pausada' && motivoSeleccionado?.requiereNota
                      ? ' (obligatorias)'
                      : ' (opcional)'}
                    <Textarea
                      maxLength={1000}
                      value={notas}
                      onChange={(evento) => setNotas(evento.target.value)}
                      required={
                        estadoDestino === 'pausada' &&
                        motivoSeleccionado?.requiereNota === true
                      }
                    />
                  </label>

                  {mensaje && !mensaje.exito && mensaje.codigo === 'primera_pieza_pendiente' ? (
                    <section
                      role="alert"
                      className="flex flex-col gap-2 rounded-lg border border-advertencia/60 bg-advertencia-suave p-3"
                      data-testid="aviso-primera-pieza"
                    >
                      <p className="text-sm font-semibold text-advertencia-texto">
                        Falta liberar la primera pieza antes de declarar producción
                      </p>
                      <p className="text-xs text-texto-secundario">
                        Puedes registrarla aquí mismo. No necesitas cerrar la sesión ni abrir otro proceso.
                      </p>
                      {mensajePrimeraPieza ? (
                        <p
                          role={mensajePrimeraPieza.tipo === 'error' ? 'alert' : 'status'}
                          className={cn(
                            'text-xs',
                            mensajePrimeraPieza.tipo === 'error' ? 'text-peligro-texto' : 'text-exito-texto',
                          )}
                        >
                          {mensajePrimeraPieza.texto}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          tamano="sm"
                          onClick={() => {
                            setMensajePrimeraPieza(null);
                            setPrimeraPiezaAbierta(true);
                          }}
                          data-testid="abrir-liberar-primera-pieza"
                        >
                          Liberar primera pieza
                        </Button>
                        {mensajePrimeraPieza?.tipo === 'ok' ? (
                          <Button
                            type="button"
                            tamano="sm"
                            variante="contorno"
                            disabled={procesando}
                            onClick={() => void ejecutarCierre()}
                          >
                            Continuar con el cierre
                          </Button>
                        ) : null}
                      </div>
                    </section>
                  ) : null}

                  <Button
                    type="submit"
                    tamano="lg"
                    disabled={procesando}
                    data-testid="cerrar-sesion-detalle"
                  >
                    {estadoDestino === 'pausada'
                      ? 'Pausar sesión de trabajo'
                      : 'Finalizar sesión de trabajo'}
                  </Button>
                  </form>
            ) : null}

            {proceso.columna !== 'lista' && !proceso.sesionActiva ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className={CLASE_ETIQUETA}>
                  Día de la jornada
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
                  Continuar sesión pausada
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

  const anuncioResumenCierre = resumenCierre ? (
    <p className="sr-only" role="status" data-testid="resumen-cierre-registrado">
      Sesión finalizada: {formatearNumero(resumenCierre.resultado.piezasProducidas, 3)} {proceso.unidadMedida},
      {' '}{horasLegibles(resumenCierre.resultado.horasNetas)} netas y material registrado.
    </p>
  ) : null;

  const dialogoResumenCierre = resumenCierre ? (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) setResumenCierre(null);
      }}
    >
      <DialogContent
        className="max-w-md"
        data-testid="resumen-cierre-sesion"
        aria-label="Resumen de sesión finalizada"
      >
        <DialogHeader>
          <DialogTitle>Sesión finalizada</DialogTitle>
          <DialogDescription>
            {proceso.folioOrden} · {proceso.codigoPieza} · {proceso.procesoNombre}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-superficie-2 p-3">
          <Dato
            etiqueta="Piezas producidas"
            valor={`${formatearNumero(resumenCierre.resultado.piezasProducidas, 3)} ${proceso.unidadMedida}`}
          />
          <Dato
            etiqueta="Tiempo neto"
            valor={horasLegibles(resumenCierre.resultado.horasNetas)}
          />
          <Dato etiqueta="Resultado" valor="Sesión finalizada" />
          <Dato etiqueta="Estado de orden" valor={resumenCierre.resultado.estadoOrden} />
          <Dato etiqueta="Planeación" valor={resumenCierre.resultado.estadoPlaneacion} />
          <Dato
            etiqueta="Material usado"
            valor={`${resumenCierre.material.codigo} · ${formatearNumero(resumenCierre.cantidadUsada, 3)} ${resumenCierre.material.unidadBase}`}
          />
          <Dato
            etiqueta="Merma"
            valor={`${formatearNumero(resumenCierre.cantidadMerma, 3)} ${resumenCierre.material.unidadBase}`}
          />
          {resumenCierre.notas ? <Dato etiqueta="Notas" valor={resumenCierre.notas} /> : null}
        </dl>

        <DialogFooter>
          <Button type="button" onClick={() => setResumenCierre(null)}>
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  const dialogoPrimeraPieza = (
    <Dialog
      open={primeraPiezaAbierta}
      onOpenChange={(abierto) => {
        if (!procesandoPrimeraPieza) setPrimeraPiezaAbierta(abierto);
      }}
    >
      <DialogContent data-testid="dialogo-primera-pieza" aria-label="Liberar primera pieza">
        <DialogHeader>
          <DialogTitle>Liberar primera pieza</DialogTitle>
          <DialogDescription>
            {proceso.folioOrden} · {proceso.codigoPieza}. La inspección se registra en la corrida
            de esta sesión, sin salir del proceso.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(evento) => void liberarPrimeraPieza(evento)}>
          <label className={CLASE_ETIQUETA}>
            Resultado de la inspección
            <Select
              value={resultadoPrimeraPieza}
              onChange={(evento) => setResultadoPrimeraPieza(evento.target.value as 'APROBADA' | 'RECHAZADA')}
              data-testid="resultado-primera-pieza"
            >
              <option value="APROBADA">Aprobada: la pieza cumple</option>
              <option value="RECHAZADA">Rechazada: requiere corrección</option>
            </Select>
          </label>
          <label className={CLASE_ETIQUETA}>
            Observaciones (opcional)
            <Textarea
              maxLength={1000}
              value={observacionesPrimeraPieza}
              onChange={(evento) => setObservacionesPrimeraPieza(evento.target.value)}
              placeholder="Ej. Medidas y acabado conforme al plano."
            />
          </label>
          {mensajePrimeraPieza?.tipo === 'error' ? (
            <p role="alert" className="text-sm text-peligro-texto">{mensajePrimeraPieza.texto}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variante="contorno"
              disabled={procesandoPrimeraPieza}
              onClick={() => setPrimeraPiezaAbierta(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={procesandoPrimeraPieza}>
              {procesandoPrimeraPieza ? 'Registrando…' : 'Registrar y liberar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  if (presentacion === 'integrado') {
    return (
      <section
        data-testid="detalle-proceso-integrado"
        aria-label={`Detalle de ${proceso.folioOrden} ${proceso.codigoPieza}`}
        className="rounded-xl border border-borde bg-superficie p-4"
      >
        {contenido}
        {anuncioResumenCierre}
        {dialogoResumenCierre}
        {dialogoPrimeraPieza}
      </section>
    );
  }

  return (
    <>
      <Dialog open onOpenChange={(abierto) => { if (!abierto) onCerrar(); }}>
        <DialogContent
          className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-[880px] flex-col gap-4 overflow-y-auto"
          data-testid="detalle-proceso"
          aria-label={`Detalle de ${proceso.folioOrden} ${proceso.codigoPieza}`}
        >
          {contenido}
        </DialogContent>
      </Dialog>
      {anuncioResumenCierre}
      {dialogoResumenCierre}
      {dialogoPrimeraPieza}
    </>
  );
}

