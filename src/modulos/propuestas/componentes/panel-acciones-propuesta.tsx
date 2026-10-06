'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { formatearFecha, formatearMoneda } from '@/compartido/utilidades/formatear';
import { aceptarRevisionAccion } from '@/modulos/propuestas/acciones/aceptar-revision';
import { cerrarPropuestaAccion } from '@/modulos/propuestas/acciones/cerrar-propuesta';
import { confirmarVentaAccion } from '@/modulos/propuestas/acciones/confirmar-venta';
import { crearNuevaRevisionAccion } from '@/modulos/propuestas/acciones/crear-nueva-revision';
import { enviarRevisionAccion } from '@/modulos/propuestas/acciones/enviar-revision';
import { generarPdfRevisionAccion } from '@/modulos/propuestas/acciones/generar-pdf-revision';
import { rechazarPropuestaAccion } from '@/modulos/propuestas/acciones/rechazar-propuesta';
import { validarRevisionAccion } from '@/modulos/propuestas/acciones/validar-revision';
import type {
  PermisosPropuesta,
} from '@/modulos/propuestas/tipos/indice';
import { ETIQUETA_ESTADO_PROPIESTA } from '@/modulos/propuestas/utilidades/indice';
import { claveDetallePropuesta } from './claves-consulta';
import type { DetallePropuestaFicha, RevisionConTotales } from '@/modulos/propuestas/acciones/obtener-propuesta';

type Formulario = 'ninguno' | 'enviar' | 'nueva' | 'rechazar' | 'cerrar';

/**
 * SII-B4.11: acciones de negocio de la revisión activa (arriba de la ficha).
 * La UI solo ofrece acciones válidas por estado; el SQL revalida permisos,
 * CAS, flags y congelamiento.
 */
export function PanelAccionesPropuesta({
  detalle,
  revision,
  permisos,
}: {
  detalle: DetallePropuestaFicha;
  revision: RevisionConTotales;
  permisos: PermisosPropuesta;
}) {
  const queryClient = useQueryClient();
  const [formulario, setFormulario] = useState<Formulario>('ninguno');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [canal, setCanal] = useState('correo');
  const [destino, setDestino] = useState('');
  const [motivo, setMotivo] = useState('');

  const estado = revision.estado;
  const esBorrador = estado === 'DRAFT';
  const requiereRevision = revision.requiereRevisionRuteo || revision.requiereRevisionCosteo;
  const pdfVigente = revision.pdfs.find((pdf) => pdf.vigente) ?? null;
  const tieneAccion = detalle.acciones.some((accion) => accion.revisionId === revision.id);
  const esAceptada = detalle.propuesta.acceptedRevisionId === revision.id;

  async function refrescar(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: claveDetallePropuesta(detalle.propuesta.id) });
    await queryClient.invalidateQueries({ queryKey: ['propuestas'] });
  }

  async function ejecutar(accion: () => Promise<{ exito: boolean; error?: string }>): Promise<void> {
    setProcesando(true);
    setMensaje(null);
    const respuesta = await accion();
    setProcesando(false);
    if (!respuesta.exito) {
      setMensaje(respuesta.error ?? 'No se pudo completar la acción');
      return;
    }
    setFormulario('ninguno');
    setMotivo('');
    setDestino('');
    await refrescar();
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
            onClick={() => void ejecutar(() => validarRevisionAccion({
              revisionId: revision.id,
              actualizadoEn: revision.actualizadoEn,
            }))}
            disabled={procesando || requiereRevision}
            title={requiereRevision ? 'Confirma ruteo y costeo antes de validar' : undefined}
          >
            Validar
          </Button>
        )}

        {estado === 'READY_TO_SEND' && permisos.generarPdf && (
          <Button
            tamano="sm"
            variante="contorno"
            onClick={() => void ejecutar(() => generarPdfRevisionAccion({ revisionId: revision.id }))}
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
          <Button
            tamano="sm"
            onClick={() => void ejecutar(() => aceptarRevisionAccion({
              revisionId: revision.id,
              actualizadoEn: revision.actualizadoEn,
            }))}
            disabled={procesando}
          >
            Aceptar revisión
          </Button>
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

        {(estado === 'SENT' || estado === 'FOLLOW_UP' || estado === 'ACCEPTED') && permisos.crearRevision && (
          <Button
            tamano="sm"
            variante="contorno"
            onClick={() => setFormulario(formulario === 'nueva' ? 'ninguno' : 'nueva')}
            disabled={procesando}
          >
            Nueva revisión
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
              <Select value={canal} onChange={(evento) => setCanal(evento.target.value)} aria-label="Canal de envío">
                <option value="correo">Correo</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="entrega">Entrega física</option>
              </Select>
            </label>
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
                canal,
                destino,
              }))}
              disabled={procesando || destino.trim() === ''}
            >
              Confirmar envío
            </Button>
            <Button tamano="sm" variante="fantasma" onClick={() => setFormulario('ninguno')}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {(formulario === 'nueva' || formulario === 'rechazar' || formulario === 'cerrar') && (
        <div className="flex flex-col gap-2 rounded-base border border-borde p-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">
              {formulario === 'nueva' ? 'Motivo de la nueva revisión' : 'Motivo'}
            </span>
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
              variante={formulario === 'nueva' ? 'primario' : 'destructivo'}
              onClick={() => {
                if (formulario === 'nueva') {
                  return void ejecutar(() => crearNuevaRevisionAccion({
                    revisionOrigen: revision.id,
                    motivo,
                  }));
                }
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
              {formulario === 'nueva'
                ? 'Crear revisión'
                : formulario === 'rechazar'
                  ? 'Confirmar rechazo'
                  : 'Confirmar cierre'}
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

      {mensaje && (
        <p role="alert" className="text-sm text-peligro-texto">
          {mensaje}
        </p>
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
