'use client';

import { useEffect, useState } from 'react';
import { usarInventarioTienda } from '@/estado/inventario-tienda';
import { Input, Select } from '@/compartido/componentes/ui/input';
import type { CategoriaMaterial } from '@/modulos/inventario/tipos/inventario';
import { ETIQUETA_CATEGORIA } from '@/modulos/inventario/utilidades/indice';

/** Filtros de solo lectura para las existencias conservadas del inventario legado. */
export function FiltrosInventario() {
  const categoria = usarInventarioTienda((e) => e.categoria);
  const setBusqueda = usarInventarioTienda((e) => e.setBusqueda);
  const setCategoria = usarInventarioTienda((e) => e.setCategoria);

  // Buscador con debounce: el texto se mantiene local y se vuelca a la tienda
  // (que dispara la consulta) 300 ms después de la última tecla.
  const [texto, setTexto] = useState('');
  useEffect(() => {
    const temporizador = setTimeout(() => setBusqueda(texto), 300);
    return () => clearTimeout(temporizador);
  }, [texto, setBusqueda]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-texto-primario">
        Buscar material histórico
        <Input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por código o nombre…"
          className="w-full"
          aria-label="Buscar material"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-texto-primario">
        Categoría
        <Select
          value={categoria ?? ''}
          onChange={(e) =>
            setCategoria(e.target.value ? (e.target.value as CategoriaMaterial) : null)
          }
          className="w-full sm:w-auto"
          aria-label="Filtrar por categoría"
        >
          <option value="">Todas las categorías</option>
          {(Object.keys(ETIQUETA_CATEGORIA) as CategoriaMaterial[]).map((c) => (
            <option key={c} value={c}>
              {ETIQUETA_CATEGORIA[c]}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}
