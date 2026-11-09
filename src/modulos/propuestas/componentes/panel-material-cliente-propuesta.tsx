'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';

import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { SeccionDesplegable } from '@/compartido/componentes/ui/seccion-desplegable';
import { formatearNumero } from '@/compartido/utilidades/formatear';
import type { PropuestaItem, RevisionPropuesta } from '@/modulos/propuestas/tipos/indice';
import {
  obtenerMaterialClienteRevisionAccion,
  reemplazarMaterialClienteAccion,
} from '@/modulos/produccion/acciones/material-cliente';
import type { MaterialClienteItem } from '@/modulos/produccion/tipos/indice';

/**
 * C13.3: material que aporta el cliente por ítem. Se declara en Ruteo/Costeo,
 * se congela en la propuesta aceptada y Producción descuenta el saldo real sin
 * costearlo ni tocar inventario propio.
 */
export function PanelMaterialClientePropuesta({
  revision,
  items,
  materiales,
  puedeEditar,
}: {
  revision: RevisionPropuesta;
  items: PropuestaItem[];
  materiales: { id: string; codigo: string; nombre: string }[];
  puedeEditar: boolean;
}) {
  const [declaraciones, setDeclaraciones] = useState<MaterialClienteItem[]>([]);
  const [codigoItem, setCodigoItem] = useState(items[0]?.codigo ?? '');
  const [materialId, setMaterialId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [cargando, setCargando] = useState(false);
  const [cargado, setCargado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const respuesta = await obtenerMaterialClienteRevisionAccion({ revisionId: revision.id });
    setCargando(false);
    if (!respuesta.exito) {
      setMensaje({ tipo: 'error', texto: respuesta.error });
      return;
    }
    setDeclaraciones(respuesta.datos ?? []);
  }, [revision.id]);

  /**
   * La sección arranca cerrada y carga al abrirse: así la propuesta no dispara
   * una consulta por cada render y las pruebas de UI no dependen de sesión.
   */
  function alternar(valor: boolean): void {
    setAbierto(valor);
    if (valor && !cargado) {
      setCargado(true);
      void cargar();
    }
  }

  async function guardar(siguientes: { materialId: string; cantidad: number }[]): Promise<void> {
    setGuardando(true);
    setMensaje(null);
    try {
      const respuesta = await reemplazarMaterialClienteAccion({
        revisionId: revision.id,
        codigoItem,
        materiales: siguientes,
      });
      if (!respuesta.exito) {
        setMensaje({ tipo: 'error', texto: respuesta.error });
        return;
      }
      await cargar();
      setMaterialId('');
      setCantidad('');
      setMensaje({ tipo: 'ok', texto: 'Material del cliente guardado.' });
    } finally {
      setGuardando(false);
    }
  }

  const delItem = declaraciones.filter((declaracion) => declaracion.codigoItem === codigoItem);
  const materialElegido = materiales.find((material) => material.id === materialId) ?? null;

  function agregar(): void {
    const valor = Number(cantidad);
    if (!materialId || !Number.isFinite(valor) || valor <= 0) {
      setMensaje({ tipo: 'error', texto: 'Elige un material e indica una cantidad mayor a cero.' });
      return;
    }
    const siguientes = delItem
      .filter((declaracion) => declaracion.materialId !== materialId)
      .map((declaracion) => ({ materialId: declaracion.materialId, cantidad: declaracion.cantidad }));
    siguientes.push({ materialId, cantidad: valor });
    void guardar(siguientes);
  }

  function quitar(materialQuitar: string): void {
    void guardar(
      delItem
        .filter((declaracion) => declaracion.materialId !== materialQuitar)
        .map((declaracion) => ({ materialId: declaracion.materialId, cantidad: declaracion.cantidad })),
    );
  }

  return (
    <SeccionDesplegable
      titulo="Material del cliente"
      descripcion="Material que aporta el cliente para este ítem. No se costea ni descuenta inventario propio."
      abierto={abierto}
      onAbiertoChange={alternar}
      dataTestId="panel-material-cliente-propuesta"
    >
      {items.length === 0 ? (
        <p className="text-sm text-texto-secundario">Agrega ítems a la revisión para declarar material.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-texto-secundario">
            Ítem
            <Select
              value={codigoItem}
              onChange={(evento) => setCodigoItem(evento.target.value)}
              data-testid="material-cliente-item"
            >
              {items.map((item) => (
                <option key={item.id} value={item.codigo}>
                  {item.codigo} · {item.descripcion}
                </option>
              ))}
            </Select>
          </label>

          {cargando ? (
            <p className="text-sm text-texto-secundario" role="status">Cargando material del cliente…</p>
          ) : delItem.length === 0 ? (
            <p className="text-sm text-texto-secundario">
              Este ítem no tiene material del cliente declarado.
            </p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="lista-material-cliente">
              {delItem.map((declaracion) => (
                <li
                  key={declaracion.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-borde p-2 text-sm"
                >
                  <span>
                    <strong>{declaracion.materialCodigo}</strong> · {declaracion.materialNombre}
                    {' · '}{formatearNumero(declaracion.cantidad, 3)} {declaracion.unidadBase}
                  </span>
                  {puedeEditar ? (
                    <Button
                      type="button"
                      variante="contorno"
                      tamano="sm"
                      disabled={guardando}
                      onClick={() => quitar(declaracion.materialId)}
                    >
                      Quitar
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {puedeEditar && materiales.length === 0 ? (
            <div
              role="status"
              data-testid="material-cliente-sin-catalogo"
              className="flex flex-col gap-1 rounded-lg border border-advertencia/40 bg-advertencia-suave px-3 py-2 text-sm text-advertencia-texto"
            >
              <p className="font-medium">No hay materiales activos en el catálogo.</p>
              <p className="text-xs">
                Para declarar el material que aporta el cliente, primero crea o activa un material.
                Después vuelve aquí y elígelo en la lista.
              </p>
              <Link
                href="/inventario"
                className="w-fit text-xs font-semibold text-acento underline-offset-2 hover:underline"
              >
                Abrir Materiales y costos →
              </Link>
            </div>
          ) : null}

          {puedeEditar && materiales.length > 0 ? (
            <div className="grid gap-2 rounded-lg border border-borde p-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
              <label className="flex flex-col gap-1 text-sm text-texto-secundario">
                Material
                <Select
                  value={materialId}
                  onChange={(evento) => setMaterialId(evento.target.value)}
                  data-testid="material-cliente-material"
                >
                  <option value="">Selecciona un material</option>
                  {materiales.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.codigo} — {material.nombre}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-texto-secundario">
                Cantidad {materialElegido ? '(unidad del material)' : ''}
                <Input
                  type="number"
                  min="0.0001"
                  step="any"
                  value={cantidad}
                  onChange={(evento) => setCantidad(evento.target.value)}
                  data-testid="material-cliente-cantidad"
                />
              </label>
              <Button type="button" disabled={guardando} onClick={agregar} data-testid="material-cliente-agregar">
                {guardando ? 'Guardando…' : 'Agregar'}
              </Button>
            </div>
          ) : null}

          {mensaje ? (
            <p
              role={mensaje.tipo === 'error' ? 'alert' : 'status'}
              className={mensaje.tipo === 'error' ? 'text-sm text-peligro-texto' : 'text-sm text-exito-texto'}
            >
              {mensaje.texto}
            </p>
          ) : null}
        </div>
      )}
    </SeccionDesplegable>
  );
}
