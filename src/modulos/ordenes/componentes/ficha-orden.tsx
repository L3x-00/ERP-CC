'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { ajustarOrdenPostAceptacionAccion } from '@/modulos/ordenes/acciones/ajustar-orden-post-aceptacion';
import { cambiarEstadoOrdenAccion } from '@/modulos/ordenes/acciones/cambiar-estado-orden';
import { cerrarOrdenAdministrativaAccion } from '@/modulos/ordenes/acciones/cerrar-orden-administrativa';
import { liberarOrdenAccion } from '@/modulos/ordenes/acciones/liberar-orden';
import type { FichaOrden as DatosFicha, TotalesSnapshot } from '@/modulos/ordenes/tipos/ficha-orden';
import type { EstadoOrden } from '@/modulos/ordenes/tipos/ordenes';
import { cn } from '@/compartido/utilidades/cn';

export interface PermisosFichaOrden {
  puedeLiberar: boolean;
  puedeCerrar: boolean;
  puedeAjustar: boolean;
  puedeAdministrar: boolean;
}

type PestanaFicha = 'resumen' | 'partidas' | 'ruta' | 'archivos' | 'entregas' | 'actividad' | 'documento';

const PESTANAS: readonly [PestanaFicha, string][] = [
  ['resumen', 'Resumen'],
  ['partidas', 'Ítems / Partidas'],
  ['ruta', 'Ruta / Operaciones'],
  ['archivos', 'Archivos vivos'],
  ['entregas', 'Entregas'],
  ['actividad', 'Actividad'],
  ['documento', 'Documento'],
];

function ahoraLocal(): string {
  const ahora = new Date();
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function aFechaHoraLocal(fecha: string): string {
  const valor = new Date(fecha);
  const local = new Date(valor.getTime() - valor.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatearFechaCalendario(fecha: string): string {
  const [anioTexto, mesTexto, diaTexto] = fecha.slice(0, 10).split('-');
  const anio = Number(anioTexto);
  const mes = Number(mesTexto);
  const dia = Number(diaTexto);
  const valor = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    !Number.isFinite(anio)
    || !Number.isFinite(mes)
    || !Number.isFinite(dia)
    || valor.getUTCFullYear() !== anio
    || valor.getUTCMonth() !== mes - 1
    || valor.getUTCDate() !== dia
  ) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(valor);
}

function claveValor(valor: unknown): string {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

const ETIQUETAS_CAMBIO: Readonly<Record<string, string>> = {
  fecha_operativa: 'Fecha operativa',
  fecha_programada: 'Fecha programada',
  prioridad: 'Prioridad',
  notas: 'Notas',
  recurso_id: 'Recurso',
  turno: 'Turno',
  horas_estimadas: 'Horas estimadas',
  orden_prioridad: 'Prioridad de secuencia',
};

function ResumenCambio({ detalle }: { detalle: Record<string, unknown> }) {
  const anterior = typeof detalle.anterior === 'object' && detalle.anterior !== null
    ? detalle.anterior as Record<string, unknown>
    : null;
  const nuevo = typeof detalle.nuevo === 'object' && detalle.nuevo !== null
    ? detalle.nuevo as Record<string, unknown>
    : null;
  if (!anterior && !nuevo) return null;

  const claves = [...new Set([...Object.keys(anterior ?? {}), ...Object.keys(nuevo ?? {})])]
    .filter((clave) => clave !== 'programacion_id' && clave !== 'partida_id')
    .filter((clave) => claveValor(anterior?.[clave]) !== claveValor(nuevo?.[clave]));
  if (claves.length === 0) return null;

  return (
    <dl className="mt-2 grid gap-1 text-xs text-texto-secundario sm:grid-cols-2">
      {claves.map((clave) => (
        <div key={clave} className="flex flex-wrap gap-1">
          <dt className="font-medium text-texto-primario">{ETIQUETAS_CAMBIO[clave] ?? clave}:</dt>
          <dd>{anterior ? `${claveValor(anterior[clave])} → ` : ''}{claveValor(nuevo?.[clave])}</dd>
        </div>
      ))}
    </dl>
  );
}

function Tarjeta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-borde bg-superficie-2 p-3">
      <p className="text-xs text-texto-secundario">{titulo}</p>
      <div className="mt-1 text-sm font-semibold text-texto-primario">{children}</div>
    </div>
  );
}

function Totales({ totales }: { totales: TotalesSnapshot | null }) {
  if (!totales || totales.total === null) {
    return <p className="text-sm text-texto-secundario">Sin totales comerciales en el snapshot.</p>;
  }
  const moneda = totales.moneda ?? 'MXN';
  const formato = (valor: number | null) =>
    valor === null ? '—' : `${moneda} ${valor.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  return (
    <dl className="grid gap-2 sm:grid-cols-4">
      <Tarjeta titulo="Subtotal">{formato(totales.subtotal)}</Tarjeta>
      <Tarjeta titulo="Descuento">{formato(totales.descuento)}</Tarjeta>
      <Tarjeta titulo="IVA">{formato(totales.iva)}</Tarjeta>
      <Tarjeta titulo="Total">{formato(totales.total)}</Tarjeta>
    </dl>
  );
}

/** Ficha de orden SII-B5: snapshot congelado + acciones de negocio por estado. */
export function FichaOrden({
  ficha,
  permisos,
}: {
  ficha: DatosFicha;
  permisos: PermisosFichaOrden;
}) {
  const router = useRouter();
  const [pestana, setPestana] = useState<PestanaFicha>('resumen');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [ajustando, setAjustando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ajuste, setAjuste] = useState({
    prioridad: ficha.orden.prioridad,
    fecha: aFechaHoraLocal(ficha.orden.fechaOperativa),
    notas: ficha.orden.notas ?? '',
  });

  const folio = ficha.orden.folioSii ?? ficha.orden.folio;
  const estado = ficha.orden.estadoSii;
  const esTerminal = estado === 'CERRADA' || estado === 'CANCELADA';
  const preProduccion = estado === 'CONFIRMADA' || estado === 'PLANIFICADA' || estado === 'LISTA';

  const ruta = useMemo(
    () => (ficha.snapshot?.items ?? []).filter((item) => !item.es_descuento),
    [ficha.snapshot],
  );

  async function ejecutar(accion: () => Promise<{ exito: boolean; error?: string }>, ok: string): Promise<boolean> {
    setOcupado(true);
    setError(null);
    setMensaje(null);
    try {
      const respuesta = await accion();
      if (!respuesta.exito) {
        setError(respuesta.error ?? 'No se pudo completar la acción');
        return false;
      }
      setMensaje(ok);
      router.refresh();
      return true;
    } catch {
      setError('No se pudo completar la acción. Intenta de nuevo.');
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function liberar(): Promise<void> {
    await ejecutar(
      () => liberarOrdenAccion({ ordenId: ficha.orden.id, actualizadoEn: ficha.orden.actualizadoEn }),
      `Orden ${folio} liberada a producción`,
    );
  }

  async function confirmarCancelacion(): Promise<void> {
    const texto = motivo.trim();
    if (texto.length < 3) {
      setError('El motivo de cancelación es obligatorio (mínimo 3 caracteres).');
      return;
    }
    const exito = await ejecutar(
      () => cambiarEstadoOrdenAccion({
        ordenId: ficha.orden.id,
        estadoActual: ficha.orden.estadoLegacy as EstadoOrden,
        estado: 'cancelada',
        motivoCancelacion: texto,
      }),
      `Orden ${folio} cancelada`,
    );
    if (exito) {
      setCancelando(false);
      setMotivo('');
    }
  }

  async function confirmarCierre(): Promise<void> {
    const exito = await ejecutar(
      () => cerrarOrdenAdministrativaAccion({
        ordenId: ficha.orden.id,
        actualizadoEn: ficha.orden.actualizadoEn,
      }),
      `Orden ${folio} cerrada administrativamente`,
    );
    if (exito) setCerrando(false);
  }

  async function guardarAjuste(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (ajuste.fecha === '') {
      setError('Indica la fecha operativa.');
      return;
    }
    const fechaOperativa = new Date(ajuste.fecha);
    if (Number.isNaN(fechaOperativa.getTime())) {
      setError('La fecha operativa no es válida.');
      return;
    }
    const cambios: Record<string, unknown> = {};
    if (ajuste.prioridad !== ficha.orden.prioridad) cambios.prioridad = ajuste.prioridad;
    if (ajuste.fecha !== aFechaHoraLocal(ficha.orden.fechaOperativa)) {
      cambios.fechaOperativa = fechaOperativa.toISOString();
    }
    if (ajuste.notas.trim() !== (ficha.orden.notas ?? '')) {
      cambios.notas = ajuste.notas.trim();
    }
    if (Object.keys(cambios).length === 0) {
      setError('Indica al menos un cambio para ajustar la orden.');
      return;
    }
    const exito = await ejecutar(
      () => ajustarOrdenPostAceptacionAccion({
        ordenId: ficha.orden.id,
        actualizadoEn: ficha.orden.actualizadoEn,
        motivo: motivo.trim(),
        cambios,
      }),
      `Orden ${folio} ajustada con trazabilidad`,
    );
    if (exito) {
      setAjustando(false);
      setMotivo('');
    }
  }

  function abrirAjuste(): void {
    setError(null);
    setMensaje(null);
    setMotivo('');
    setAjuste({
      prioridad: ficha.orden.prioridad,
      fecha: aFechaHoraLocal(ficha.orden.fechaOperativa),
      notas: ficha.orden.notas ?? '',
    });
    setAjustando(true);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5" data-testid="ficha-orden">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-bold text-texto-primario" data-testid="ficha-folio">{folio}</h1>
            <span data-testid="ficha-estado"><BadgeEstado estado={estado} /></span>
            {ficha.orden.esInterna && (
              <span className="rounded-full bg-superficie-2 px-2 py-0.5 text-[10px] font-semibold text-texto-secundario">
                TI
              </span>
            )}
          </div>
          <p className="text-sm text-texto-secundario">
            {ficha.orden.clienteNombre ?? 'Cliente sin nombre'} · Operativa {formatearFecha(ficha.orden.fechaOperativa)} · Prioridad {ficha.orden.prioridad}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variante="contorno" tamano="sm" onClick={() => router.push('/ordenes')}>
            Volver a la cola
          </Button>
          {permisos.puedeLiberar && estado === 'PLANIFICADA' && (
            <Button tamano="sm" disabled={ocupado} onClick={() => void liberar()} data-testid="ficha-liberar">
              {ocupado ? 'Liberando…' : 'Liberar'}
            </Button>
          )}
          {permisos.puedeAjustar && preProduccion && (
            <Button variante="secundario" tamano="sm" disabled={ocupado}
              onClick={abrirAjuste}
              data-testid="ficha-ajustar">
              Ajustar
            </Button>
          )}
          {permisos.puedeAdministrar && !esTerminal && estado !== 'PRODUCCION_COMPLETADA' && (
            <Button variante="destructivo" tamano="sm" disabled={ocupado}
              onClick={() => { setError(null); setMensaje(null); setMotivo(''); setCancelando(true); }}
              data-testid="ficha-cancelar">
              Cancelar
            </Button>
          )}
          {permisos.puedeCerrar && estado === 'PRODUCCION_COMPLETADA' && (
            <Button tamano="sm" disabled={ocupado}
              onClick={() => { setError(null); setMensaje(null); setCerrando(true); }}
              data-testid="ficha-cerrar">
              Cerrar administrativa
            </Button>
          )}
        </div>
      </header>

      {error && !cancelando && !cerrando && !ajustando ? (
        <p role="alert" className="text-sm text-peligro-texto" data-testid="ficha-error">{error}</p>
      ) : null}
      {mensaje ? (
        <p role="status" className="text-sm text-exito-texto" data-testid="ficha-mensaje">{mensaje}</p>
      ) : null}

      <div role="tablist" aria-label="Secciones de la orden" className="flex flex-wrap gap-1 border-b border-borde print:hidden">
        {PESTANAS.map(([id, etiqueta]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pestana === id}
            data-testid={`ficha-pestana-${id}`}
            onClick={() => setPestana(id)}
            className={cn(
              '-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-semibold transition-colors',
              pestana === id
                ? 'border-acento bg-acento-suave text-acento'
                : 'border-transparent text-texto-secundario hover:bg-superficie-2 hover:text-texto-primario',
            )}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'resumen' ? (
        <section className="grid gap-4" data-testid="ficha-panel-resumen">
          <dl className="grid gap-3 sm:grid-cols-4">
            <Tarjeta titulo="Estado SII">{estado}</Tarjeta>
            <Tarjeta titulo="Folio legacy">{ficha.orden.folio}</Tarjeta>
            <Tarjeta titulo="Creada">{formatearFecha(ficha.orden.creadoEn)}</Tarjeta>
            <Tarjeta titulo="Partidas">{ficha.partidas.length}</Tarjeta>
            <Tarjeta titulo="Compromiso comercial">
              {ficha.orden.fechaCompromisoComercial
                ? formatearFechaCalendario(ficha.orden.fechaCompromisoComercial)
                : 'No aplica / orden legada'}
            </Tarjeta>
            <Tarjeta titulo="Fecha operativa">{formatearFecha(ficha.orden.fechaOperativa)}</Tarjeta>
            {ficha.orden.cerradaAdminEn && (
              <Tarjeta titulo="Cierre administrativo">
                {formatearFecha(ficha.orden.cerradaAdminEn)}
                {ficha.orden.cerradaAdminPorNombre ? ` · ${ficha.orden.cerradaAdminPorNombre}` : ''}
              </Tarjeta>
            )}
          </dl>
          <Totales totales={ficha.totales} />
          <div className="rounded-md border border-borde p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">Origen (snapshot)</p>
            {ficha.snapshot ? (
              <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {Object.entries(ficha.snapshot.origen).map(([clave, valor]) => (
                  <div key={clave} className="flex gap-2">
                    <dt className="text-texto-secundario">{clave}:</dt>
                    <dd className="truncate">{claveValor(valor)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-texto-secundario">
                Orden histórica sin snapshot (OP-######): conserva sus datos legacy.
              </p>
            )}
            {ficha.orden.notas ? (
              <p className="mt-3 whitespace-pre-wrap text-sm text-texto-secundario">Observaciones: {ficha.orden.notas}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {pestana === 'partidas' ? (
        <section className="overflow-x-auto rounded-lg border border-borde" data-testid="ficha-panel-partidas">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-superficie-2 text-left text-texto-secundario">
                <th scope="col" className="px-3 py-2 font-semibold">Ítem</th>
                <th scope="col" className="px-3 py-2 font-semibold">Descripción</th>
                <th scope="col" className="px-3 py-2 font-semibold">Solicitado</th>
                <th scope="col" className="px-3 py-2 font-semibold">Producido</th>
                <th scope="col" className="px-3 py-2 font-semibold">Scrap</th>
                <th scope="col" className="px-3 py-2 font-semibold">Procesos</th>
              </tr>
            </thead>
            <tbody>
              {ficha.partidas.map((partida) => (
                <tr key={partida.id} className="border-t border-borde" data-testid={`ficha-partida-${partida.codigoItem ?? partida.codigoPieza}`}>
                  <td className="px-3 py-2 font-mono text-xs">
                    {partida.codigoItem ?? partida.codigoPieza}
                    {partida.codigoItem && partida.codigoItem !== partida.codigoPieza ? (
                      <span className="block text-texto-tenue">{partida.codigoPieza}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{partida.descripcion ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{partida.cantidadSolicitada} {partida.unidadMedida}</td>
                  <td className="px-3 py-2 tabular-nums">{partida.cantidadProducida}</td>
                  <td className="px-3 py-2 tabular-nums">{partida.cantidadScrap}</td>
                  <td className="px-3 py-2 text-xs text-texto-secundario">
                    {partida.procesos.length > 0 ? partida.procesos.join(' · ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {pestana === 'ruta' ? (
        <section className="grid gap-3" data-testid="ficha-panel-ruta">
          {ruta.length === 0 ? (
            <p className="text-sm text-texto-secundario">Sin ruteo en el snapshot.</p>
          ) : ruta.map((item) => (
            <article key={item.codigo ?? item.codigo_item} className="rounded-md border border-borde p-3">
              <h3 className="font-mono text-sm font-semibold">{item.codigo ?? item.codigo_item}</h3>
              <ol className="mt-2 grid gap-1 text-sm">
                {(item.ruteo ?? []).map((paso, indice) => (
                  <li key={indice} className="flex flex-wrap gap-2 text-texto-secundario">
                    <span className="font-semibold text-texto-primario">{String((paso as Record<string, unknown>).secuencia ?? indice + 1)}.</span>
                    <span>{String((paso as Record<string, unknown>).proceso_nombre ?? 'Proceso')}</span>
                    <span>setup {claveValor((paso as Record<string, unknown>).setup_horas)} h · run {claveValor((paso as Record<string, unknown>).run_horas)} h</span>
                  </li>
                ))}
                {(item.operaciones ?? []).length > 0 && (item.ruteo ?? []).length === 0 ? (
                  (item.operaciones ?? []).map((operacion, indice) => (
                    <li key={indice} className="text-texto-secundario">
                      {String((operacion as Record<string, unknown>).nombre ?? (operacion as Record<string, unknown>).codigo ?? 'Operación')}
                    </li>
                  ))
                ) : null}
              </ol>
            </article>
          ))}
        </section>
      ) : null}

      {pestana === 'archivos' ? (
        <section className="grid gap-2" data-testid="ficha-panel-archivos">
          {ficha.archivos.length === 0 ? (
            <p className="text-sm text-texto-secundario">Sin archivos vivos referenciados por el snapshot.</p>
          ) : ficha.archivos.map((archivo) => (
            <div key={`${archivo.archivoId}-${archivo.itemCodigo ?? 'rev'}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-borde px-3 py-2 text-sm">
              <span className="font-medium text-texto-primario">
                {archivo.nombreErp ?? archivo.nombreOriginal ?? archivo.archivoId}
              </span>
              <span className="text-xs text-texto-secundario">
                {archivo.clase ?? 'general'} · {archivo.origen === 'item' ? `ítem ${archivo.itemCodigo}` : 'revisión'}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      {pestana === 'entregas' ? (
        <section className="grid gap-3" data-testid="ficha-panel-entregas">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-texto-secundario">
              Entregas parciales o totales con folio NE; evidencia y firma se capturan en el detalle.
            </p>
            <Link
              href={`/entregas?orden=${ficha.orden.id}`}
              className="rounded-md border border-borde px-3 py-1.5 text-sm font-semibold text-acento hover:bg-superficie-2"
              data-testid="ficha-preparar-entrega"
            >
              Preparar entrega
            </Link>
          </div>
          {ficha.entregas.length === 0 ? (
            <p className="text-sm text-texto-secundario">Sin notas de entrega registradas.</p>
          ) : ficha.entregas.map((entrega) => (
            <article key={entrega.id} className="rounded-md border border-borde p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <Link
                  href={`/entregas/${entrega.id}`}
                  className="font-mono font-semibold text-acento underline"
                  data-testid={`ficha-entrega-${entrega.folioSii ?? entrega.folio}`}
                >
                  {entrega.folioSii ?? entrega.folio}
                </Link>
                <span className="text-texto-secundario">
                  {entrega.esParcial ? 'Parcial' : 'Total'} · {entrega.recibidoPor} · {formatearFecha(entrega.creadoEn)}
                </span>
              </div>
              <p className="mt-1 text-xs text-texto-secundario">
                {entrega.partidas.reduce((suma, renglon) => suma + renglon.cantidadEntregada, 0)} piezas entregadas
              </p>
            </article>
          ))}
        </section>
      ) : null}

      {pestana === 'actividad' ? (
        <section className="grid gap-2" data-testid="ficha-panel-actividad">
          {ficha.eventos.length === 0 ? (
            <p className="text-sm text-texto-secundario">Sin eventos de orden registrados.</p>
          ) : (
            <ol className="grid gap-2">
              {ficha.eventos.map((evento) => (
                <li key={evento.id} className="rounded-md border border-borde px-3 py-2 text-sm">
                  <p className="font-medium text-texto-primario">{evento.tipo}</p>
                  <p className="text-xs text-texto-secundario">
                    {formatearFecha(evento.creadoEn)}{evento.actorNombre ? ` · ${evento.actorNombre}` : ''}
                    {evento.motivo ? ` · ${evento.motivo}` : ''}
                  </p>
                  <ResumenCambio detalle={evento.detalle} />
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      {pestana === 'documento' ? (
        <section className="grid gap-4" data-testid="ficha-panel-documento">
          <div className="flex justify-end print:hidden">
            <Button variante="contorno" tamano="sm" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
          <article className="rounded-lg border border-borde p-6">
            <header className="border-b border-borde pb-3">
              <h2 className="text-lg font-bold">Orden de servicio {folio}</h2>
              <p className="text-sm text-texto-secundario">
                {ficha.orden.clienteNombre ?? ''} · Compromiso comercial{' '}
                {ficha.orden.fechaCompromisoComercial
                  ? formatearFechaCalendario(ficha.orden.fechaCompromisoComercial)
                  : 'no disponible'}
              </p>
            </header>
            {ficha.snapshot ? (
              <div className="mt-4 grid gap-3 text-sm">
                {(ficha.snapshot.items ?? []).filter((item) => !item.es_descuento).map((item) => (
                  <div key={item.codigo ?? item.codigo_item} className="rounded-md bg-superficie-2 p-3">
                    <p className="font-semibold">
                      {item.codigo ?? item.codigo_item} · {item.descripcion ?? ''}
                    </p>
                    <p className="text-xs text-texto-secundario">
                      {claveValor(item.cantidad)} · {item.material ?? 'sin material'} · {item.espesor ?? 'sin espesor'}
                    </p>
                    {(item.ruteo ?? []).length > 0 ? (
                      <p className="text-xs text-texto-secundario">
                        {(item.ruteo ?? []).map((paso) => String((paso as Record<string, unknown>).proceso_nombre ?? '')).join(' → ')}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-texto-secundario">
                Documento histórico basado en partidas legacy:
                {' '}{ficha.partidas.map((partida) => partida.descripcion ?? partida.codigoPieza).join(' · ')}
              </p>
            )}
            <div className="mt-4">
              <Totales totales={ficha.totales} />
            </div>
          </article>
        </section>
      ) : null}

      <Dialog open={cancelando} onOpenChange={(abierto) => (!abierto ? setCancelando(false) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar orden {folio}</DialogTitle>
            <DialogDescription>La cancelación es definitiva y queda auditada con el motivo.</DialogDescription>
          </DialogHeader>
          {error ? <p role="alert" className="text-sm text-peligro-texto">{error}</p> : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor="ficha-motivo-cancelacion">Motivo (mínimo 3 caracteres)</Label>
            <Textarea id="ficha-motivo-cancelacion" value={motivo} onChange={(evento) => setMotivo(evento.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variante="contorno" onClick={() => setCancelando(false)}>Volver</Button>
            <Button type="button" data-testid="ficha-confirmar-cancelacion"
              disabled={ocupado || motivo.trim().length < 3}
              onClick={() => void confirmarCancelacion()}>
              {ocupado ? 'Cancelando…' : 'Confirmar cancelación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cerrando} onOpenChange={(abierto) => (!abierto ? setCerrando(false) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cierre administrativo de {folio}</DialogTitle>
            <DialogDescription>
              Requiere el 100 % de las cantidades entregadas. No cobra la cuenta por cobrar: el cierre
              administrativo es independiente del cobro.
            </DialogDescription>
          </DialogHeader>
          {error ? <p role="alert" className="text-sm text-peligro-texto">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variante="contorno" onClick={() => setCerrando(false)}>Volver</Button>
            <Button type="button" data-testid="ficha-confirmar-cierre" disabled={ocupado}
              onClick={() => void confirmarCierre()}>
              {ocupado ? 'Cerrando…' : 'Confirmar cierre'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ajustando} onOpenChange={(abierto) => (!abierto ? setAjustando(false) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar orden {folio}</DialogTitle>
            <DialogDescription>
              Solo antes de producción. El ajuste exige motivo y queda trazado como evento de cambio.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={(evento) => void guardarAjuste(evento)}>
            <label className="grid gap-1 text-sm font-medium">
              Prioridad
              <Select value={ajuste.prioridad}
                onChange={(evento) => setAjuste((actual) => ({ ...actual, prioridad: evento.target.value }))}>
                <option value="baja">Baja</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </Select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Fecha operativa
              <Input type="datetime-local" value={ajuste.fecha} min={ahoraLocal()}
                onChange={(evento) => setAjuste((actual) => ({ ...actual, fecha: evento.target.value }))} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Notas
              <Textarea value={ajuste.notas}
                onChange={(evento) => setAjuste((actual) => ({ ...actual, notas: evento.target.value }))} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Motivo del ajuste (mínimo 3 caracteres)
              <Input value={motivo} onChange={(evento) => setMotivo(evento.target.value)} required minLength={3} maxLength={500} />
            </label>
            {error ? <p role="alert" className="text-sm text-peligro-texto">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variante="contorno" onClick={() => setAjustando(false)}>Volver</Button>
              <Button type="submit" data-testid="ficha-confirmar-ajuste" disabled={ocupado || motivo.trim().length < 3}>
                {ocupado ? 'Guardando…' : 'Guardar ajuste'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
