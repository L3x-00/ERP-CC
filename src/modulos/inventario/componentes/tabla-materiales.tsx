'use client';

import { useState } from 'react';
import { usarMateriales } from '@/modulos/inventario/hooks/usar-materiales';
import { MATERIALES_POR_PAGINA } from '@/modulos/inventario/servicios/inventario-servicio';
import { usarInventarioTienda } from '@/estado/inventario-tienda';
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
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';
import { Button } from '@/compartido/componentes/ui/button';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import type { Material } from '@/modulos/inventario/tipos/inventario';
import {
  esStockBajo,
  estadoStock,
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
 * aplican en cliente. Muestra el estado de stock con `BadgeEstado`
 * (`stockActualControl <= stockMinimoControl`) y ofrece acciones por fila.
 */
export function TablaMateriales() {
  const busqueda = usarInventarioTienda((e) => e.busqueda);
  const categoria = usarInventarioTienda((e) => e.categoria);
  const soloAlerta = usarInventarioTienda((e) => e.soloAlerta);
  const orden = usarInventarioTienda((e) => e.orden);
  const abrirModal = usarInventarioTienda((e) => e.abrirModal);
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
  const hayFiltros = busqueda !== '' || categoria !== null || soloAlerta;

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
              : 'Registra tu primer material para empezar a controlar stock y costos.'
          }
          accion={
            hayFiltros ? undefined : (
              <Button tamano="lg" onClick={() => abrirModal('crear-material')}>
                Nuevo material
              </Button>
            )
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
                <TablaEncabezadoCelda className="text-right">Stock actual</TablaEncabezadoCelda>
                <TablaEncabezadoCelda className="text-right">Stock mínimo</TablaEncabezadoCelda>
                <TablaEncabezadoCelda className="text-right">Costo unitario</TablaEncabezadoCelda>
                <TablaEncabezadoCelda className="text-right">Acciones</TablaEncabezadoCelda>
              </tr>
            </TablaEncabezado>
            <TablaCuerpo>
              {materiales.map((material) => {
                const unidad = ETIQUETA_UNIDAD_CONTROL[material.unidadControl];
                const estado = estadoStock(material);
                return (
                  <TablaFila key={material.id}>
                    <TablaCelda className="font-mono text-xs">{material.codigo}</TablaCelda>
                    <TablaCelda className="font-medium">{material.nombre}</TablaCelda>
                    <TablaCelda>{ETIQUETA_CATEGORIA[material.categoria]}</TablaCelda>
                    <TablaCelda className="text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className="tabular-nums">
                          {material.stockActualControl.toLocaleString('es-MX')} {unidad}
                        </span>
                        <BadgeEstado
                          estado={estado}
                          etiqueta={estado === 'reorden' ? 'Reordenar' : undefined}
                        />
                      </span>
                    </TablaCelda>
                    <TablaCelda className="text-right tabular-nums">
                      {material.stockMinimoControl.toLocaleString('es-MX')} {unidad}
                    </TablaCelda>
                    <TablaCelda className="text-right tabular-nums">
                      {formatearMoneda(material.costoUnitarioControl, 'MXN', 4)}
                    </TablaCelda>
                    <TablaCelda>
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
                    </TablaCelda>
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
