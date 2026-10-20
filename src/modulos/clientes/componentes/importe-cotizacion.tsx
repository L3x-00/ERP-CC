'use client';

import Link from 'next/link';

import { formatearMoneda } from '@/compartido/utilidades/formatear';
import type { ImporteCotizacionHistorial } from '@/modulos/clientes/tipos/historial';
import { ETIQUETA_ESTADO_PROPIESTA } from '@/modulos/propuestas/utilidades/indice';

const CLASE_SIN_MONTO = 'text-sm text-texto-secundario';

/**
 * Importe de una cotización en el historial. Solo presenta como dinero lo que
 * una fuente registra; un dato ausente, un rol sin acceso o un error de lectura
 * se rotulan como tales y nunca como `$0.00`.
 */
export function ImporteCotizacion({
  cotizacionId,
  importe,
}: {
  cotizacionId: string;
  importe: ImporteCotizacionHistorial;
}) {
  return (
    <div className="flex flex-col items-end gap-0.5" data-testid={`importe-cotizacion-${cotizacionId}`}>
      <ContenidoImporte importe={importe} />
    </div>
  );
}

function ContenidoImporte({ importe }: { importe: ImporteCotizacionHistorial }) {
  switch (importe.tipo) {
    case 'cotizador':
      return (
        <span className="tabular-nums text-sm font-medium text-texto-primario">
          {formatearMoneda(importe.subtotal, importe.moneda)}
        </span>
      );
    case 'propuesta':
      return (
        <>
          <span className="tabular-nums text-sm font-medium text-texto-primario">
            {formatearMoneda(importe.subtotal, importe.moneda)}
          </span>
          <OrigenPropuesta
            prefijo="Subtotal de la propuesta"
            origen={importe.origen}
          />
        </>
      );
    case 'pendiente':
      return (
        <>
          <span className={CLASE_SIN_MONTO}>Precio pendiente</span>
          <OrigenPropuesta prefijo="Propuesta" origen={importe.origen} />
        </>
      );
    case 'sin-datos':
      return <span className={CLASE_SIN_MONTO}>Sin importe registrado</span>;
    case 'sin-permiso':
      return <span className={CLASE_SIN_MONTO}>Importe no visible para tu rol</span>;
    case 'error':
      return <span className={CLASE_SIN_MONTO}>Importe no disponible</span>;
  }
}

function OrigenPropuesta({
  prefijo,
  origen,
}: {
  prefijo: string;
  origen: Extract<ImporteCotizacionHistorial, { tipo: 'propuesta' | 'pendiente' }>['origen'];
}) {
  return (
    <span className="text-xs text-texto-secundario">
      {prefijo}{' '}
      <Link href={`/propuestas?propuesta=${origen.propuestaId}`} className="font-mono text-acento underline">
        {origen.folioRevision}
      </Link>
      {' · '}
      {origen.aceptada ? 'Aceptada' : ETIQUETA_ESTADO_PROPIESTA[origen.estadoRevision]}
    </span>
  );
}
