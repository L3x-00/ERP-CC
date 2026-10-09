'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { editarItemPropuestaAccion } from '@/modulos/propuestas/acciones/editar-item-propuesta';
import type { CatalogosPropuesta } from '@/modulos/propuestas/acciones/obtener-catalogos-propuesta';
import { calcularTotalesPropuesta } from '@/modulos/propuestas/servicios/calcular-totales-propuesta';
import type {
  CostoRevisionPropuesta,
  PermisosPropuesta,
  PropuestaItem,
  RevisionPropuesta,
  RuteoItemPropuesta,
} from '@/modulos/propuestas/tipos/indice';
import { ETIQUETA_ESTADO_PROPIESTA } from '@/modulos/propuestas/utilidades/indice';
import { claveDetallePropuesta } from './claves-consulta';
import { FormularioAltaItemPropuesta } from './formulario-alta-item-propuesta';

type Borrador = {
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  esDescuento: boolean;
  activo: boolean;
};

/** C3.1: un ítem propio solo nace en una revisión B..Z (la A copia el RFQ). */
function admiteItemPropio(letra: string): boolean {
  return letra.length === 1 && letra >= 'B' && letra <= 'Z';
}

/**
 * SII-B4.5/4.11 + C3.1: editor de ítems de una revisión DRAFT con totales en
 * vivo (espejo TS del cálculo SQL). El precio exige `propuesta_editar_precio` y
 * el resto `propuesta_editar_articulo`; ITxx nunca se edita ni se reutiliza y el
 * alta de un ítem propio solo existe en revisiones B..Z en borrador.
 */
export function EditorItemsPropuesta({
  revision,
  revisiones,
  items,
  ruteo,
  costos,
  catalogos,
  errorCatalogos = null,
  permisos,
}: {
  revision: RevisionPropuesta;
  revisiones: RevisionPropuesta[];
  items: PropuestaItem[];
  ruteo: RuteoItemPropuesta[];
  costos: CostoRevisionPropuesta[];
  catalogos: CatalogosPropuesta | null;
  errorCatalogos?: string | null;
  permisos: PermisosPropuesta;
}) {
  const queryClient = useQueryClient();
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  const esBorrador = revision.estado === 'DRAFT';
  const itemsRevision = items.filter((item) => item.revisionId === revision.id);
  const puedeAgregar = esBorrador && admiteItemPropio(revision.letra) && permisos.editarArticulo;

  const letraPorRevision = useMemo(
    () => new Map(revisiones.map((fila) => [fila.id, fila.letra])),
    [revisiones],
  );

  function valorDe(item: PropuestaItem): Borrador {
    return (
      borradores[item.id] ?? {
        descripcion: item.descripcion,
        cantidad: String(item.cantidad),
        precioUnitario: String(item.precioUnitario),
        esDescuento: item.esDescuento,
        activo: item.activo,
      }
    );
  }

  function actualizar(item: PropuestaItem, parche: Partial<Borrador>): void {
    setBorradores((actual) => ({ ...actual, [item.id]: { ...valorDe(item), ...parche } }));
  }

  const totales = useMemo(
    () =>
      calcularTotalesPropuesta({
        items: itemsRevision.map((item) => {
          const valor = valorDe(item);
          return {
            cantidad: Number(valor.cantidad) || 0,
            precioUnitario: Number(valor.precioUnitario) || 0,
            esDescuento: valor.esDescuento,
            activo: valor.activo,
          };
        }),
        costoTotal: costos
          .filter((costo) => costo.revisionId === revision.id)
          .reduce((suma, costo) => suma + costo.monto, 0),
        ivaPorcentaje: revision.snapshotCabecera.ivaPorcentaje,
        moneda: revision.snapshotCabecera.moneda,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemsRevision, borradores, costos, revision],
  );

  async function guardar(item: PropuestaItem): Promise<void> {
    const valor = valorDe(item);
    const cambios: Record<string, unknown> = { itemId: item.id, actualizadoEn: item.actualizadoEn };
    if (valor.descripcion !== item.descripcion) cambios.descripcion = valor.descripcion;
    if (Number(valor.cantidad) !== item.cantidad) cambios.cantidad = Number(valor.cantidad);
    if (Number(valor.precioUnitario) !== item.precioUnitario) {
      cambios.precioUnitario = Number(valor.precioUnitario);
    }
    if (valor.esDescuento !== item.esDescuento) cambios.esDescuento = valor.esDescuento;
    if (valor.activo !== item.activo) cambios.activo = valor.activo;

    if (Object.keys(cambios).length === 2) {
      setMensaje('Sin cambios en el ítem.');
      return;
    }

    setGuardando(item.id);
    setMensaje(null);
    const respuesta = await editarItemPropuestaAccion(cambios);
    setGuardando(null);
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    setBorradores((actual) => {
      const copia = { ...actual };
      delete copia[item.id];
      return copia;
    });
    // Refresca el token CAS antes de confirmar: evita guardar con una versión obsoleta.
    await queryClient.invalidateQueries({ queryKey: claveDetallePropuesta(revision.propuestaId) });
    setMensaje(`Ítem ${item.codigo} guardado.`);
  }

  return (
    <section className="flex flex-col gap-3" data-testid="editor-items-propuesta">
      <div className="grid gap-2 rounded-lg border border-borde bg-superficie-2 p-3 text-sm sm:grid-cols-4">
        <Resumen etiqueta="Subtotal" valor={formatearMoneda(totales.subtotal, totales.moneda)} />
        <Resumen etiqueta={`IVA (${totales.ivaPorcentaje}%)`} valor={formatearMoneda(totales.iva, totales.moneda)} />
        <Resumen etiqueta="Total" valor={formatearMoneda(totales.total, totales.moneda)} />
        <Resumen
          etiqueta="Margen"
          valor={totales.margen === null ? '—' : `${(totales.margen * 100).toFixed(2)}%`}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-borde text-left text-xs text-texto-secundario">
              <th className="px-2 py-2">ITxx</th>
              <th className="px-2 py-2">Descripción</th>
              <th className="px-2 py-2">Cantidad</th>
              <th className="px-2 py-2">Precio unitario</th>
              <th className="px-2 py-2">Importe</th>
              <th className="px-2 py-2">Origen</th>
              <th className="px-2 py-2">Estado</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {itemsRevision.map((item) => {
              const valor = valorDe(item);
              const importe = (Number(valor.cantidad) || 0) * (Number(valor.precioUnitario) || 0);
              const requiereRevisionItem = ruteo.some(
                (fila) => fila.itemId === item.id && fila.requiereRevision,
              );
              const letraOrigen = letraPorRevision.get(item.revisionOrigenId) ?? null;
              return (
                <tr
                  key={item.id}
                  className="border-b border-borde/60"
                  data-testid={`item-propuesta-${item.id}`}
                >
                  <td className="px-2 py-2 font-mono text-xs">{item.codigo}</td>
                  <td className="px-2 py-2">
                    <Input
                      value={valor.descripcion}
                      onChange={(evento) => actualizar(item, { descripcion: evento.target.value })}
                      disabled={!esBorrador || !permisos.editarArticulo}
                      aria-label={`Descripción ${item.codigo}`}
                      maxLength={300}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={valor.cantidad}
                      onChange={(evento) => actualizar(item, { cantidad: evento.target.value })}
                      disabled={!esBorrador || !permisos.editarArticulo}
                      aria-label={`Cantidad ${item.codigo}`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.0001"
                      value={valor.precioUnitario}
                      onChange={(evento) => actualizar(item, { precioUnitario: evento.target.value })}
                      disabled={!esBorrador || !permisos.editarPrecio}
                      aria-label={`Precio ${item.codigo}`}
                    />
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {formatearMoneda(valor.esDescuento ? -importe : importe, totales.moneda)}
                  </td>
                  <td className="px-2 py-2 text-xs text-texto-secundario">
                    {letraOrigen === null ? '—' : `Agregado en Rev ${letraOrigen}`}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={valor.esDescuento}
                          onChange={(evento) => actualizar(item, { esDescuento: evento.target.checked })}
                          disabled={!esBorrador || !permisos.editarArticulo}
                          aria-label={`Descuento ${item.codigo}`}
                        />
                        Descuento
                      </label>
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={valor.activo}
                          onChange={(evento) => actualizar(item, { activo: evento.target.checked })}
                          disabled={!esBorrador || !permisos.editarArticulo}
                          aria-label={`Activo ${item.codigo}`}
                        />
                        Activo
                      </label>
                      {requiereRevisionItem && (
                        <span className="rounded-full bg-advertencia-suave px-2 py-0.5 text-xs text-advertencia-texto">
                          Requiere revisión
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    {esBorrador && (
                      <Button
                        tamano="sm"
                        variante="contorno"
                        onClick={() => void guardar(item)}
                        disabled={guardando === item.id}
                      >
                        {guardando === item.id ? '…' : 'Guardar'}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {itemsRevision.length === 0 && (
        <p className="text-sm text-texto-secundario">La revisión no tiene ítems.</p>
      )}

      {puedeAgregar && (
        <FormularioAltaItemPropuesta
          revision={revision}
          catalogos={catalogos}
          errorCatalogos={errorCatalogos}
          puedeEditarPrecio={permisos.editarPrecio}
        />
      )}

      {!esBorrador && (
        <p className="text-xs text-texto-secundario">
          La revisión está congelada; crea una nueva revisión para cambiar ítems.
        </p>
      )}

      {esBorrador && !admiteItemPropio(revision.letra) && (
        <p className="text-xs text-texto-secundario">
          La revisión A hereda los ítems del RFQ; los ítems nuevos se agregan desde la revisión B.
        </p>
      )}

      {mensaje && (
        <p role="status" className="text-sm text-texto-secundario">
          {mensaje}
        </p>
      )}

      <p className="text-xs text-texto-secundario">
        Estado de la revisión:{' '}
        <BadgeEstado
          estado={revision.estado}
          etiqueta={ETIQUETA_ESTADO_PROPIESTA[revision.estado]}
        />
      </p>
    </section>
  );
}

function Resumen({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-texto-secundario">{etiqueta}</span>
      <span className="font-medium tabular-nums">{valor}</span>
    </div>
  );
}
