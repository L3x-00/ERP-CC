'use client';

import { useState } from 'react';
import { usarMateriales } from '@/modulos/inventario/hooks/usar-materiales';
import { MATERIALES_POR_PAGINA } from '@/modulos/inventario/servicios/inventario-servicio';
import { usarInventarioTienda } from '@/estado/inventario-tienda';
import {
  Tabla,
  TablaCelda,
  TablaContenedor,
  TablaCuerpo,
  TablaEncabezado,
  TablaEncabezadoCelda,
  TablaFila,
} from '@/compartido/componentes/diseno/tabla';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';
import { Button } from '@/compartido/componentes/ui/button';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import type { Material } from '@/modulos/inventario/tipos/inventario';
import {
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

/** Existencias legadas de solo lectura con búsqueda, categoría y paginación. */
export function TablaMateriales() {
  const busqueda = usarInventarioTienda((e) => e.busqueda);
  const categoria = usarInventarioTienda((e) => e.categoria);
  const orden = usarInventarioTienda((e) => e.orden);

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

  // Sin useMemo manual: React Compiler memoiza el orden de la página cargada.
  const registros = data?.registros ?? [];
  const materiales = ordenar(registros, orden);
  const hayFiltros = busqueda !== '' || categoria !== null;

  return (
    <div className="flex flex-col gap-3">
      {isLoading ? (
        <SkeletonTabla filas={6} columnas={7} />
      ) : isError ? (
        <TablaContenedor className="p-6 text-center text-sm text-peligro-texto">
          No se pudieron cargar los materiales.
        </TablaContenedor>
      ) : materiales.length === 0 ? (
        <EstadoVacio
          titulo={hayFiltros ? 'Sin materiales que coincidan' : 'Sin materiales registrados'}
          descripcion={
            hayFiltros
              ? 'Ajusta la búsqueda o los filtros para encontrar el material que buscas.'
              : 'No hay existencias del inventario anterior para consultar.'
          }
        />
      ) : (
        <TablaContenedor>
          <Tabla>
            <TablaEncabezado>
              <tr>
                <TablaEncabezadoCelda>Código</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Nombre</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Categoría</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Unidad</TablaEncabezadoCelda>
                <TablaEncabezadoCelda className="text-right">Existencia histórica</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Última actualización</TablaEncabezadoCelda>
              </tr>
            </TablaEncabezado>
            <TablaCuerpo>
              {materiales.map((material) => {
                const unidad = ETIQUETA_UNIDAD_CONTROL[material.unidadControl];
                return (
                  <TablaFila key={material.id}>
                    <TablaCelda className="font-mono text-xs">{material.codigo}</TablaCelda>
                    <TablaCelda className="font-medium">{material.nombre}</TablaCelda>
                    <TablaCelda>{ETIQUETA_CATEGORIA[material.categoria]}</TablaCelda>
                    <TablaCelda>{unidad}</TablaCelda>
                    <TablaCelda className="text-right tabular-nums">
                      {material.stockActualControl.toLocaleString('es-MX')}
                    </TablaCelda>
                    <TablaCelda>{formatearFecha(material.actualizadoEn)}</TablaCelda>
                  </TablaFila>
                );
              })}
            </TablaCuerpo>
          </Tabla>
        </TablaContenedor>
      )}

      <div className="flex items-center justify-between text-sm text-texto-secundario">
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
