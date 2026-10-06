'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { obtenerColaFacturasAccion } from '@/modulos/facturacion/acciones/obtener-cola-facturas';
import {
  PanelFactura,
  type ModoPanelFactura,
} from '@/modulos/facturacion/componentes/panel-factura';
import type { ColaFacturas, FacturaCola } from '@/modulos/facturacion/servicios/obtener-facturas';
import {
  ETIQUETA_ESTADO_FACTURA,
  filtrarFacturas,
  type FiltroEstadoFactura,
} from '@/modulos/facturacion/utilidades/indice';

const CLASE_ESTADO: Record<string, string> = {
  BORRADOR: 'bg-advertencia-suave text-advertencia-texto',
  EMITIDA: 'bg-exito-suave text-exito-texto',
  CANCELADA: 'bg-superficie-2 text-texto-secundario',
};

/**
 * SII-B8 F2: cola de facturación con borradores/emitidas/canceladas y alta
 * desde las entregas aún sin factura activa.
 */
export function ColaFacturas({
  inicial,
  puedeFacturar,
  entregaInicialId,
}: {
  inicial: ColaFacturas;
  puedeFacturar: boolean;
  entregaInicialId?: string;
}) {
  const [datos, setDatos] = useState<ColaFacturas>(inicial);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstadoFactura>('todas');
  const [texto, setTexto] = useState('');
  const [panel, setPanel] = useState<{ modo: ModoPanelFactura; factura: FacturaCola | null } | null>(
    entregaInicialId ? { modo: 'crear', factura: null } : null,
  );
  const [sesion, setSesion] = useState(0);
  const [actualizando, setActualizando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function actualizar(): Promise<void> {
    setActualizando(true);
    const respuesta = await obtenerColaFacturasAccion();
    if (respuesta.exito && respuesta.datos) {
      setDatos(respuesta.datos);
    } else if (!respuesta.exito) {
      setAviso(respuesta.error);
    }
    setActualizando(false);
  }

  function abrir(modo: ModoPanelFactura, factura: FacturaCola | null): void {
    setAviso(null);
    setSesion((actual) => actual + 1);
    setPanel({ modo, factura });
  }

  const facturasFiltradas = useMemo(
    () => filtrarFacturas(datos.facturas, { estado: filtroEstado, texto }),
    [datos.facturas, filtroEstado, texto],
  );

  return (
    <div className="flex flex-col gap-5" data-testid="cola-facturas">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Estado
            <Select
              className="min-h-11"
              data-testid="filtro-estado-factura"
              value={filtroEstado}
              onChange={(evento) => setFiltroEstado(evento.target.value as FiltroEstadoFactura)}
            >
              <option value="todas">Todas</option>
              <option value="BORRADOR">Borradores</option>
              <option value="EMITIDA">Emitidas</option>
              <option value="CANCELADA">Canceladas</option>
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Buscar (folio fiscal, cliente, orden o entrega)
            <Input
              className="min-h-11"
              data-testid="filtro-texto-factura"
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
            />
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="button" variante="contorno" tamano="sm" disabled={actualizando}
            data-testid="actualizar-facturas" onClick={() => void actualizar()}>
            {actualizando ? 'Actualizando…' : 'Actualizar'}
          </Button>
          {puedeFacturar ? (
            <Button type="button" tamano="sm" data-testid="nueva-factura" onClick={() => abrir('crear', null)}>
              Nueva factura
            </Button>
          ) : null}
        </div>
      </div>

      {aviso ? <p role="alert" className="text-sm text-peligro-texto">{aviso}</p> : null}

      {facturasFiltradas.length === 0 ? (
        <p className="rounded-md border border-borde p-6 text-center text-sm text-texto-secundario" data-testid="facturas-vacio">
          Sin facturas que coincidan con el filtro.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borde" data-testid="tabla-facturas">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Facturas administrativas por entrega</caption>
            <thead className="bg-superficie-2 text-left text-xs uppercase tracking-wide text-texto-secundario">
              <tr>
                <th scope="col" className="px-4 py-3">Estado</th>
                <th scope="col" className="px-4 py-3">Cliente</th>
                <th scope="col" className="px-4 py-3">Orden</th>
                <th scope="col" className="px-4 py-3">Entrega</th>
                <th scope="col" className="px-4 py-3 text-right">Total</th>
                <th scope="col" className="px-4 py-3">Folio fiscal</th>
                <th scope="col" className="px-4 py-3">Creada</th>
                <th scope="col" className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {facturasFiltradas.map((factura) => {
                const folioEntrega = factura.entregaFolioSii ?? factura.entregaFolio;
                return (
                  <tr key={factura.id} data-testid={`fila-factura-${factura.id}`} className="border-t border-borde">
                    <td className="px-4 py-3">
                      <span
                        data-testid={`estado-factura-${factura.id}`}
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASE_ESTADO[factura.estado] ?? ''}`}
                      >
                        {ETIQUETA_ESTADO_FACTURA[factura.estado]}
                      </span>
                    </td>
                    <td className="px-4 py-3">{factura.clienteNombre ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                      {factura.ordenFolioSii ?? factura.ordenFolio}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link href={`/entregas/${factura.entregaId}`} className="text-acento underline font-mono text-xs">
                        {folioEntrega}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {factura.total === null ? '—' : factura.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs" data-testid={`folio-fiscal-${factura.id}`}>
                      {factura.folioFiscal ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-texto-secundario">{formatearFecha(factura.creadoEn)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {puedeFacturar && factura.estado === 'BORRADOR' ? (
                          <>
                            <Button type="button" variante="contorno" tamano="sm"
                              data-testid={`editar-factura-${factura.id}`} onClick={() => abrir('editar', factura)}>
                              Editar
                            </Button>
                            <Button type="button" tamano="sm"
                              data-testid={`emitir-factura-${factura.id}`} onClick={() => abrir('emitir', factura)}>
                              Emitir
                            </Button>
                          </>
                        ) : null}
                        {puedeFacturar && factura.estado !== 'CANCELADA' ? (
                          <Button type="button" variante="destructivo" tamano="sm"
                            data-testid={`cancelar-factura-${factura.id}`} onClick={() => abrir('cancelar', factura)}>
                            Cancelar
                          </Button>
                        ) : null}
                        {factura.estado === 'CANCELADA' ? (
                          <span className="self-center text-xs text-texto-tenue">{factura.motivoCancelacion ?? ''}</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-texto-secundario">
        {datos.entregasFacturables.length} entrega(s) sin factura activa. Las facturas se emiten con el folio
        fiscal capturado del PAC (el ERP no timbra CFDI).
      </p>

      <PanelFactura
        key={`${panel?.modo ?? 'cerrado'}-${panel?.factura?.id ?? entregaInicialId ?? 'nueva'}-${sesion}`}
        modo={panel?.modo ?? 'crear'}
        factura={panel?.factura ?? null}
        entregas={datos.entregasFacturables}
        entregaInicialId={entregaInicialId}
        abierto={panel !== null}
        onCerrar={() => setPanel(null)}
        onActualizada={() => void actualizar()}
      />
    </div>
  );
}
