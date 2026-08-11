'use client';

import { useEffect, useState } from 'react';
import { usarInventarioTienda } from '@/estado/inventario-tienda';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { Button } from '@/compartido/componentes/ui/button';
import type { CategoriaMaterial } from '@/modulos/inventario/tipos/inventario';
import { ETIQUETA_CATEGORIA } from '@/modulos/inventario/utilidades/indice';

/**
 * Barra de filtros del catálogo: buscador por código/nombre, filtro por categoría
 * y switch para ver solo materiales en alerta de stock mínimo. Lee/escribe la
 * tienda Zustand de inventario. Incluye el disparador de "Nuevo material".
 */
export function FiltrosInventario() {
  const categoria = usarInventarioTienda((e) => e.categoria);
  const soloAlerta = usarInventarioTienda((e) => e.soloAlerta);
  const setBusqueda = usarInventarioTienda((e) => e.setBusqueda);
  const setCategoria = usarInventarioTienda((e) => e.setCategoria);
  const setSoloAlerta = usarInventarioTienda((e) => e.setSoloAlerta);
  const abrirModal = usarInventarioTienda((e) => e.abrirModal);

  // Buscador con debounce: el texto se mantiene local y se vuelca a la tienda
  // (que dispara la consulta) 300 ms después de la última tecla.
  const [texto, setTexto] = useState('');
  useEffect(() => {
    const temporizador = setTimeout(() => setBusqueda(texto), 300);
    return () => clearTimeout(temporizador);
  }, [texto, setBusqueda]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por código o nombre…"
          className="w-64"
          aria-label="Buscar material"
        />
        <Select
          value={categoria ?? ''}
          onChange={(e) =>
            setCategoria(e.target.value ? (e.target.value as CategoriaMaterial) : null)
          }
          className="w-auto"
          aria-label="Filtrar por categoría"
        >
          <option value="">Todas las categorías</option>
          {(Object.keys(ETIQUETA_CATEGORIA) as CategoriaMaterial[]).map((c) => (
            <option key={c} value={c}>
              {ETIQUETA_CATEGORIA[c]}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={soloAlerta}
            onChange={(e) => setSoloAlerta(e.target.checked)}
          />
          Solo alerta de stock
        </label>
      </div>
      <Button onClick={() => abrirModal('crear-material')}>Nuevo material</Button>
    </div>
  );
}
