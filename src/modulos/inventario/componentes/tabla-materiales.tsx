'use client';

import { useState } from 'react';
import { usarMateriales } from '@/modulos/inventario/hooks/usar-materiales';
import { MATERIALES_POR_PAGINA } from '@/modulos/inventario/servicios/inventario-servicio';
import { usarInventarioTienda } from '@/estado/inventario-tienda';
import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import type { Material } from '@/modulos/inventario/tipos/inventario';
import {
  esStockBajo,
  ETIQUETA_CATEGORIA,
  ETIQUETA_UNIDAD_CONTROL,
} from '@/modulos/inventario/utilidades/indice';

function ordenar(materiales: Material[], orden: 'nombre' | 'codigo' | 'stock'): Material[] {
  const copia = [...materiales];
  if (orden === 'stock') {
    return copia.sort((a, b) => a.stockActualControl - b.stockActualControl);
  }
  return copia.sort((a, b) => a[orden].localeCompare(b[orden], 'es'));
}

/**
 * Catálogo de materiales. Consume `usarMateriales()` con los filtros de la tienda
 * (búsqueda/categoría van al servidor); el switch "solo alerta" y el orden se
 * aplican en cliente. Marca con badge de alerta los materiales en reorden
 * (`stockActualControl <= stockMinimoControl`) y ofrece acciones por fila.
 */
export function TablaMateriales() {
  const busqueda = usarInventarioTienda((e) => e.busqueda);
  const categoria = usarInventarioTienda((e) => e.categoria);
  const soloAlerta = usarInventarioTienda((e) => e.soloAlerta);
  const orden = usarInventarioTienda((e) => e.orden);
  const abrirModalMaterial = usarInventarioTienda((e) => e.abrirModalMaterial);

  const [pagina, setPagina] = useState(1);
  // Al cambiar los filtros (búsqueda/categoría), volver a la primera página.
  // Patrón de ajuste en render (no en efecto): evita `set-state-in-effect` y el
  // render extra con datos obsoletos.
  const claveFiltros = `${busqueda}|${categoria ?? ''}`;
  const [filtrosPrevios, setFiltrosPrevios] = useState(claveFiltros);
  if (claveFiltros !== filtrosPrevios) {
    setFiltrosPrevios(claveFiltros);
    setPagina(1);
  }

  const { data, isLoading, isError } = usarMateriales({
    ...(categoria ? { categoria } : {}),
    ...(busqueda ? { busqueda } : {}),
    pagina,
  });

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / MATERIALES_POR_PAGINA)) : 1;

  // Sin useMemo manual: el React Compiler memoiza automáticamente y la regla
  // preserve-manual-memoization rechaza el useMemo aquí. El switch "solo alerta"
  // y el orden se aplican sobre la página cargada (25 registros).
  const registros = data?.registros ?? [];
  const filtrados = soloAlerta ? registros.filter(esStockBajo) : registros;
  const materiales = ordenar(filtrados, orden);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-base border border-foreground/10">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-foreground/10 bg-foreground/5 text-xs uppercase text-foreground/60">
          <tr>
            <th className="px-3 py-2">Código</th>
            <th className="px-3 py-2">Nombre</th>
            <th className="px-3 py-2">Categoría</th>
            <th className="px-3 py-2 text-right">Stock actual</th>
            <th className="px-3 py-2 text-right">Stock mínimo</th>
            <th className="px-3 py-2 text-right">Costo unitario</th>
            <th className="px-3 py-2 text-right">Acciones</th>
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
                No se pudieron cargar los materiales.
              </td>
            </tr>
          )}
          {!isLoading && !isError && materiales.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-foreground/60">
                Sin materiales.
              </td>
            </tr>
          )}
          {materiales.map((material) => {
            const unidad = ETIQUETA_UNIDAD_CONTROL[material.unidadControl];
            const bajo = esStockBajo(material);
            return (
              <tr key={material.id} className="hover:bg-foreground/5">
                <td className="px-3 py-2 font-mono text-xs">{material.codigo}</td>
                <td className="px-3 py-2 font-medium">{material.nombre}</td>
                <td className="px-3 py-2">{ETIQUETA_CATEGORIA[material.categoria]}</td>
                <td className="px-3 py-2 text-right">
                  <span className="inline-flex items-center gap-2">
                    {material.stockActualControl.toLocaleString('es-MX')} {unidad}
                    {bajo && <Badge variante="alerta">Reordenar</Badge>}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {material.stockMinimoControl.toLocaleString('es-MX')} {unidad}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatearMoneda(material.costoUnitarioControl)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button
                      tamano="sm"
                      variante="contorno"
                      onClick={() => abrirModalMaterial('registrar-entrada', material)}
                    >
                      Entrada
                    </Button>
                    <Button
                      tamano="sm"
                      variante="contorno"
                      onClick={() => abrirModalMaterial('registrar-salida', material)}
                    >
                      Salida
                    </Button>
                    <Button
                      tamano="sm"
                      variante="fantasma"
                      disabled
                      title="Edición de material disponible en una fase posterior"
                    >
                      Editar
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      <div className="flex items-center justify-between text-sm text-foreground/70">
        <span>{data ? `${data.total} material(es)` : ''}</span>
        <div className="flex items-center gap-2">
          <Button
            tamano="sm"
            variante="contorno"
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={pagina <= 1}
          >
            Anterior
          </Button>
          <span>
            Página {pagina} de {totalPaginas}
          </span>
          <Button
            tamano="sm"
            variante="contorno"
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            disabled={pagina >= totalPaginas}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
