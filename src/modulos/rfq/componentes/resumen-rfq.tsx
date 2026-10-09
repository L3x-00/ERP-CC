'use client';

import { Button } from '@/compartido/componentes/ui/button';
import type { CatalogosRfq } from '@/modulos/rfq/acciones/obtener-catalogos';
import type { Rfq } from '@/modulos/rfq/tipos/indice';
import { esDefinicionRfqEditable, motivoDefinicionRfqBloqueada } from '@/modulos/rfq/utilidades/estados';
import {
  CLASE_OBLIGATORIO,
  analizarFaltantesCliente,
  analizarFaltantesGenerales,
  analizarFaltantesSeguimiento,
} from '@/modulos/rfq/utilidades/faltantes';

const SIN_VALOR = '—';

/**
 * Formatea un valor de fecha calendario (`date` o el legado `fecha_requerida`
 * timestamptz) tomando solo su parte `YYYY-MM-DD` y renderizando en UTC. Evita
 * el corrimiento de un día que produce `new Date('YYYY-MM-DD')` combinado con
 * un `Intl.DateTimeFormat` en zona horaria local negativa.
 */
function formatearFechaCalendario(valor: string | null): string {
  if (!valor) return SIN_VALOR;
  const [anioTexto, mesTexto, diaTexto] = valor.slice(0, 10).split('-');
  const anio = Number(anioTexto);
  const mes = Number(mesTexto);
  const dia = Number(diaTexto);
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || !Number.isFinite(dia)) {
    return SIN_VALOR;
  }
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    return SIN_VALOR;
  }
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(fecha);
}

/** Formatea un timestamp completo (última modificación) con fecha y hora legibles. */
function formatearFechaHora(valor: string): string {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return SIN_VALOR;
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(fecha);
}

function Campo({
  etiqueta,
  valor,
  faltante = false,
  obligatorio = false,
}: {
  etiqueta: string;
  valor: string;
  faltante?: boolean;
  obligatorio?: boolean;
}) {
  return (
    <div
      data-faltante={faltante ? 'si' : 'no'}
      className={
        faltante
          ? 'flex flex-col gap-0.5 rounded-md border border-peligro/40 bg-peligro-suave px-2 py-1'
          : 'flex flex-col gap-0.5'
      }
    >
      <span
        className={`text-xs font-medium text-texto-secundario ${obligatorio ? CLASE_OBLIGATORIO : ''}`}
      >
        {etiqueta}
      </span>
      <span className="text-sm text-texto-primario">{valor || SIN_VALOR}</span>
    </div>
  );
}

/** Texto legible de la próxima acción: nombre del catálogo y, para Otro, el detalle. */
function textoProximaAccion(rfq: Rfq, catalogos: CatalogosRfq | null): string {
  if (!rfq.proximaAccionCodigo) return SIN_VALOR;
  const accion = catalogos?.proximasAcciones.find(
    (opcion) => opcion.codigo === rfq.proximaAccionCodigo,
  );
  if (!accion) return rfq.proximaAccionTexto || rfq.proximaAccionCodigo;
  if (accion.esOtro && rfq.proximaAccionTexto) {
    return `${accion.nombre}: ${rfq.proximaAccionTexto}`;
  }
  return accion.nombre;
}

/** Conserva valores históricos y resuelve los códigos nuevos al nombre visible. */
function textoCanal(rfq: Rfq, catalogos: CatalogosRfq | null): string {
  if (!rfq.canal) return SIN_VALOR;
  const canal = catalogos?.canales.find(
    (opcion) =>
      opcion.codigo.localeCompare(rfq.canal!, 'es', { sensitivity: 'base' }) === 0 ||
      opcion.nombre.localeCompare(rfq.canal!, 'es', { sensitivity: 'base' }) === 0,
  );
  const nombre = canal?.nombre ?? rfq.canal;
  return canal?.esOtro && rfq.canalDetalle ? `${nombre}: ${rfq.canalDetalle}` : nombre;
}

/**
 * Pestaña Resumen del RFQ (solo lectura): tres tarjetas (datos generales,
 * próxima acción, descripción) con `Editar resumen` como única puerta hacia
 * `FormularioGeneralRfq`. `FichaRfq` decide cuándo mostrar esta vista o el
 * formulario; este componente solo decide si el botón de edición aparece.
 */
export function ResumenRfq({
  rfq,
  catalogos,
  onEditar,
  faltantes,
}: {
  rfq: Rfq;
  catalogos: CatalogosRfq | null;
  onEditar: () => void;
  faltantes?: {
    cliente?: readonly string[];
    general?: readonly string[];
    seguimiento?: readonly string[];
  };
}) {
  const editable = esDefinicionRfqEditable(rfq.estadoRfq);
  const clienteTexto = rfq.clienteNombre?.trim() || rfq.empresa;
  const contactoTexto = rfq.contactoNombre?.trim() || rfq.nombreContacto;
  const fCliente = analizarFaltantesCliente(faltantes?.cliente ?? []);
  const fGeneral = analizarFaltantesGenerales(faltantes?.general ?? []);
  const fSeguimiento = analizarFaltantesSeguimiento(faltantes?.seguimiento ?? []);

  return (
    <div className="flex flex-col gap-4" data-testid="resumen-rfq">
      <div className="flex justify-end">
        {editable && (
          <Button variante="contorno" tamano="sm" onClick={onEditar}>
            Editar resumen
          </Button>
        )}
      </div>

      {!editable && (
        <p className="rounded-md bg-superficie-2 px-3 py-2 text-sm text-texto-secundario">
          {motivoDefinicionRfqBloqueada(rfq.estadoRfq)}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section
          aria-label="Datos generales"
          data-testid="rfq-datos-generales"
          className="rounded-lg border border-borde bg-superficie p-4 shadow-sm lg:row-span-2"
        >
          <h2 className="mb-3 text-sm font-semibold text-texto-primario">Datos generales</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Folio" valor={rfq.folio} />
            <Campo
              etiqueta="Cliente"
              valor={clienteTexto}
              obligatorio
              faltante={fCliente.cliente}
            />
            <Campo
              etiqueta="Contacto"
              valor={contactoTexto}
              obligatorio
              faltante={fCliente.contacto}
            />
            <Campo
              etiqueta="Canal"
              valor={textoCanal(rfq, catalogos)}
              obligatorio
              faltante={fGeneral.canal}
            />
            <Campo
              etiqueta="Fecha de solicitud"
              valor={formatearFechaCalendario(rfq.fechaSolicitud)}
              obligatorio
              faltante={fGeneral.fechaSolicitud}
            />
            <Campo
              etiqueta="Fecha requerida por cliente"
              valor={formatearFechaCalendario(rfq.fechaRequeridaCliente)}
            />
            <Campo
              etiqueta="Responsable"
              valor={rfq.responsableNombre ?? SIN_VALOR}
              obligatorio
              faltante={fGeneral.responsable}
            />
            <Campo etiqueta="Última modificación" valor={formatearFechaHora(rfq.actualizadoEn)} />
          </div>
        </section>

        <section
          aria-label="Próxima acción"
          data-testid="rfq-proxima-accion"
          className="rounded-lg border border-borde bg-superficie p-4 shadow-sm"
        >
          <h2 className="mb-3 text-sm font-semibold text-texto-primario">Próxima acción</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etiqueta="Acción"
              valor={textoProximaAccion(rfq, catalogos)}
              obligatorio
              faltante={fSeguimiento.proximaAccion}
            />
            <Campo
              etiqueta="Fecha"
              valor={formatearFechaCalendario(rfq.fechaProximaAccion)}
              obligatorio
              faltante={fSeguimiento.fechaProximaAccion}
            />
            <Campo
              etiqueta="Responsable"
              valor={rfq.responsableProximaAccionNombre ?? SIN_VALOR}
              obligatorio
              faltante={fSeguimiento.responsableProximaAccion}
            />
          </div>
        </section>

        <section
          aria-label="Descripción general"
          data-testid="rfq-descripcion"
          className="rounded-lg border border-borde bg-superficie p-4 shadow-sm"
        >
          <h2 className={`mb-3 text-sm font-semibold text-texto-primario ${CLASE_OBLIGATORIO}`}>
            Descripción general
          </h2>
          <p
            data-faltante={fGeneral.descripcionGeneral ? 'si' : 'no'}
            className={
              fGeneral.descripcionGeneral
                ? 'whitespace-pre-wrap rounded-md border border-peligro/40 bg-peligro-suave px-2 py-1 text-sm text-texto-primario'
                : 'whitespace-pre-wrap text-sm text-texto-primario'
            }
          >
            {rfq.descripcionGeneral || SIN_VALOR}
          </p>
        </section>
      </div>
    </div>
  );
}
