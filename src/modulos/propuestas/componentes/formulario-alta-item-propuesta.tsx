'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import { agregarItemPropuestaAccion } from '@/modulos/propuestas/acciones/agregar-item-propuesta';
import type { CatalogosPropuesta } from '@/modulos/propuestas/acciones/obtener-catalogos-propuesta';
import type { RevisionPropuesta } from '@/modulos/propuestas/tipos/indice';
import { claveDetallePropuesta } from './claves-consulta';

type BorradorAlta = {
  descripcion: string;
  cantidad: string;
  materialId: string;
  espesorId: string;
  acabado: string;
  notas: string;
  precioUnitario: string;
  esDescuento: boolean;
};

const ALTA_VACIA: BorradorAlta = {
  descripcion: '',
  cantidad: '',
  materialId: '',
  espesorId: '',
  acabado: '',
  notas: '',
  precioUnitario: '',
  esDescuento: false,
};

/** C3.1: captura un ítem propio en una revisión B..Z sin modificar el RFQ. */
export function FormularioAltaItemPropuesta({
  revision,
  catalogos,
  errorCatalogos,
  puedeEditarPrecio,
}: {
  revision: RevisionPropuesta;
  catalogos: CatalogosPropuesta | null;
  errorCatalogos: string | null;
  puedeEditarPrecio: boolean;
}) {
  const queryClient = useQueryClient();
  const [alta, setAlta] = useState<BorradorAlta>(ALTA_VACIA);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const [exitoAlta, setExitoAlta] = useState<string | null>(null);
  const [enviandoAlta, setEnviandoAlta] = useState(false);
  // El `disabled` no bloquea dos submits por teclado antes del siguiente render.
  const altaEnVueloRef = useRef(false);

  const espesoresDelMaterial = (catalogos?.espesores ?? []).filter(
    (espesor) => espesor.materialId === alta.materialId,
  );

  async function agregar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (altaEnVueloRef.current || catalogos === null || errorCatalogos !== null) return;

    if (alta.descripcion.trim() === '' || alta.cantidad.trim() === '') {
      setExitoAlta(null);
      setErrorAlta('Captura la descripción y la cantidad del ítem.');
      return;
    }

    if (alta.materialId !== '' && espesoresDelMaterial.length > 0 && alta.espesorId === '') {
      setExitoAlta(null);
      setErrorAlta('Selecciona un espesor para el material elegido.');
      return;
    }

    const entrada: Record<string, unknown> = {
      revisionId: revision.id,
      descripcion: alta.descripcion,
      cantidad: Number(alta.cantidad),
    };
    if (alta.materialId !== '') entrada.materialId = alta.materialId;
    if (alta.espesorId !== '') entrada.espesorId = alta.espesorId;
    if (alta.acabado.trim() !== '') entrada.acabado = alta.acabado.trim();
    if (alta.notas.trim() !== '') entrada.notas = alta.notas.trim();
    if (puedeEditarPrecio && alta.precioUnitario.trim() !== '') {
      entrada.precioUnitario = Number(alta.precioUnitario);
    }
    if (alta.esDescuento) entrada.esDescuento = true;

    altaEnVueloRef.current = true;
    setEnviandoAlta(true);
    setErrorAlta(null);
    setExitoAlta(null);

    try {
      const respuesta = await agregarItemPropuestaAccion(entrada);
      if (!respuesta.exito) {
        // Se conserva lo capturado para corregir sin volver a teclear.
        setErrorAlta(respuesta.error);
        return;
      }

      const codigo = respuesta.datos?.codigo;
      if (!codigo) {
        setErrorAlta('El servidor no devolvió el código asignado al ítem.');
        return;
      }

      setAlta(ALTA_VACIA);
      await queryClient.invalidateQueries({ queryKey: claveDetallePropuesta(revision.propuestaId) });
      setExitoAlta(`Ítem ${codigo} agregado en la revisión ${revision.letra}.`);
    } catch {
      setErrorAlta('No se pudo agregar el ítem. Intenta nuevamente.');
    } finally {
      altaEnVueloRef.current = false;
      setEnviandoAlta(false);
    }
  }

  return (
    <form
      onSubmit={agregar}
      noValidate
      data-testid="alta-item-propuesta"
      className="flex flex-col gap-3 rounded-lg border border-borde p-3"
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold">Agregar ítem a la revisión {revision.letra}</h3>
        <p className="text-xs text-texto-secundario">
          El código ITxx lo asigna el servidor y no modifica el RFQ de origen.
        </p>
      </div>

      {(catalogos === null || errorCatalogos !== null) && (
        <p
          role={errorCatalogos === null ? 'status' : 'alert'}
          className={
            errorCatalogos === null
              ? 'text-sm text-texto-secundario'
              : 'text-sm text-peligro-texto'
          }
        >
          {errorCatalogos ?? 'Cargando materiales y espesores…'}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium" htmlFor="alta-item-descripcion">
          <span>
            Descripción <span aria-hidden="true">*</span>
          </span>
          <Input
            id="alta-item-descripcion"
            required
            aria-required="true"
            value={alta.descripcion}
            onChange={(evento) => setAlta({ ...alta, descripcion: evento.target.value })}
            maxLength={300}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="alta-item-cantidad">
          <span>
            Cantidad <span aria-hidden="true">*</span>
          </span>
          <Input
            id="alta-item-cantidad"
            type="number"
            required
            aria-required="true"
            min="0.01"
            step="0.01"
            value={alta.cantidad}
            onChange={(evento) => setAlta({ ...alta, cantidad: evento.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="alta-item-material">
          Material
          <Select
            id="alta-item-material"
            value={alta.materialId}
            onChange={(evento) =>
              setAlta({ ...alta, materialId: evento.target.value, espesorId: '' })
            }
          >
            <option value="">Sin material</option>
            {(catalogos?.materiales ?? []).map((material) => (
              <option key={material.id} value={material.id}>
                {material.nombre}
              </option>
            ))}
          </Select>
        </label>
        <div className="grid gap-1 text-sm">
          <label className="font-medium" htmlFor="alta-item-espesor">
            Espesor
          </label>
          <Select
            id="alta-item-espesor"
            value={alta.espesorId}
            disabled={alta.materialId === '' || espesoresDelMaterial.length === 0}
            aria-describedby={
              alta.materialId === '' || espesoresDelMaterial.length === 0
                ? 'alta-item-espesor-ayuda'
                : undefined
            }
            onChange={(evento) => setAlta({ ...alta, espesorId: evento.target.value })}
          >
            <option value="">
              {alta.materialId === ''
                ? 'Selecciona un material primero'
                : espesoresDelMaterial.length === 0
                  ? 'Sin espesores configurados'
                  : 'Selecciona un espesor'}
            </option>
            {espesoresDelMaterial.map((espesor) => (
              <option key={espesor.id} value={espesor.id}>
                {espesor.etiqueta}
              </option>
            ))}
          </Select>
          {(alta.materialId === '' || espesoresDelMaterial.length === 0) && (
            <span id="alta-item-espesor-ayuda" className="text-xs text-texto-secundario">
              {alta.materialId === ''
                ? 'Selecciona un material para ver sus espesores.'
                : 'Este material no tiene espesores configurados.'}
            </span>
          )}
        </div>
        <label className="grid gap-1 text-sm font-medium" htmlFor="alta-item-acabado">
          Acabado (opcional)
          <Input
            id="alta-item-acabado"
            value={alta.acabado}
            onChange={(evento) => setAlta({ ...alta, acabado: evento.target.value })}
            maxLength={120}
          />
        </label>
        {puedeEditarPrecio && (
          <label className="grid gap-1 text-sm font-medium" htmlFor="alta-item-precio">
            Precio unitario (opcional)
            <Input
              id="alta-item-precio"
              type="number"
              min="0"
              step="0.0001"
              value={alta.precioUnitario}
              onChange={(evento) => setAlta({ ...alta, precioUnitario: evento.target.value })}
            />
          </label>
        )}
      </div>

      <label className="grid gap-1 text-sm font-medium" htmlFor="alta-item-notas">
        Notas (opcional)
        <Textarea
          id="alta-item-notas"
          value={alta.notas}
          onChange={(evento) => setAlta({ ...alta, notas: evento.target.value })}
          rows={2}
          maxLength={2000}
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={alta.esDescuento}
          onChange={(evento) => setAlta({ ...alta, esDescuento: evento.target.checked })}
        />
        Es descuento (resta del subtotal)
      </label>

      {errorAlta !== null && (
        <p role="alert" className="text-sm text-peligro-texto">
          {errorAlta}
        </p>
      )}
      {exitoAlta !== null && (
        <p role="status" className="text-sm text-exito-texto">
          {exitoAlta}
        </p>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          tamano="sm"
          disabled={enviandoAlta || catalogos === null || errorCatalogos !== null}
        >
          {enviandoAlta ? 'Agregando…' : 'Agregar ítem'}
        </Button>
      </div>
    </form>
  );
}
