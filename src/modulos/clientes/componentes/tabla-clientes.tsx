'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { usarClientes } from '@/modulos/clientes/hooks/usar-clientes';
import { CLIENTES_POR_PAGINA } from '@/modulos/clientes/servicios/obtener-clientes';
import { FormularioCliente } from '@/modulos/clientes/componentes/formulario-cliente';
import { FichaCliente } from '@/modulos/clientes/componentes/ficha-cliente';
import { BadgeTier } from '@/modulos/clientes/componentes/badge-tier';
import type { Cliente, EstadoCliente, TierCliente } from '@/modulos/clientes/tipos/indice';
import { CLASE_ESTADO, ETIQUETA_ESTADO } from '@/modulos/clientes/utilidades/indice';
import { formatearMoneda } from '@/compartido/utilidades/formatear';

const CLASE_INPUT =
  'rounded-base border border-foreground/20 bg-background px-3 py-2 text-sm outline-none focus:border-primario focus:ring-2 focus:ring-primario/30';
const CLASE_BOTON_PRIMARIO =
  'rounded-base bg-primario px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50';

/**
 * Tabla principal de clientes: buscador en tiempo real (razón social, nombre
 * comercial o RFC), filtros por estado y tier, orden alfabético y paginación de
 * 25. Abre el formulario de alta/edición (modal) y la ficha 360° (drawer).
 */
export function TablaClientes({ esAdmin }: { esAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<EstadoCliente | ''>('');
  const [tier, setTier] = useState<TierCliente | ''>('');
  const [pagina, setPagina] = useState(1);

  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null);
  const [clienteVer, setClienteVer] = useState<string | null>(null);

  // Debounce del buscador (300 ms) para no consultar en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(textoBusqueda);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [textoBusqueda]);

  const { data, isLoading, isError } = usarClientes({
    ...(estado ? { estado } : {}),
    ...(tier ? { tier } : {}),
    ...(busqueda ? { busqueda } : {}),
    pagina,
  });

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / CLIENTES_POR_PAGINA)) : 1;

  function refrescar(): void {
    void queryClient.invalidateQueries({ queryKey: ['clientes'] });
  }

  function abrirNuevo(): void {
    setClienteEditando(null);
    setFormularioAbierto(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
            placeholder="Buscar por razón social, nombre o RFC…"
            className={`${CLASE_INPUT} w-72`}
          />
          <select
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value as EstadoCliente | '');
              setPagina(1);
            }}
            className={CLASE_INPUT}
          >
            <option value="">Todos los estados</option>
            <option value="prospecto">Prospecto</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
          <select
            value={tier}
            onChange={(e) => {
              setTier(e.target.value as TierCliente | '');
              setPagina(1);
            }}
            className={CLASE_INPUT}
          >
            <option value="">Todos los tiers</option>
            <option value="bronce">Bronce</option>
            <option value="plata">Plata</option>
            <option value="oro">Oro</option>
            <option value="platino">Platino</option>
          </select>
        </div>
        <button onClick={abrirNuevo} className={CLASE_BOTON_PRIMARIO}>
          Nuevo cliente
        </button>
      </div>

      <div className="overflow-x-auto rounded-base border border-foreground/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-foreground/10 bg-foreground/5 text-xs uppercase text-foreground/60">
            <tr>
              <th className="px-3 py-2">Razón social</th>
              <th className="px-3 py-2">Nombre comercial</th>
              <th className="px-3 py-2">RFC</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 text-right">Límite crédito</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/5">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-foreground/60">
                  Cargando…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-red-600">
                  No se pudieron cargar los clientes.
                </td>
              </tr>
            )}
            {!isLoading && data?.registros.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-foreground/60">
                  Sin clientes.
                </td>
              </tr>
            )}
            {data?.registros.map((cliente) => (
              <tr key={cliente.id} className="hover:bg-foreground/5">
                <td className="px-3 py-2 font-medium">
                  <button onClick={() => setClienteVer(cliente.id)} className="text-primario hover:underline">
                    {cliente.razonSocial}
                  </button>
                </td>
                <td className="px-3 py-2">{cliente.nombreComercial}</td>
                <td className="px-3 py-2">{cliente.rfc ?? '—'}</td>
                <td className="px-3 py-2">
                  <BadgeTier cliente={cliente} />
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-base px-2 py-0.5 text-xs font-semibold ${CLASE_ESTADO[cliente.estado]}`}>
                    {ETIQUETA_ESTADO[cliente.estado]}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">{formatearMoneda(cliente.limiteCredito)}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => {
                      setClienteEditando(cliente);
                      setFormularioAbierto(true);
                    }}
                    className="text-sm font-medium text-primario hover:underline"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-foreground/70">
        <span>{data ? `${data.total} cliente(s)` : ''}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={pagina <= 1}
            className="rounded-base border border-foreground/20 px-3 py-1 disabled:opacity-40"
          >
            Anterior
          </button>
          <span>
            Página {pagina} de {totalPaginas}
          </span>
          <button
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            disabled={pagina >= totalPaginas}
            className="rounded-base border border-foreground/20 px-3 py-1 disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      </div>

      {formularioAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setFormularioAbierto(false)}
        >
          <div
            className="my-8 w-full max-w-2xl rounded-base bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-bold">
              {clienteEditando ? 'Editar cliente' : 'Nuevo cliente'}
            </h2>
            <FormularioCliente
              cliente={clienteEditando ?? undefined}
              onExito={() => {
                setFormularioAbierto(false);
                refrescar();
              }}
              onCancelar={() => setFormularioAbierto(false)}
            />
          </div>
        </div>
      )}

      {clienteVer && (
        <FichaCliente clienteId={clienteVer} esAdmin={esAdmin} onCerrar={() => setClienteVer(null)} />
      )}
    </div>
  );
}
