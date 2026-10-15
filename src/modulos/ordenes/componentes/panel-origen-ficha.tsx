import Link from 'next/link';

import type { OrigenComercialFicha } from '@/modulos/ordenes/tipos/ficha-orden';
import {
  enlacePropuestaOrigen,
  enlaceRfqOrigen,
} from '@/modulos/ordenes/utilidades/enlaces-origen';

function FilaOrigen({
  clave,
  etiqueta,
  folio,
  detalle,
  href,
}: {
  clave: string;
  etiqueta: string;
  folio: string | null;
  detalle?: string | null;
  href: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-2" data-testid={`ficha-origen-${clave}`}>
      <dt className="text-texto-secundario">{etiqueta}:</dt>
      <dd>
        {folio === null ? (
          <span className="text-texto-secundario">No disponible</span>
        ) : href !== null ? (
          <Link href={href} className="font-mono text-acento underline">{folio}</Link>
        ) : (
          <span className="font-mono">{folio}</span>
        )}
        {folio !== null && detalle ? <span className="text-texto-secundario"> · {detalle}</span> : null}
      </dd>
    </div>
  );
}

/** Sin ningún folio humano no hay origen que mostrar (aunque llegaran ids): nunca tres filas vacías. */
function conFolios(origen: OrigenComercialFicha | null): OrigenComercialFicha | null {
  if (origen === null) return null;
  const hayFolio = origen.rfqFolio !== null || origen.propuestaFolio !== null || origen.revisionFolio !== null;
  return hayFolio ? origen : null;
}

/**
 * Origen comercial congelado en la orden (RFQ → Propuesta → Revisión aceptada), por folio.
 * Los enlaces solo existen si el usuario puede ver el destino; sin permiso el folio es texto.
 */
export function PanelOrigenComercialFicha({
  origen,
  puedeVerRfq,
  puedeVerPropuesta,
}: {
  origen: OrigenComercialFicha | null;
  puedeVerRfq: boolean;
  puedeVerPropuesta: boolean;
}) {
  const visible = conFolios(origen);
  const hrefPropuesta = puedeVerPropuesta && visible ? enlacePropuestaOrigen(visible.propuestaId) : null;
  return (
    <div className="rounded-md border border-borde p-3" data-testid="ficha-origen-comercial">
      <p className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">Origen comercial</p>
      {visible ? (
        <dl className="mt-2 grid gap-1 text-sm">
          <FilaOrigen
            clave="rfq"
            etiqueta="RFQ"
            folio={visible.rfqFolio}
            href={puedeVerRfq ? enlaceRfqOrigen(visible.rfqId) : null}
          />
          <FilaOrigen clave="propuesta" etiqueta="Propuesta" folio={visible.propuestaFolio} href={hrefPropuesta} />
          <FilaOrigen
            clave="revision"
            etiqueta="Revisión aceptada"
            folio={visible.revisionFolio}
            detalle={visible.revisionLetra ? `Revisión ${visible.revisionLetra}` : null}
            href={hrefPropuesta}
          />
        </dl>
      ) : (
        <p className="mt-2 text-sm text-texto-secundario">Sin origen comercial</p>
      )}
    </div>
  );
}
