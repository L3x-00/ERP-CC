'use client';

import { useState } from 'react';

import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { firmarArchivoPropuestaAccion } from '@/modulos/propuestas/acciones/firmar-archivo-propuesta';
import type { PdfRevisionPropuesta, RevisionPropuesta } from '@/modulos/propuestas/tipos/indice';

/**
 * SII-B4.7/4.11: PDFs por revisión con historial de versiones (vigente y
 * reemplazadas). La descarga usa URL firmada corta del servidor.
 */
export function PanelPdfsPropuesta({
  revision,
  pdfs,
}: {
  revision: RevisionPropuesta;
  pdfs: PdfRevisionPropuesta[];
}) {
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function ver(archivoId: string): Promise<void> {
    setMensaje(null);
    const respuesta = await firmarArchivoPropuestaAccion({
      propuestaId: revision.propuestaId,
      archivoId,
    });
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    window.open(respuesta.datos?.url, '_blank', 'noopener,noreferrer');
  }

  const historial = [...pdfs].sort((a, b) => b.version - a.version);

  return (
    <section className="flex flex-col gap-3" data-testid="panel-pdfs-propuesta">
      <h3 className="text-sm font-semibold text-texto-primario">
        PDF de la revisión {revision.letra}
      </h3>

      {historial.length === 0 ? (
        <p className="text-sm text-texto-secundario">
          Sin PDF generado. Se genera sobre revisiones listas para enviar.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-borde">
          {historial.map((pdf) => (
            <li key={pdf.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-medium">
                  Propuesta {revision.folioRevision}.pdf
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-texto-secundario">
                  <Badge variante="neutro">v{pdf.version}</Badge>
                  {pdf.vigente ? (
                    <Badge variante="exito">vigente</Badge>
                  ) : (
                    <Badge variante="neutro">reemplazado</Badge>
                  )}
                  <span>{formatearFecha(pdf.creadoEn)}</span>
                </span>
              </div>
              <Button
                variante="fantasma"
                tamano="sm"
                aria-label={`Ver PDF de la revisión ${revision.letra}, versión ${pdf.version} (${
                  pdf.vigente ? 'vigente' : 'reemplazado'
                })`}
                onClick={() => void ver(pdf.archivoId)}
              >
                Ver
              </Button>
            </li>
          ))}
        </ul>
      )}

      {revision.estado === 'SENT' && (
        <p className="text-xs text-texto-secundario">
          La revisión enviada es inmutable: un cambio requiere una nueva revisión con su propio PDF.
        </p>
      )}

      {mensaje && (
        <p role="alert" className="text-sm text-peligro-texto">
          {mensaje}
        </p>
      )}
    </section>
  );
}
