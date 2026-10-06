'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { formatearFecha, formatearMoneda } from '@/compartido/utilidades/formatear';
import { obtenerColaComprasAccion } from '@/modulos/compras/acciones/obtener-cola-compras';
import {
  PanelCompra,
  type ModoPanelCompra,
} from '@/modulos/compras/componentes/panel-compra';
import type { ColaCompras } from '@/modulos/compras/servicios/obtener-compras';
import { ETIQUETA_ESTADO_COMPRA, type CompraCola } from '@/modulos/compras/tipos/indice';

const CLASE_ESTADO: Record<string, string> = {
  BORRADOR: 'bg-advertencia-suave text-advertencia-texto',
  CONFIRMADA: 'bg-info-suave text-info-texto',
  RECIBIDA: 'bg-acento-suave text-acento',
  PAGADA: 'bg-exito-suave text-exito-texto',
  CANCELADA: 'bg-superficie-2 text-texto-secundario',
};

/** SII-B8 F4: cola de compras/CxP con folio CG y pagos a proveedores. */
export function ColaCompras({
  inicial,
  puedeGestionar,
}: {
  inicial: ColaCompras;
  puedeGestionar: boolean;
}) {
  const [datos, setDatos] = useState<ColaCompras>(inicial);
  const [filtroEstado, setFiltroEstado] = useState<string>('todas');
  const [texto, setTexto] = useState('');
  const [panel, setPanel] = useState<{ modo: ModoPanelCompra; compra: CompraCola | null } | null>(null);
  const [sesion, setSesion] = useState(0);
  const [actualizando, setActualizando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function actualizar(): Promise<void> {
    setActualizando(true);
    const respuesta = await obtenerColaComprasAccion();
    if (respuesta.exito && respuesta.datos) {
      setDatos(respuesta.datos);
    } else if (!respuesta.exito) {
      setAviso(respuesta.error);
    }
    setActualizando(false);
  }

  function abrir(modo: ModoPanelCompra, compra: CompraCola | null): void {
    setAviso(null);
    setSesion((actual) => actual + 1);
    setPanel({ modo, compra });
  }

  const comprasFiltradas = useMemo(() => {
    const termino = texto.trim().toLowerCase();
    return datos.compras.filter((compra) => {
      if (filtroEstado !== 'todas' && compra.estado !== filtroEstado) return false;
      if (!termino) return true;
      return [compra.folioSii, compra.proveedorNombre, compra.ordenFolio ?? '', compra.notas ?? '']
        .join(' ')
        .toLowerCase()
        .includes(termino);
    });
  }, [datos.compras, filtroEstado, texto]);

  return (
    <div className="flex flex-col gap-5" data-testid="cola-compras">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Estado
            <Select className="min-h-11" data-testid="filtro-estado-compra"
              value={filtroEstado} onChange={(evento) => setFiltroEstado(evento.target.value)}>
              <option value="todas">Todas</option>
              <option value="BORRADOR">Borradores</option>
              <option value="CONFIRMADA">Confirmadas</option>
              <option value="RECIBIDA">Recibidas</option>
              <option value="PAGADA">Pagadas</option>
              <option value="CANCELADA">Canceladas</option>
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Buscar (folio, proveedor u orden)
            <Input className="min-h-11" data-testid="filtro-texto-compra"
              value={texto} onChange={(evento) => setTexto(evento.target.value)} />
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="button" variante="contorno" tamano="sm" disabled={actualizando}
            data-testid="actualizar-compras" onClick={() => void actualizar()}>
            {actualizando ? 'Actualizando…' : 'Actualizar'}
          </Button>
          {puedeGestionar ? (
            <Button type="button" tamano="sm" data-testid="nueva-compra" onClick={() => abrir('crear', null)}>
              Nueva compra
            </Button>
          ) : null}
        </div>
      </div>

      {aviso ? <p role="alert" className="text-sm text-peligro-texto">{aviso}</p> : null}

      {comprasFiltradas.length === 0 ? (
        <p className="rounded-md border border-borde p-6 text-center text-sm text-texto-secundario" data-testid="compras-vacio">
          Sin compras que coincidan con el filtro.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borde" data-testid="tabla-compras">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Compras y cuentas por pagar</caption>
            <thead className="bg-superficie-2 text-left text-xs uppercase tracking-wide text-texto-secundario">
              <tr>
                <th scope="col" className="px-4 py-3">Folio</th>
                <th scope="col" className="px-4 py-3">Proveedor</th>
                <th scope="col" className="px-4 py-3">Orden</th>
                <th scope="col" className="px-4 py-3 text-right">Total</th>
                <th scope="col" className="px-4 py-3 text-right">Saldo</th>
                <th scope="col" className="px-4 py-3">Vence</th>
                <th scope="col" className="px-4 py-3">Estado</th>
                <th scope="col" className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {comprasFiltradas.map((compra) => (
                <tr key={compra.id} data-testid={`fila-compra-${compra.id}`} className="border-t border-borde">
                  <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-mono text-xs">
                    {compra.folioSii}
                  </th>
                  <td className="px-4 py-3">{compra.proveedorNombre}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{compra.ordenFolio ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {formatearMoneda(compra.montoTotal, compra.moneda as 'MXN' | 'USD')}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {formatearMoneda(compra.saldoPendiente, compra.moneda as 'MXN' | 'USD')}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-texto-secundario">
                    {compra.fechaVencimiento ? formatearFecha(compra.fechaVencimiento) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span data-testid={`estado-compra-${compra.id}`}
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASE_ESTADO[compra.estado] ?? ''}`}>
                      {ETIQUETA_ESTADO_COMPRA[compra.estado]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      {puedeGestionar && compra.estado === 'BORRADOR' ? (
                        <>
                          <Button type="button" variante="contorno" tamano="sm"
                            data-testid={`editar-compra-${compra.id}`} onClick={() => abrir('editar', compra)}>
                            Editar
                          </Button>
                          <Button type="button" tamano="sm"
                            data-testid={`confirmar-compra-${compra.id}`} onClick={() => abrir('estado', compra)}>
                            Confirmar
                          </Button>
                        </>
                      ) : null}
                      {puedeGestionar && compra.estado === 'CONFIRMADA' ? (
                        <Button type="button" tamano="sm"
                          data-testid={`recibir-compra-${compra.id}`} onClick={() => abrir('estado', compra)}>
                          Recibir
                        </Button>
                      ) : null}
                      {compra.estado !== 'BORRADOR' && compra.estado !== 'PAGADA' && compra.estado !== 'CANCELADA' ? (
                        <Button type="button" tamano="sm"
                          data-testid={`pagar-compra-${compra.id}`} onClick={() => abrir('pagar', compra)}>
                          Pagar
                        </Button>
                      ) : null}
                      {puedeGestionar && (compra.estado === 'BORRADOR' || compra.estado === 'CONFIRMADA') ? (
                        <Button type="button" variante="destructivo" tamano="sm"
                          data-testid={`cancelar-compra-${compra.id}`} onClick={() => abrir('cancelar', compra)}>
                          Cancelar
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PanelCompra
        key={`${panel?.modo ?? 'cerrado'}-${panel?.compra?.id ?? 'nueva'}-${sesion}`}
        modo={panel?.modo ?? 'crear'}
        compra={panel?.compra ?? null}
        proveedores={datos.proveedores}
        ordenes={datos.ordenes}
        abierto={panel !== null}
        onCerrar={() => setPanel(null)}
        onActualizada={() => void actualizar()}
      />
    </div>
  );
}
