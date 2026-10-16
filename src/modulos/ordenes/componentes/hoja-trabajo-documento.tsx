import type { ReactNode } from 'react';

import type { HojaTrabajoOrden } from '@/modulos/ordenes/tipos/ficha-orden';
import { claveValor } from '@/modulos/ordenes/utilidades/formato-ficha';

/**
 * Marcado de la hoja de trabajo, compartido por la pestaña Documento de la ficha y por el piso. Solo
 * recibe la proyección sin economía; `children` es el único hueco (la ficha añade Totales ahí con
 * orden_ver_totales). Con `onAbrirArchivo` el nombre de cada archivo se vuelve un botón.
 */
export function HojaTrabajoDocumento({
  hoja,
  detalleEncabezado,
  onAbrirArchivo,
  children,
}: {
  hoja: HojaTrabajoOrden;
  detalleEncabezado?: string;
  onAbrirArchivo?: (archivoId: string) => void;
  children?: ReactNode;
}) {
  return (
    <article className="rounded-lg border border-borde p-6" data-testid="hoja-trabajo">
      <header className="border-b border-borde pb-3">
        <h2 className="text-lg font-bold">Orden de servicio {hoja.folio}</h2>
        <p className="text-sm text-texto-secundario">
          {hoja.clienteNombre ?? ''}{detalleEncabezado ? ` · ${detalleEncabezado}` : ''}
        </p>
      </header>
      <div className="mt-4 grid gap-3 text-sm">
        {hoja.items.map((item) => (
          <div key={item.codigoItem} className="rounded-md bg-superficie-2 p-3">
            <p className="font-semibold">
              {item.codigoItem} · {item.descripcion ?? ''}
            </p>
            <p className="text-xs text-texto-secundario">
              {claveValor(item.cantidad)} · {item.material ?? 'sin material'} · {item.espesor ?? 'sin espesor'}
            </p>
            {item.procesos.length > 0 ? (
              <p className="text-xs text-texto-secundario">{item.procesos.join(' → ')}</p>
            ) : null}
            {item.observaciones ? (
              <p className="whitespace-pre-wrap text-xs text-texto-secundario">
                Observaciones: {item.observaciones}
              </p>
            ) : null}
          </div>
        ))}
        {hoja.observacionesOrden ? (
          <p className="whitespace-pre-wrap rounded-md border border-borde p-3 text-texto-secundario">
            Observaciones de la orden: {hoja.observacionesOrden}
          </p>
        ) : null}
        {hoja.archivos.length > 0 ? (
          <div>
            <h3 className="text-xs font-semibold text-texto-secundario">Archivos</h3>
            <ul className="mt-1 grid gap-0.5 text-xs">
              {hoja.archivos.map((archivo) => {
                const nombre = archivo.nombreOriginal ?? archivo.nombreErp ?? 'Archivo sin nombre';
                return (
                  <li key={archivo.archivoId}>
                    {onAbrirArchivo ? (
                      <button
                        type="button"
                        onClick={() => onAbrirArchivo(archivo.archivoId)}
                        className="text-left font-medium text-acento hover:underline print:text-inherit print:no-underline"
                      >
                        {nombre}
                      </button>
                    ) : nombre}
                    <span className="text-texto-secundario"> · {archivo.asociadoA}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
      {children}
    </article>
  );
}
