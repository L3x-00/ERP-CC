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
  resumirFaltantes,
} from '@/modulos/rfq/utilidades/estados';

import { cambiarEstadoRfqAccion } from '../acciones/cambiar-estado-rfq';
import { validarRfqListoAccion } from '../acciones/validar-rfq-listo';

const ACCIONES_CON_MOTIVO: readonly AccionRfq[] = ['cerrar', 'cancelar'];

/**
 * Acciones de negocio del RFQ según su estado (ADR-SII-07). `marcar_listo`
 * abre el panel de faltantes de `validar_rfq_listo` (consulta imperativa en
 * cada apertura, sin caché) y solo permite confirmar cuando no hay pendientes;
 * cerrar/cancelar exigen motivo.
 */
export function PanelAccionesRfq({ rfq, onCambio }: { rfq: Rfq; onCambio: () => void }) {
  const clienteConsultas = useQueryClient();
  const [mostrarListo, setMostrarListo] = useState(false);
  const [validacionDatos, setValidacionDatos] = useState<ValidacionRfqListo | null>(null);
  const [validando, setValidando] = useState(false);
  const [accionMotivo, setAccionMotivo] = useState<AccionRfq | null>(null);
  const [motivo, setMotivo] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const faltantes = validacionDatos ? resumirFaltantes(validacionDatos) : [];
  const listo = validacionDatos?.listo ?? false;

  const acciones = ACCIONES_POR_ESTADO[rfq.estadoRfq];

  /** Valida fresco contra el servidor cada vez que se abre el panel de LISTO. */
  async function abrirValidacionListo(): Promise<void> {
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
    });
    setEnviando(false);

    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }

    setMostrarListo(false);
    setAccionMotivo(null);
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
              else if (ACCIONES_CON_MOTIVO.includes(accion)) setAccionMotivo(accion);
              else void ejecutar(accion);
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
              El servidor revalida estos requisitos al confirmar; si algo falta, la acción se rechaza.
            </DialogDescription>
          </DialogHeader>

          {validando && <p className="text-sm text-texto-secundario">Validando…</p>}

          {!validando && validacionDatos && (
            <div className="flex flex-col gap-3" data-testid="validacion-listo">
              {listo ? (
                <p className="text-sm font-medium text-exito-texto">
                  El RFQ cumple todos los requisitos.
                </p>
              ) : (
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
              )}

              <div className="flex justify-end gap-2">
                <Button variante="contorno" tamano="sm" onClick={() => setMostrarListo(false)}>
                  Cancelar
                </Button>
                <Button
                  tamano="sm"
                  disabled={!listo || enviando}
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
              El motivo es obligatorio (mínimo 3 caracteres) y queda en la bitácora del RFQ.
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
    </div>
  );
}
