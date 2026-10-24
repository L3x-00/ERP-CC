'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Textarea } from '@/compartido/componentes/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import type { AccionRfq, Rfq, ValidacionRfqListo } from '@/modulos/rfq/tipos/indice';
import {
  ACCIONES_POR_ESTADO,
  ETIQUETAS_ACCION_RFQ,
  etiquetaSeccion,
  resumirFaltantes,
} from '@/modulos/rfq/utilidades/estados';
import {
  faltantesSeguimientoTransicion,
  fechaHoyLocal,
  puedeConfirmarMarcarListo,
  seguimientoTransicionInicial,
  tieneProximaAccionVigente,
} from '@/modulos/rfq/utilidades/proxima-accion';
import { esAccionTerminalRfq } from '@/modulos/rfq/validaciones/esquemas-rfq';

import { cambiarEstadoRfqAccion } from '../acciones/cambiar-estado-rfq';
import type { CatalogosRfq } from '../acciones/obtener-catalogos';
import { validarRfqListoAccion } from '../acciones/validar-rfq-listo';
import { SeguimientoTransicionRfq } from './seguimiento-transicion-rfq';

/**
 * Acciones de negocio del RFQ según su estado (ADR-SII-07). `marcar_listo`
 * abre el panel de faltantes de `validar_rfq_listo` (consulta imperativa en
 * cada apertura, sin caché). Si el único pendiente es el seguimiento, el mismo
 * modal lo captura y la transición lo guarda antes de revalidar; solo permite
 * confirmar cuando no faltan otras secciones y el formulario local está completo.
 * C2.2/DC-06 + obs. cliente 2026-10-21: toda transición no terminal conserva la
 * acción de seguimiento vigente o la sustituye pidiendo antes su resultado;
 * cerrar/cancelar exigen motivo y no acción futura.
 */
export function PanelAccionesRfq({
  rfq,
  catalogos,
  onCambio,
}: {
  rfq: Rfq;
  catalogos: CatalogosRfq | null;
  onCambio: () => void;
}) {
  const clienteConsultas = useQueryClient();
  const [mostrarListo, setMostrarListo] = useState(false);
  const [validacionDatos, setValidacionDatos] = useState<ValidacionRfqListo | null>(null);
  const [validando, setValidando] = useState(false);
  const [accionMotivo, setAccionMotivo] = useState<AccionRfq | null>(null);
  const [accionSeguimiento, setAccionSeguimiento] = useState<AccionRfq | null>(null);
  const [motivo, setMotivo] = useState('');
  const hoy = fechaHoyLocal();
  const [seguimiento, setSeguimiento] = useState(() => seguimientoTransicionInicial(rfq, hoy));
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const acciones = ACCIONES_POR_ESTADO[rfq.estadoRfq];
  const faltantesSeguimiento = faltantesSeguimientoTransicion(
    seguimiento,
    tieneProximaAccionVigente(rfq),
    catalogos?.proximasAcciones ?? [],
    hoy,
  );
  const seguimientoCompleto = catalogos !== null && faltantesSeguimiento.length === 0;
  const puedeMarcarListo = puedeConfirmarMarcarListo(
    validacionDatos,
    seguimiento,
    seguimientoCompleto,
  );

  // El seguimiento se captura en este mismo modal. Mientras el formulario local
  // no esté completo se conserva el checklist del servidor; al completarlo se
  // oculta el seguimiento para no mostrarlo como pendiente y dejar solo el
  // mensaje de que ya se puede confirmar. El servidor revalida al confirmar.
  const faltantes = validacionDatos
    ? resumirFaltantes(validacionDatos).filter(
        (faltante) =>
          !puedeMarcarListo
          || !faltante.startsWith(`${etiquetaSeccion('seguimiento')}: `),
      )
    : [];

  /** Valida fresco contra el servidor cada vez que se abre el panel de LISTO. */
  async function abrirValidacionListo(): Promise<void> {
    setSeguimiento(seguimientoTransicionInicial(rfq, hoy));
    setMostrarListo(true);
    setValidando(true);
    setValidacionDatos(null);
    const respuesta = await validarRfqListoAccion({ rfqId: rfq.id });
    setValidando(false);
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    setValidacionDatos(respuesta.datos ?? null);
  }

  async function ejecutar(accion: AccionRfq, motivoAccion?: string): Promise<void> {
    setEnviando(true);
    setMensaje(null);
    const respuesta = await cambiarEstadoRfqAccion({
      rfqId: rfq.id,
      accion,
      actualizadoEn: rfq.actualizadoEn,
      ...(motivoAccion ? { motivo: motivoAccion } : {}),
      ...(esAccionTerminalRfq(accion)
        ? {}
        : seguimiento.modo === 'mantener'
          ? { mantenerProximaAccion: true as const }
          : {
              proximaAccion: {
                codigo: seguimiento.proxima.codigo,
                ...(seguimiento.proxima.texto.trim()
                  ? { texto: seguimiento.proxima.texto.trim() }
                  : {}),
                fecha: seguimiento.proxima.fecha,
                responsableId: seguimiento.proxima.responsableId,
              },
              ...(seguimiento.resultado !== ''
                ? { resultadoProximaAccion: seguimiento.resultado }
                : {}),
            }),
    });
    setEnviando(false);

    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }

    setMostrarListo(false);
    setAccionMotivo(null);
    setAccionSeguimiento(null);
    setMotivo('');
    void clienteConsultas.invalidateQueries({ queryKey: ['pipeline'] });
    onCambio();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie p-3" data-testid="acciones-rfq">
      <div className="flex flex-wrap items-center gap-2">
        {acciones.length === 0 && (
          <span className="text-sm text-texto-secundario">
            El RFQ está en un estado terminal; no admite acciones.
          </span>
        )}
        {acciones.map((accion) => (
          <Button
            key={accion}
            variante={
              accion === 'marcar_listo'
                ? 'primario'
                : accion === 'cerrar' || accion === 'cancelar'
                  ? 'destructivo'
                  : 'contorno'
            }
            tamano="sm"
            disabled={enviando}
            onClick={() => {
              if (accion === 'marcar_listo') void abrirValidacionListo();
              else if (esAccionTerminalRfq(accion)) setAccionMotivo(accion);
              else {
                setSeguimiento(seguimientoTransicionInicial(rfq, hoy));
                setAccionSeguimiento(accion);
              }
            }}
          >
            {ETIQUETAS_ACCION_RFQ[accion]}
          </Button>
        ))}
      </div>

      {mensaje !== null && (
        <p role="alert" className="text-sm text-peligro-texto">
          {mensaje}
        </p>
      )}

      <Dialog open={mostrarListo} onOpenChange={setMostrarListo}>
        <DialogContent aria-label="Validación para marcar listo">
          <DialogHeader>
            <DialogTitle>Marcar listo para propuesta</DialogTitle>
            <DialogDescription>
              Revisamos que el RFQ tenga todo lo necesario antes de pasarlo a propuesta.
            </DialogDescription>
          </DialogHeader>

          {validando && <p className="text-sm text-texto-secundario">Validando…</p>}

          {!validando && validacionDatos && (
            <div className="flex flex-col gap-3" data-testid="validacion-listo">
              {puedeMarcarListo ? (
                <p className="text-sm font-medium text-exito-texto">
                  El RFQ cumple todos los requisitos.
                </p>
              ) : faltantes.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-peligro-texto">
                    Faltan requisitos para marcar listo:
                  </p>
                  <ul className="list-inside list-disc text-sm text-texto-secundario">
                    {faltantes.map((faltante) => (
                      <li key={faltante}>{faltante}</li>
                    ))}
                  </ul>
                </div>
              ) : catalogos ? (
                <p className="text-sm text-texto-secundario">
                  Completa la próxima acción para marcar listo.
                </p>
              ) : null}

              {catalogos && (
                <SeguimientoTransicionRfq
                  idBase="rfq-listo"
                  rfq={rfq}
                  catalogos={catalogos}
                  hoy={hoy}
                  valor={seguimiento}
                  onCambio={setSeguimiento}
                />
              )}
              {catalogos && faltantesSeguimiento.length > 0 && (
                <p className="text-xs text-texto-secundario">Falta: {faltantesSeguimiento.join(', ')}.</p>
              )}

              <div className="flex justify-end gap-2">
                <Button variante="contorno" tamano="sm" onClick={() => setMostrarListo(false)}>
                  Cancelar
                </Button>
                <Button
                  tamano="sm"
                  disabled={!puedeMarcarListo || enviando}
                  onClick={() => void ejecutar('marcar_listo')}
                >
                  Confirmar y marcar listo
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={accionMotivo !== null} onOpenChange={(valor) => !valor && setAccionMotivo(null)}>
        <DialogContent aria-label={accionMotivo ? ETIQUETAS_ACCION_RFQ[accionMotivo] : 'Acción'}>
          <DialogHeader>
            <DialogTitle>{accionMotivo ? ETIQUETAS_ACCION_RFQ[accionMotivo] : ''}</DialogTitle>
            <DialogDescription>
              Escribe el motivo (mínimo 3 letras). Queda guardado en la actividad del RFQ.
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1 text-sm font-medium" htmlFor="rfq-motivo">
            Motivo
            <Textarea
              id="rfq-motivo"
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              rows={3}
              maxLength={300}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variante="contorno" tamano="sm" onClick={() => setAccionMotivo(null)}>
              Volver
            </Button>
            <Button
              variante="destructivo"
              tamano="sm"
              disabled={motivo.trim().length < 3 || enviando}
              onClick={() => accionMotivo && void ejecutar(accionMotivo, motivo.trim())}
            >
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={accionSeguimiento !== null} onOpenChange={(valor) => !valor && setAccionSeguimiento(null)}>
        <DialogContent aria-label={accionSeguimiento ? ETIQUETAS_ACCION_RFQ[accionSeguimiento] : 'Acción'}>
          <DialogHeader>
            <DialogTitle>{accionSeguimiento ? ETIQUETAS_ACCION_RFQ[accionSeguimiento] : ''}</DialogTitle>
            <DialogDescription>
              Confirma qué pasa con el seguimiento de este RFQ al cambiar su estado.
            </DialogDescription>
          </DialogHeader>
          {catalogos ? (
            <SeguimientoTransicionRfq
              idBase="rfq-transicion"
              rfq={rfq}
              catalogos={catalogos}
              hoy={hoy}
              valor={seguimiento}
              onCambio={setSeguimiento}
            />
          ) : (
            <p className="text-sm text-texto-secundario">Cargando catálogos…</p>
          )}
          {catalogos && faltantesSeguimiento.length > 0 && (
            <p className="text-xs text-texto-secundario">Falta: {faltantesSeguimiento.join(', ')}.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variante="contorno" tamano="sm" onClick={() => setAccionSeguimiento(null)}>
              Volver
            </Button>
            <Button
              tamano="sm"
              disabled={!seguimientoCompleto || enviando}
              onClick={() => accionSeguimiento && void ejecutar(accionSeguimiento)}
            >
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
