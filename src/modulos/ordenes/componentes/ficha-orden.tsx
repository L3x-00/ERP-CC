'use client';

import { useMemo, useState } from 'react';
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
import { Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { HiloComentarios } from '@/modulos/comentarios/componentes/indice';
import { SeccionConciliacionOrden } from '@/modulos/gastos/componentes/seccion-conciliacion-orden';
import { AdjuntosOrdenDialog } from '@/modulos/ordenes/componentes/adjuntos-orden-dialog';
import { CrearOrdenBasadaEnAnteriorDialog } from '@/modulos/ordenes/componentes/crear-orden-basada-anterior-dialog';
import { PanelActividadFicha } from '@/modulos/ordenes/componentes/panel-actividad-ficha';
import { PanelArchivosFicha } from '@/modulos/ordenes/componentes/panel-archivos-ficha';
import { PanelDocumentoFicha } from '@/modulos/ordenes/componentes/panel-documento-ficha';
import { PanelEntregasFicha } from '@/modulos/ordenes/componentes/panel-entregas-ficha';
import { PanelOrigenComercialFicha } from '@/modulos/ordenes/componentes/panel-origen-ficha';
import { PanelPartidasFicha } from '@/modulos/ordenes/componentes/panel-partidas-ficha';
import { PanelRutaFicha } from '@/modulos/ordenes/componentes/panel-ruta-ficha';
import { Tarjeta, Totales } from '@/modulos/ordenes/componentes/tarjeta-ficha';
import { formatearFechaCalendario } from '@/modulos/ordenes/utilidades/formato-ficha';
import { calcularSaldoEntrega, etiquetaEntrega } from '@/modulos/ordenes/utilidades/entrega-orden';
import { cambiarEstadoOrdenAccion } from '@/modulos/ordenes/acciones/cambiar-estado-orden';
import { cerrarOrdenAdministrativaAccion } from '@/modulos/ordenes/acciones/cerrar-orden-administrativa';
import { liberarOrdenAccion } from '@/modulos/ordenes/acciones/liberar-orden';
import type { FichaOrden as DatosFicha, PestanaFicha } from '@/modulos/ordenes/tipos/ficha-orden';
import type { EstadoOrden } from '@/modulos/ordenes/tipos/ordenes';
import { PREGUNTAS_PESTANA } from '@/modulos/ordenes/utilidades/preguntas-pestana';
import { cn } from '@/compartido/utilidades/cn';

export interface PermisosFichaOrden {
  puedeLiberar: boolean;
  puedeCerrar: boolean;
  puedeCancelar: boolean;
  puedeVerTotales: boolean;
  /** Adjuntos legacy: mismo permiso (`aprobar_ordenes`) que exigen sus Server Actions. */
  puedeAdjuntar: boolean;
  /** C8.6: mismo permiso de aprobación que exige la RPC para crear una OP técnica nueva. */
  puedeCrearBasadaEnAnterior?: boolean;
  /** Comentarios: quien puede borrar los de otros (admin). */
  puedeEliminarTodos: boolean;
  /** Origen comercial: el folio del RFQ enlaza a /rfq solo con `rfq_vista`. */
  puedeVerRfq: boolean;
  /** Origen comercial: Propuesta y Revisión enlazan a /propuestas solo con `propuesta_vista`. */
  puedeVerPropuesta: boolean;
  /** C10.2/F-07 B: pestaña Costos visible solo con `ver_finanzas`. */
  puedeVerCostos?: boolean;
}

const PESTANAS: readonly [PestanaFicha, string][] = [
  ['resumen', 'Resumen'],
  ['partidas', 'Ítems / Partidas'],
  ['ruta', 'Ruta / Operaciones'],
  ['archivos', 'Archivos vivos'],
  ['entregas', 'Entregas'],
  ['actividad', 'Actividad'],
  ['documento', 'Documento'],
  ['costos', 'Costos'],
  ['comentarios', 'Comentarios'],
];

/** Ficha de orden SII-B5: snapshot congelado + acciones de negocio por estado. */
export function FichaOrden({
  ficha,
  permisos,
  usuarioActualId,
  pestanaInicial,
}: {
  ficha: DatosFicha;
  permisos: PermisosFichaOrden;
  usuarioActualId: string;
  pestanaInicial?: PestanaFicha;
}) {
  const router = useRouter();
  // Documento es visible siempre (R17): sin orden_ver_totales es la hoja de trabajo, sin Totales.
  const pestanasVisibles = PESTANAS.filter(
    ([id]) => id !== 'costos' || permisos.puedeVerCostos === true,
  );
  const [pestana, setPestana] = useState<PestanaFicha>(() => {
    const inicial = PESTANAS.find(([id]) => id === pestanaInicial)?.[0] ?? 'resumen';
    return inicial === 'costos' && permisos.puedeVerCostos !== true ? 'resumen' : inicial;
  });
  const [adjuntando, setAdjuntando] = useState(false);
  const [creandoBasadaEnAnterior, setCreandoBasadaEnAnterior] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [motivo, setMotivo] = useState('');

  const folio = ficha.orden.folioSii ?? ficha.orden.folio;
  const estado = ficha.orden.estadoSii;
  const esTerminal = estado === 'CERRADA' || estado === 'CANCELADA';
  const puedeCrearBasadaEnAnterior = permisos.puedeCrearBasadaEnAnterior === true
    && ficha.orden.idHistorico === null
    && (estado === 'PRODUCCION_COMPLETADA' || estado === 'CERRADA');

  // R12/R13 (C8.4): saldo de entrega espejo del cierre SQL; la RPC manda.
  const entregadaPorPartida = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const entrega of ficha.entregas) {
      for (const renglon of entrega.partidas) {
        mapa.set(renglon.partidaId, (mapa.get(renglon.partidaId) ?? 0) + renglon.cantidadEntregada);
      }
    }
    return mapa;
  }, [ficha.entregas]);
  const saldoEntrega = calcularSaldoEntrega(
    ficha.partidas.map((partida) => ({
      cantidadSolicitada: partida.cantidadSolicitada,
      cantidadProducida: partida.cantidadProducida,
      cantidadEntregada: entregadaPorPartida.get(partida.id) ?? 0,
    })),
  );
  const etiquetaEntregaTexto = etiquetaEntrega({
    estadoSii: estado,
    solicitado: saldoEntrega.solicitado,
    entregado: saldoEntrega.entregado,
  });
  const motivoCierreBloqueado = saldoEntrega.requiereDecisionFaltante
    ? 'Producción cerró con faltante; requiere decisión del PO'
    : `Faltan ${saldoEntrega.faltan} piezas por entregar`;

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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5" data-testid="ficha-orden">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-bold text-texto-primario" data-testid="ficha-folio">{folio}</h1>
            <span data-testid="ficha-estado"><BadgeEstado estado={estado} /></span>
            {etiquetaEntregaTexto ? (
              <span data-testid="ficha-etiqueta-entrega" className="rounded-full bg-superficie-2 px-2 py-0.5 text-xs font-semibold text-texto-secundario">
                {etiquetaEntregaTexto}
              </span>
            ) : null}
            {ficha.orden.esInterna && (
              <span className="rounded-full bg-superficie-2 px-2 py-0.5 text-[10px] font-semibold text-texto-secundario">
                TI
              </span>
            )}
          </div>
          <p className="text-sm text-texto-secundario">
            {ficha.orden.clienteNombre
              ?? (ficha.orden.esInterna ? 'Trabajo interno' : 'Cliente sin nombre')}{' '}
            · Operativa {formatearFecha(ficha.orden.fechaOperativa)} · Prioridad {ficha.orden.prioridad}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variante="contorno" tamano="sm" onClick={() => router.push('/ordenes')}>
            Volver a la cola
          </Button>
          {puedeCrearBasadaEnAnterior ? (
            <Button
              variante="contorno"
              tamano="sm"
              onClick={() => setCreandoBasadaEnAnterior(true)}
              data-testid="ficha-crear-basada-en-anterior"
            >
              Nueva basada en esta
            </Button>
          ) : null}
          {permisos.puedeLiberar && estado === 'PLANIFICADA' && (
            <Button tamano="sm" disabled={ocupado} onClick={() => void liberar()} data-testid="ficha-liberar">
              {ocupado ? 'Liberando…' : 'Liberar'}
            </Button>
          )}
          {permisos.puedeCancelar && !esTerminal && estado !== 'PRODUCCION_COMPLETADA' && (
            <Button variante="destructivo" tamano="sm" disabled={ocupado}
              onClick={() => { setError(null); setMensaje(null); setMotivo(''); setCancelando(true); }}
              data-testid="ficha-cancelar">
              Cancelar
            </Button>
          )}
          {permisos.puedeCerrar && estado === 'PRODUCCION_COMPLETADA' && (
            <Button tamano="sm" disabled={ocupado || !saldoEntrega.cierrePermitido}
              title={saldoEntrega.cierrePermitido ? undefined : motivoCierreBloqueado}
              onClick={() => { setError(null); setMensaje(null); setCerrando(true); }}
              data-testid="ficha-cerrar">
              Cerrar administrativa
            </Button>
          )}
          {ficha.orden.idHistorico !== null && permisos.puedeAdjuntar && (
            <Button variante="contorno" tamano="sm" disabled={ocupado}
              onClick={() => setAdjuntando(true)}
              data-testid="ficha-adjuntos">
              Adjuntos
            </Button>
          )}
        </div>
      </header>

      {error && !cancelando && !cerrando ? (
        <p role="alert" className="text-sm text-peligro-texto" data-testid="ficha-error">{error}</p>
      ) : null}
      {mensaje ? (
        <p role="status" className="text-sm text-exito-texto" data-testid="ficha-mensaje">{mensaje}</p>
      ) : null}

      <div role="tablist" aria-label="Secciones de la orden" className="flex flex-wrap gap-1 border-b border-borde print:hidden">
        {pestanasVisibles.map(([id, etiqueta]) => (
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

      <p className="text-sm text-texto-secundario print:hidden" data-testid="ficha-pregunta-pestana">
        {PREGUNTAS_PESTANA[pestana]}
      </p>

      {pestana === 'resumen' ? (
        <section className="grid gap-4" data-testid="ficha-panel-resumen">
          <dl className="grid gap-3 sm:grid-cols-4">
            <Tarjeta titulo="Estado SII">{estado}</Tarjeta>
            <Tarjeta titulo={ficha.orden.folioSii ? 'Folio' : 'Folio anterior'}>
              {ficha.orden.folioSii ?? ficha.orden.folio}
            </Tarjeta>
            {ficha.orden.ordenOrigenFolio ? (
              <Tarjeta titulo="Basada en">{ficha.orden.ordenOrigenFolio}</Tarjeta>
            ) : null}
            {ficha.orden.idHistorico !== null && (
              <Tarjeta titulo="Referencia migrada">{ficha.orden.idHistorico}</Tarjeta>
            )}
            <Tarjeta titulo="Creada">{formatearFecha(ficha.orden.creadoEn)}</Tarjeta>
            <Tarjeta titulo="Partidas">{ficha.partidas.length}</Tarjeta>
            <Tarjeta titulo="Compromiso comercial">
              {ficha.orden.fechaCompromisoComercial
                ? formatearFechaCalendario(ficha.orden.fechaCompromisoComercial)
                : 'Sin compromiso comercial registrado'}
            </Tarjeta>
            <Tarjeta titulo="Fecha operativa">{formatearFecha(ficha.orden.fechaOperativa)}</Tarjeta>
            {ficha.orden.cerradaAdminEn && (
              <Tarjeta titulo="Cierre administrativo">
                {formatearFecha(ficha.orden.cerradaAdminEn)}
                {ficha.orden.cerradaAdminPorNombre ? ` · ${ficha.orden.cerradaAdminPorNombre}` : ''}
              </Tarjeta>
            )}
          </dl>
          {permisos.puedeVerTotales ? <Totales totales={ficha.totales} /> : null}
          <PanelOrigenComercialFicha
            origen={ficha.origen}
            puedeVerRfq={permisos.puedeVerRfq}
            puedeVerPropuesta={permisos.puedeVerPropuesta}
          />
          {ficha.orden.notas ? (
            <p className="rounded-md border border-borde p-3 whitespace-pre-wrap text-sm text-texto-secundario">
              Observaciones: {ficha.orden.notas}
            </p>
          ) : null}
        </section>
      ) : null}

      {pestana === 'partidas' ? <PanelPartidasFicha partidas={ficha.partidas} /> : null}

      {pestana === 'ruta' ? <PanelRutaFicha ruta={ficha.ruta} /> : null}

      {pestana === 'archivos' ? <PanelArchivosFicha ordenId={ficha.orden.id} archivos={ficha.archivos} /> : null}

      {pestana === 'entregas' ? (
        <PanelEntregasFicha
          ordenId={ficha.orden.id}
          entregas={ficha.entregas}
          puedeEntregar={estado === 'PRODUCCION_COMPLETADA'}
          saldo={saldoEntrega}
        />
      ) : null}

      {pestana === 'actividad' ? <PanelActividadFicha eventos={ficha.eventos} /> : null}

      {pestana === 'documento' ? (
        <PanelDocumentoFicha ficha={ficha} folio={folio} puedeVerTotales={permisos.puedeVerTotales} />
      ) : null}

      {pestana === 'costos' && permisos.puedeVerCostos === true ? (
        <section data-testid="ficha-panel-costos">
          <SeccionConciliacionOrden ordenId={ficha.orden.id} />
        </section>
      ) : null}

      {pestana === 'comentarios' ? (
        <section data-testid="ficha-panel-comentarios">
          <HiloComentarios
            key={ficha.orden.id}
            entidadTipo="orden"
            entidadId={ficha.orden.id}
            usuarioActualId={usuarioActualId}
            puedeEliminarTodos={permisos.puedeEliminarTodos}
            titulo={`Comentarios de ${folio}`}
          />
        </section>
      ) : null}

      {adjuntando ? (
        <AdjuntosOrdenDialog
          ordenId={ficha.orden.id}
          folio={folio}
          onCerrar={() => setAdjuntando(false)}
        />
      ) : null}

      <CrearOrdenBasadaEnAnteriorDialog
        abierto={creandoBasadaEnAnterior}
        ordenOrigenId={ficha.orden.id}
        folioOrigen={folio}
        onCerrar={() => setCreandoBasadaEnAnterior(false)}
      />

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

    </div>
  );
}
