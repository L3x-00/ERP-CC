'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { usarClientes } from '@/modulos/clientes/hooks/usar-clientes';
import { CLIENTES_POR_PAGINA } from '@/modulos/clientes/servicios/obtener-clientes';
import { FormularioCliente } from '@/modulos/clientes/componentes/formulario-cliente';
import { FichaCliente } from '@/modulos/clientes/componentes/ficha-cliente';
import { BadgeTier } from '@/modulos/clientes/componentes/badge-tier';
import type {
  Cliente,
  CondicionesPagoCliente,
  EstadoCliente,
  TierCliente,
} from '@/modulos/clientes/tipos/indice';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { AvatarIniciales } from '@/compartido/componentes/diseno/avatar';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import {
  Tabla,
  TablaCelda,
  TablaContenedor,
  TablaCuerpo,
  TablaEncabezado,
  TablaEncabezadoCelda,
  TablaFila,
} from '@/compartido/componentes/diseno/tabla';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';

/** Etiquetas del filtro de condiciones de pago (mismo enum que el formulario). */
const ETIQUETA_CONDICIONES_PAGO: Record<CondicionesPagoCliente, string> = {
  contado: 'Contado',
  '15_dias': '15 días',
  '30_dias': '30 días',
  credito: 'Crédito',
};

/**
 * Tabla principal de clientes: buscador en tiempo real (razón social, nombre
 * comercial o RFC), filtros por estado, tier y condiciones de pago, orden
 * alfabético y paginación de 25. Todos los filtros se resuelven en el servidor,
 * así que el total mostrado es el real del filtro, no el de la página. Abre el
 * formulario de alta/edición (modal) y la ficha 360° (drawer).
 */
export function TablaClientes({ esAdmin, usuarioActualId }: { esAdmin: boolean; usuarioActualId?: string }) {
  const queryClient = useQueryClient();
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<EstadoCliente | ''>('');
  const [tier, setTier] = useState<TierCliente | ''>('');
  const [condicionesPago, setCondicionesPago] = useState<CondicionesPagoCliente | ''>('');
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
    ...(condicionesPago ? { condicionesPago } : {}),
    ...(busqueda ? { busqueda } : {}),
    pagina,
  });

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / CLIENTES_POR_PAGINA)) : 1;
  const sinRegistros = !isLoading && !isError && data?.registros.length === 0;
  const hayFiltros = Boolean(textoBusqueda || busqueda || estado || tier || condicionesPago);

  /** Deja el listado como al entrar: sin filtros, sin búsqueda y en la página 1. */
  function limpiarFiltros(): void {
    setTextoBusqueda('');
    setBusqueda('');
    setEstado('');
    setTier('');
    setCondicionesPago('');
    setPagina(1);
  }

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
          <Input
            type="search"
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
            placeholder="Buscar por razón social, nombre o RFC…"
            aria-label="Buscar clientes"
            className="w-72"
          />
          <Select
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value as EstadoCliente | '');
              setPagina(1);
            }}
            aria-label="Filtrar por estado"
            className="w-auto"
          >
            <option value="">Todos los estados</option>
            <option value="prospecto">Prospecto</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </Select>
          <Select
            value={tier}
            onChange={(e) => {
              setTier(e.target.value as TierCliente | '');
              setPagina(1);
            }}
            aria-label="Filtrar por tier"
            className="w-auto"
          >
            <option value="">Todos los tiers</option>
            <option value="bronce">Bronce</option>
            <option value="plata">Plata</option>
            <option value="oro">Oro</option>
            <option value="platino">Platino</option>
          </Select>
          <Select
            value={condicionesPago}
            onChange={(e) => {
              setCondicionesPago(e.target.value as CondicionesPagoCliente | '');
              setPagina(1);
            }}
            aria-label="Filtrar por condiciones de pago"
            className="w-auto"
          >
            <option value="">Todas las condiciones</option>
            {(Object.keys(ETIQUETA_CONDICIONES_PAGO) as CondicionesPagoCliente[]).map(
              (condicion) => (
                <option key={condicion} value={condicion}>
                  {ETIQUETA_CONDICIONES_PAGO[condicion]}
                </option>
              ),
            )}
          </Select>
          <Button
            variante="fantasma"
            tamano="sm"
            onClick={limpiarFiltros}
            disabled={!hayFiltros}
            aria-label="Limpiar filtros y búsqueda"
          >
            Limpiar
          </Button>
        </div>
        <Button onClick={abrirNuevo}>Nuevo cliente</Button>
      </div>

      {isLoading && <SkeletonTabla columnas={7} filas={6} />}

      {isError && (
        <p
          role="alert"
          className="rounded-lg border border-peligro/30 bg-peligro-suave px-4 py-3 text-sm text-peligro-texto"
        >
          No se pudieron cargar los clientes.
        </p>
      )}

      {sinRegistros && (
        <EstadoVacio
          titulo="Sin clientes"
          descripcion="No hay clientes que coincidan con la búsqueda o los filtros actuales."
        />
      )}

      {!isLoading && !isError && data && data.registros.length > 0 && (
        <TablaContenedor>
          <Tabla>
            <TablaEncabezado>
              <tr>
                <TablaEncabezadoCelda>Razón social</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Nombre comercial</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>RFC</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Tier</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Estado</TablaEncabezadoCelda>
                <TablaEncabezadoCelda className="text-right">Límite crédito</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>
                  <span className="sr-only">Acciones</span>
                </TablaEncabezadoCelda>
              </tr>
            </TablaEncabezado>
            <TablaCuerpo>
              {data.registros.map((cliente) => (
                <TablaFila key={cliente.id}>
                  <TablaCelda className="font-medium">
                    <button
                      onClick={() => setClienteVer(cliente.id)}
                      className="text-acento hover:underline"
                    >
                      {cliente.razonSocial}
                    </button>
                  </TablaCelda>
                  <TablaCelda>
                    <span className="flex items-center gap-2">
                      <AvatarIniciales nombre={cliente.nombreComercial} tamano="sm" />
                      {cliente.nombreComercial}
                    </span>
                  </TablaCelda>
                  <TablaCelda>{cliente.rfc ?? '—'}</TablaCelda>
                  <TablaCelda>
                    <BadgeTier cliente={cliente} />
                  </TablaCelda>
                  <TablaCelda>
                    <BadgeEstado estado={cliente.estado} />
                  </TablaCelda>
                  <TablaCelda className="text-right tabular-nums">
                    {formatearMoneda(cliente.limiteCredito)}
                  </TablaCelda>
                  <TablaCelda className="text-right">
                    <Button
                      variante="fantasma"
                      tamano="sm"
                      onClick={() => {
                        setClienteEditando(cliente);
                        setFormularioAbierto(true);
                      }}
                    >
                      Editar
                    </Button>
                  </TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        </TablaContenedor>
      )}

      <div className="flex items-center justify-between text-sm text-texto-secundario">
        <span>{data ? `${data.total} cliente(s)` : ''}</span>
        <div className="flex items-center gap-2">
          <Button
            variante="contorno"
            tamano="sm"
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={pagina <= 1}
          >
            Anterior
          </Button>
          <span>
            Página {pagina} de {totalPaginas}
          </span>
          <Button
            variante="contorno"
            tamano="sm"
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            disabled={pagina >= totalPaginas}
          >
            Siguiente
          </Button>
        </div>
      </div>

      {formularioAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setFormularioAbierto(false)}
        >
          <div
            className="my-8 w-full max-w-2xl rounded-lg border border-borde bg-superficie p-6 shadow-lg"
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
        <FichaCliente
          clienteId={clienteVer}
          esAdmin={esAdmin}
          usuarioActualId={usuarioActualId}
          onCerrar={() => setClienteVer(null)}
        />
      )}
    </div>
  );
}
