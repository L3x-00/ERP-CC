'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { formatearFecha, formatearMoneda } from '@/compartido/utilidades/formatear';
import { aceptarRevisionAccion } from '@/modulos/propuestas/acciones/aceptar-revision';
import { PanelOrdenPendiente } from '@/modulos/propuestas/componentes/panel-orden-pendiente';
import { cerrarPropuestaAccion } from '@/modulos/propuestas/acciones/cerrar-propuesta';
import { confirmarVentaAccion } from '@/modulos/propuestas/acciones/confirmar-venta';
import { enviarRevisionAccion } from '@/modulos/propuestas/acciones/enviar-revision';
import { firmarArchivoPropuestaAccion } from '@/modulos/propuestas/acciones/firmar-archivo-propuesta';
import { generarPdfRevisionAccion } from '@/modulos/propuestas/acciones/generar-pdf-revision';
import { rechazarPropuestaAccion } from '@/modulos/propuestas/acciones/rechazar-propuesta';
import type { CatalogosPropuesta } from '@/modulos/propuestas/acciones/obtener-catalogos-propuesta';
import { DialogoSeguimientoPropuesta } from './dialogo-seguimiento-propuesta';
import type {
  PermisosPropuesta,
} from '@/modulos/propuestas/tipos/indice';
import { ETIQUETA_ESTADO_PROPIESTA } from '@/modulos/propuestas/utilidades/indice';
import type { FaltantesValidacionPropuesta } from '@/modulos/propuestas/utilidades/validacion-propuesta';
import { claveDetallePropuesta } from './claves-consulta';
import type { DetallePropuestaFicha, RevisionConTotales } from '@/modulos/propuestas/acciones/obtener-propuesta';

type Formulario = 'ninguno' | 'enviar' | 'rechazar' | 'cerrar';

/** Pestañas de la ficha a las que el aviso de «falta para validar» puede llevar. */
export type DestinoFaltante = 'items' | 'ruteo' | 'archivos';

/**
 * SII-B4.11: acciones de negocio de la revisión activa (arriba de la ficha).
 * La UI solo ofrece acciones válidas por estado; el SQL revalida permisos,
 * CAS, flags y congelamiento.
 */
export function PanelAccionesPropuesta({
  detalle,
  revision,
  catalogos,
  permisos,
  soloLectura = false,
  faltantes = null,
  onIrA,
}: {
  detalle: DetallePropuestaFicha;
  revision: RevisionConTotales;
  catalogos: CatalogosPropuesta | null;
  permisos: PermisosPropuesta;
  soloLectura?: boolean;
  /** Lo que impide validar (solo en borrador); bloquea «Validar» y se lista en rojo. */
  faltantes?: FaltantesValidacionPropuesta | null;
  onIrA?: (destino: DestinoFaltante) => void;
}) {
  const queryClient = useQueryClient();
  const [formulario, setFormulario] = useState<Formulario>('ninguno');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [exitoValidacion, setExitoValidacion] = useState<string | null>(null);
  const [validarAbierto, setValidarAbierto] = useState(false);
  const [pdfGenerado, setPdfGenerado] = useState<{ archivoId: string; version: number } | null>(
    null,
  );
  const [procesando, setProcesando] = useState(false);
  const [canal, setCanal] = useState('');
  const [canalDetalle, setCanalDetalle] = useState('');
  const [destino, setDestino] = useState('');
  // C4.1/DC-09: la fecha compromiso comercial se confirma al aceptar.
  const [fechaCompromiso, setFechaCompromiso] = useState('');
  const [motivo, setMotivo] = useState('');

  const estado = revision.estado;
  const esBorrador = estado === 'DRAFT';
  const requiereRevision = revision.requiereRevisionRuteo || revision.requiereRevisionCosteo;
  const pdfVigente = revision.pdfs.find((pdf) => pdf.vigente) ?? null;
  const tieneAccion = detalle.acciones.some((accion) => accion.revisionId === revision.id);
  const esAceptada = detalle.propuesta.acceptedRevisionId === revision.id;
  const mensajesFaltantes = esBorrador ? (faltantes?.mensajes ?? []) : [];
  const incompleta = mensajesFaltantes.length > 0;

  // Obs. cliente 2026-10-12: el canal de envío sale del catálogo configurado
  // (DC-02). Si el catálogo no cargó, se conservan las opciones históricas.
  const canalesActivos = (catalogos?.canales ?? []).filter((opcion) => opcion.activo);
  const canalEfectivo =
    canal ||
    canalesActivos.find((opcion) => opcion.codigo === 'CORREO')?.codigo ||
    canalesActivos[0]?.codigo ||
    'correo';
  const canalSeleccionado = (catalogos?.canales ?? []).find(
    (opcion) => opcion.codigo === canalEfectivo,
  );
  const canalesVisibles = (catalogos?.canales ?? []).filter(
    (opcion) => opcion.activo || opcion.codigo === canalEfectivo,
  );
  const canalEsOtro = canalSeleccionado?.esOtro ?? false;
  const canalEnvio = canalEsOtro ? canalDetalle.trim() : canalEfectivo;

  // Obs. cliente 2026-10-12: tras la aceptación, las demás versiones quedan
  // inhabilitadas y solo se muestran para consulta del historial.
  if (soloLectura) {
    return (
      <section
        className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie-2 p-3"
        data-testid="panel-acciones-solo-lectura"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold text-texto-secundario">
            Revisión {revision.letra}
          </span>
          <BadgeEstado estado={estado} etiqueta={ETIQUETA_ESTADO_PROPIESTA[estado]} />
        </div>
        <p className="text-xs text-texto-secundario">
          Versión histórica: la propuesta ya tiene una revisión aceptada; esta versión se conserva
          solo para consulta.
        </p>
        <p className="text-xs text-texto-secundario">
          Totales de la revisión: {formatearMoneda(revision.totales.subtotal, revision.totales.moneda)} + IVA ={' '}
          <span className="font-medium text-texto-primario">
            {formatearMoneda(revision.totales.total, revision.totales.moneda)}
          </span>
        </p>
      </section>
    );
  }

  async function refrescar(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: claveDetallePropuesta(detalle.propuesta.id) });
    await queryClient.invalidateQueries({ queryKey: ['propuestas'] });
  }

  async function ejecutar(accion: () => Promise<{ exito: boolean; error?: string }>): Promise<void> {
    setProcesando(true);
    setMensaje(null);
    setExito(null);
    try {
      const respuesta = await accion();
      if (!respuesta.exito) {
        setMensaje(respuesta.error ?? 'No se pudo completar la acción');
        return;
      }
      setFormulario('ninguno');
      setMotivo('');
      setDestino('');
      await refrescar();
    } catch {
      setMensaje('No se pudo completar la acción. Revisa la conexión e inténtalo de nuevo.');
    } finally {
      setProcesando(false);
    }
  }

  /**
   * Genera (o regenera) el PDF de la revisión y deja un resultado visible:
   * antes, una regeneración idempotente no cambiaba nada en pantalla y parecía
   * que el botón «no hacía nada» (obs. Product Owner 2026-10-11).
   */
  async function generarPdf(): Promise<void> {
    setProcesando(true);
    setMensaje(null);
    setExito(null);
    setPdfGenerado(null);
    try {
      const respuesta = await generarPdfRevisionAccion({ revisionId: revision.id });
      if (!respuesta.exito) {
        setMensaje(respuesta.error);
        return;
      }
      const datos = respuesta.datos;
      if (datos) {
        setPdfGenerado({ archivoId: datos.archivoId, version: datos.version });
        setExito(
          datos.yaExistia
            ? `El PDF de esta versión ya existía (v${datos.version}), sin cambios de contenido.`
            : `PDF generado (v${datos.version}).`,
        );
      }
      await refrescar();
    } catch {
      setMensaje('No se pudo generar el PDF. Revisa la conexión e inténtalo de nuevo.');
    } finally {
      setProcesando(false);
    }
  }

  /** Abre con URL firmada el PDF recién generado (buckets privados). */
  async function verPdfGenerado(archivoId: string): Promise<void> {
    setMensaje(null);
    try {
      const respuesta = await firmarArchivoPropuestaAccion({
        propuestaId: detalle.propuesta.id,
        archivoId,
      });
      if (!respuesta.exito) {
        setMensaje(respuesta.error);
        return;
      }
      if (!respuesta.datos) {
        setMensaje('No se pudo abrir el PDF');
        return;
      }
      window.open(respuesta.datos.url, '_blank', 'noopener,noreferrer');
    } catch {
      setMensaje('No se pudo abrir el PDF');
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold text-texto-secundario">Revisión {revision.letra}</span>
        <BadgeEstado estado={estado} etiqueta={ETIQUETA_ESTADO_PROPIESTA[estado]} />
        {requiereRevision && (
          <span className="rounded-full bg-advertencia-suave px-2 py-0.5 text-xs font-medium text-advertencia-texto">
            Requiere revisión
          </span>
        )}
        {revision.motivoCreacion && (
          <span className="text-xs text-texto-secundario">Motivo: {revision.motivoCreacion}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {esBorrador && permisos.validar && (
          <Button
            tamano="sm"
            onClick={() => {
              setMensaje(null);
              setExitoValidacion(null);
              setValidarAbierto(true);
            }}
            disabled={procesando || requiereRevision || incompleta}
            title={
              incompleta
                ? 'Completa lo marcado en rojo antes de validar'
                : requiereRevision
                  ? 'Confirma ruteo y costeo antes de validar'
                  : undefined
            }
          >
            Validar
          </Button>
        )}

        {estado === 'READY_TO_SEND' && permisos.generarPdf && (
          <Button
            tamano="sm"
            variante="contorno"
            onClick={() => void generarPdf()}
            disabled={procesando}
          >
            {pdfVigente ? 'Regenerar PDF' : 'Generar PDF'}
          </Button>
        )}

        {estado === 'READY_TO_SEND' && permisos.enviar && (
          <Button
            tamano="sm"
            onClick={() => setFormulario(formulario === 'enviar' ? 'ninguno' : 'enviar')}
            disabled={procesando || !pdfVigente}
            title={!pdfVigente ? 'Genera el PDF antes de enviar' : undefined}
          >
            Enviar
          </Button>
        )}

        {(estado === 'SENT' || estado === 'FOLLOW_UP') && permisos.aceptar && (
          <span className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-texto-secundario">
              Fecha compromiso comercial
              <Input
                type="date"
                value={fechaCompromiso}
                onChange={(evento) => setFechaCompromiso(evento.target.value)}
                aria-label="Fecha compromiso comercial"
              />
            </label>
            <Button
              tamano="sm"
              onClick={() => void ejecutar(() => aceptarRevisionAccion({
                revisionId: revision.id,
                actualizadoEn: revision.actualizadoEn,
                fechaCompromisoComercial: fechaCompromiso,
              }))}
              disabled={procesando || !fechaCompromiso}
              title={!fechaCompromiso ? 'Indica la fecha compromiso comercial' : undefined}
            >
              Aceptar revisión
            </Button>
          </span>
        )}

        {(estado === 'ACCEPTED' || estado === 'SALE_CONFIRMED') && esAceptada && (
          <PanelOrdenPendiente revisionId={revision.id} />
        )}

        {estado === 'ACCEPTED' && esAceptada && permisos.aceptar && (
          <Button
            tamano="sm"
            onClick={() => void ejecutar(() => confirmarVentaAccion({
              revisionId: revision.id,
              actualizadoEn: revision.actualizadoEn,
            }))}
            disabled={procesando}
          >
            Confirmar venta
          </Button>
        )}

        {['DRAFT', 'READY_TO_SEND', 'SENT', 'FOLLOW_UP'].includes(estado) && permisos.cerrar && (
          <>
            <Button
              tamano="sm"
              variante="fantasma"
              onClick={() => setFormulario(formulario === 'rechazar' ? 'ninguno' : 'rechazar')}
              disabled={procesando}
            >
              Rechazar
            </Button>
            <Button
              tamano="sm"
              variante="fantasma"
              onClick={() => setFormulario(formulario === 'cerrar' ? 'ninguno' : 'cerrar')}
              disabled={procesando}
            >
              Cerrar
            </Button>
          </>
        )}
      </div>

      {incompleta && (
        <div
          data-testid="faltantes-validacion"
          className="flex flex-col gap-2 rounded-md border border-peligro/40 bg-peligro-suave px-3 py-2"
        >
          <p className="text-sm font-medium text-peligro-texto">
            Para validar la propuesta falta:
          </p>
          <ul className="list-disc pl-5 text-sm text-peligro-texto">
            {mensajesFaltantes.map((mensajeFaltante) => (
              <li key={mensajeFaltante}>{mensajeFaltante}</li>
            ))}
          </ul>
          {onIrA && (
            <div className="flex flex-wrap gap-2">
              {faltantes?.sinItemsActivos && (
                <Button variante="contorno" tamano="sm" onClick={() => onIrA('items')}>
                  Ir a Ítems
                </Button>
              )}
              {(faltantes?.itemsSinRuteo.length ?? 0) +
                (faltantes?.itemsSinCostear.length ?? 0) +
                (faltantes?.confirmaciones.length ?? 0) >
                0 && (
                <Button variante="contorno" tamano="sm" onClick={() => onIrA('ruteo')}>
                  Ir a Ruteo/Costeo
                </Button>
              )}
              {faltantes?.sinArchivos && (
                <Button variante="contorno" tamano="sm" onClick={() => onIrA('archivos')}>
                  Ir a Archivos
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {estado === 'READY_TO_SEND' && !tieneAccion && (
        <p className="text-xs text-advertencia-texto">
          Registra la próxima acción en Seguimiento antes de enviar (lo exige el servidor).
        </p>
      )}

      {formulario === 'enviar' && (
        <div className="flex flex-col gap-2 rounded-base border border-borde p-2" data-testid="formulario-envio">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Canal</span>
              <Select
                value={canalEfectivo}
                onChange={(evento) => {
                  const codigoCanal = evento.target.value;
                  setCanal(codigoCanal);
                  const siguiente = (catalogos?.canales ?? []).find(
                    (opcion) => opcion.codigo === codigoCanal,
                  );
                  if (!siguiente?.esOtro) setCanalDetalle('');
                }}
                aria-label="Canal de envío"
              >
                {canalesVisibles.length === 0 ? (
                  <>
                    <option value="correo">Correo</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="entrega">Entrega física</option>
                  </>
                ) : (
                  canalesVisibles.map((opcion) => (
                    <option key={opcion.codigo} value={opcion.codigo}>
                      {opcion.nombre}
                      {opcion.activo ? '' : ' (inactivo)'}
                    </option>
                  ))
                )}
              </Select>
            </label>
            {canalEsOtro && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Detalle del canal (Otro)</span>
                <Input
                  value={canalDetalle}
                  onChange={(evento) => setCanalDetalle(evento.target.value)}
                  maxLength={60}
                  aria-label="Detalle del canal Otro de envío"
                  placeholder="Ej. feria industrial"
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Destino</span>
              <Input
                value={destino}
                onChange={(evento) => setDestino(evento.target.value)}
                aria-label="Destino de envío"
                placeholder="correo@cliente.mx"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button
              tamano="sm"
              onClick={() => void ejecutar(() => enviarRevisionAccion({
                revisionId: revision.id,
                canal: canalEnvio,
                destino,
              }))}
              disabled={
                procesando ||
                destino.trim() === '' ||
                (canalEsOtro && canalDetalle.trim().length < 3)
              }
            >
              Confirmar envío
            </Button>
            <Button tamano="sm" variante="fantasma" onClick={() => setFormulario('ninguno')}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {(formulario === 'rechazar' || formulario === 'cerrar') && (
        <div className="flex flex-col gap-2 rounded-base border border-borde p-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Motivo</span>
            <textarea
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              maxLength={300}
              rows={2}
              aria-label="Motivo"
              className="rounded-base border border-borde-fuerte bg-superficie px-2 py-1 text-sm"
            />
          </label>
          <div className="flex items-center gap-2">
            <Button
              tamano="sm"
              variante="destructivo"
              onClick={() => {
                if (formulario === 'rechazar') {
                  return void ejecutar(() => rechazarPropuestaAccion({
                    revisionId: revision.id,
                    motivo,
                    actualizadoEn: revision.actualizadoEn,
                  }));
                }
                return void ejecutar(() => cerrarPropuestaAccion({
                  revisionId: revision.id,
                  motivo,
                  actualizadoEn: revision.actualizadoEn,
                }));
              }}
              disabled={procesando || motivo.trim().length < 3}
            >
              {formulario === 'rechazar' ? 'Confirmar rechazo' : 'Confirmar cierre'}
            </Button>
            <Button tamano="sm" variante="fantasma" onClick={() => setFormulario('ninguno')}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {pdfVigente && (
        <p className="text-xs text-texto-secundario">
          PDF vigente v{pdfVigente.version} · {formatearFecha(pdfVigente.creadoEn)}
        </p>
      )}

      {exito !== null && (
        // aria-live sin role=status: el mensaje se anuncia sin colisionar con
        // los status de otros paneles que las pruebas ya monitorean.
        <p
          data-testid="pdf-resultado"
          aria-live="polite"
          className="text-sm font-medium text-exito-texto"
        >
          {exito}{' '}
          {pdfGenerado && (
            <button
              type="button"
              onClick={() => void verPdfGenerado(pdfGenerado.archivoId)}
              className="font-semibold text-acento underline-offset-2 hover:underline"
            >
              Ver PDF
            </button>
          )}
        </p>
      )}

      {exitoValidacion !== null && (
        <p className="text-sm font-medium text-exito-texto" data-testid="validacion-resultado">
          {exitoValidacion}
        </p>
      )}

      {mensaje && (
        <p role="alert" className="text-sm text-peligro-texto">
          {mensaje}
        </p>
      )}

      {validarAbierto && (
        <DialogoSeguimientoPropuesta
          modo="validar"
          revision={revision}
          catalogos={catalogos}
          puedeRegistrar={permisos.seguimiento}
          canalRfq={detalle.canalRfq}
          onCerrar={() => setValidarAbierto(false)}
          onExito={({ seguimientoRegistrado }) => {
            setExitoValidacion(
              seguimientoRegistrado
                ? 'Propuesta validada y seguimiento registrado.'
                : 'Propuesta validada (el seguimiento ya estaba registrado).',
            );
            void refrescar();
          }}
        />
      )}

      <p className="text-xs text-texto-secundario">
        Totales de la revisión: {formatearMoneda(revision.totales.subtotal, revision.totales.moneda)} + IVA ={' '}
        <span className="font-medium text-texto-primario">
          {formatearMoneda(revision.totales.total, revision.totales.moneda)}
        </span>
      </p>
    </section>
  );
}
