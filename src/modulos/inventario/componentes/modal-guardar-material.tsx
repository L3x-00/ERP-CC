'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { formatearMoneda } from '@/compartido/utilidades/formatear';

import { usarMutacionesCostosMateriales } from '../hooks/usar-mutaciones-costos-materiales';
import type { MaterialCosto } from '../tipos/materiales-costos';
import { interpretarDimensionMm } from '../utilidades/materiales-costos';

/** Texto del input de una dimensión opcional: vacío si el material no la tiene. */
function textoDimension(valor: number | null | undefined): string {
  return typeof valor === 'number' ? String(valor) : '';
}

/**
 * Alta/edición de material en «Materiales y costos».
 *
 * Un material representa UNA medida del catálogo: código, nombre, espesor,
 * grupo, unidad y dimensiones. El costo no se captura aquí porque cada
 * espesor es un material independiente y su precio se confirma con «Costo
 * manual» en la tabla (así no se comparten precios entre espesores).
 */
export function ModalGuardarMaterial({
  material,
  materiales,
  onCerrar,
}: {
  material: MaterialCosto | null;
  materiales: readonly MaterialCosto[];
  onCerrar: () => void;
}) {
  const { guardarMaterial } = usarMutacionesCostosMateriales();
  const primerEspesor = material?.espesores[0];
  const [codigo, setCodigo] = useState(material?.codigo ?? '');
  const [nombre, setNombre] = useState(material?.nombre ?? '');
  const [unidadBase, setUnidadBase] = useState(material?.unidadBase ?? '');
  const [anchoMm, setAnchoMm] = useState(textoDimension(material?.anchoMm));
  const [largoMm, setLargoMm] = useState(textoDimension(material?.largoMm));
  const [padreId, setPadreId] = useState(material?.padreId ?? '');
  const [activo, setActivo] = useState(material?.activo ?? true);
  const [orden, setOrden] = useState(String(material?.orden ?? 0));
  const [espesorEtiqueta, setEspesorEtiqueta] = useState(primerEspesor?.etiqueta ?? '');
  const [espesorMm, setEspesorMm] = useState(
    typeof primerEspesor?.espesorMm === 'number' ? String(primerEspesor.espesorMm) : '',
  );
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const materialId = material?.id ?? null;
  const tieneHijos = material
    ? materiales.some((candidato) => candidato.padreId === material.id)
    : false;
  const opcionesGrupo = materiales.filter(
    (candidato) => candidato.padreId === null && candidato.id !== materialId,
  );

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (guardando) return;
    setMensaje(null);
    if (codigo.trim().length < 2) {
      setMensaje('Escribe el código del material');
      return;
    }
    if (nombre.trim().length < 2) {
      setMensaje('Escribe el nombre del material');
      return;
    }
    if (!unidadBase.trim()) {
      setMensaje('Escribe la unidad base (p. ej. m2, kg, pieza)');
      return;
    }
    const ancho = interpretarDimensionMm(anchoMm, 'ancho');
    if ('error' in ancho) {
      setMensaje(ancho.error);
      return;
    }
    const largo = interpretarDimensionMm(largoMm, 'largo');
    if ('error' in largo) {
      setMensaje(largo.error);
      return;
    }
    const etiqueta = espesorEtiqueta.trim();
    const mm = Number(espesorMm);
    if (etiqueta === '' && espesorMm.trim() === '') {
      // Sin espesor: válido para materiales que no se miden por calibre.
    } else if (etiqueta === '' || !(mm > 0)) {
      setMensaje('Completa la etiqueta y los mm del espesor, o deja ambos vacíos');
      return;
    }

    setGuardando(true);
    try {
      await guardarMaterial.mutateAsync({
        ...(materialId ? { id: materialId } : {}),
        codigo: codigo.trim().toUpperCase(),
        nombre: nombre.trim(),
        unidadBase: unidadBase.trim(),
        // null limpia la dimensión guardada; el campo vacío es «sin dato».
        anchoMm: ancho.valor,
        largoMm: largo.valor,
        padreId: padreId || null,
        activo,
        orden: Number(orden) || 0,
        espesores:
          etiqueta === ''
            ? []
            : [
                {
                  ...(primerEspesor?.id ? { id: primerEspesor.id } : {}),
                  etiqueta,
                  espesorMm: mm,
                  activo,
                  orden: 0,
                },
              ],
      });
      onCerrar();
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo guardar el material');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(valor) => (!valor && !guardando ? onCerrar() : undefined)}>
      <DialogContent
        className="max-w-[720px]"
        data-testid="modal-guardar-material"
        aria-label={material ? 'Editar material' : 'Nuevo material'}
      >
        <DialogHeader>
          <DialogTitle>{material ? `Editar material ${material.codigo}` : 'Nuevo material'}</DialogTitle>
          <DialogDescription>
            Cada material es una sola medida del catálogo: código, nombre, espesor, grupo, unidad y
            dimensiones. Para láminas del mismo tipo con distinto calibre, crea un material por
            espesor (por ejemplo, CRS-18 y CRS-16): así cada uno conserva su propio precio.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2" noValidate>
          <div className="flex flex-col gap-1">
            <Label htmlFor="material-catalogo-codigo">Código</Label>
            <Input
              id="material-catalogo-codigo"
              value={codigo}
              onChange={(evento) => setCodigo(evento.target.value.toUpperCase())}
              maxLength={49}
              placeholder="CRS-18"
              required
            />
            <span className="text-xs text-texto-secundario">
              Identificador único. Si cambia el espesor, usa otro código.
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="material-catalogo-nombre">Nombre</Label>
            <Input
              id="material-catalogo-nombre"
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              maxLength={120}
              placeholder="Acero al carbón cal 18"
              required
            />
            <span className="text-xs text-texto-secundario">
              Descripción legible que verá el operador y el cliente.
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="material-catalogo-espesor-etiqueta">Espesor</Label>
            <Input
              id="material-catalogo-espesor-etiqueta"
              value={espesorEtiqueta}
              onChange={(evento) => setEspesorEtiqueta(evento.target.value)}
              maxLength={40}
              placeholder='p. ej. cal 18, 2 mm, 1/8"'
            />
            <span className="text-xs text-texto-secundario">
              Opcional. Etiqueta con la que se reconoce el calibre.
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="material-catalogo-espesor-mm">Espesor en mm</Label>
            <Input
              id="material-catalogo-espesor-mm"
              type="number"
              inputMode="decimal"
              min={0.001}
              step={0.001}
              value={espesorMm}
              onChange={(evento) => setEspesorMm(evento.target.value)}
              placeholder="2"
            />
            <span className="text-xs text-texto-secundario">
              Opcional. Medida real del espesor en milímetros.
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="material-catalogo-grupo">Grupo (opcional)</Label>
            <Select
              id="material-catalogo-grupo"
              value={padreId}
              onChange={(evento) => setPadreId(evento.target.value)}
              disabled={tieneHijos}
            >
              <option value="">Sin grupo</option>
              {opcionesGrupo.map((candidato) => (
                <option key={candidato.id} value={candidato.id}>
                  {candidato.nombre}
                </option>
              ))}
            </Select>
            <span className="text-xs text-texto-secundario">
              {tieneHijos
                ? 'Este material tiene subítems: no puede agruparse en otro.'
                : 'Sirve para agrupar variantes del mismo material. Solo dos niveles.'}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="material-catalogo-unidad">Unidad base</Label>
            <Input
              id="material-catalogo-unidad"
              list="material-catalogo-unidades"
              value={unidadBase}
              onChange={(evento) => setUnidadBase(evento.target.value)}
              maxLength={30}
              placeholder="m2, kg, pieza…"
              required
            />
            <datalist id="material-catalogo-unidades">
              <option value="m2" />
              <option value="ml" />
              <option value="kg" />
              <option value="pieza" />
              <option value="hoja" />
              <option value="barra" />
              <option value="rollo" />
            </datalist>
            <span className="text-xs text-texto-secundario">
              Unidad en la que se compra y consume el material.
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="material-catalogo-ancho">Ancho (mm)</Label>
            <Input
              id="material-catalogo-ancho"
              type="number"
              inputMode="decimal"
              min={0.001}
              max={99999.999}
              step={0.001}
              value={anchoMm}
              onChange={(evento) => setAnchoMm(evento.target.value)}
              placeholder="1220"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="material-catalogo-largo">Largo (mm)</Label>
            <Input
              id="material-catalogo-largo"
              type="number"
              inputMode="decimal"
              min={0.001}
              max={99999.999}
              step={0.001}
              value={largoMm}
              onChange={(evento) => setLargoMm(evento.target.value)}
              placeholder="2440"
            />
          </div>
          <p className="text-xs text-texto-secundario sm:col-span-2">
            Ancho y largo son opcionales (hasta 3 decimales). Déjalos vacíos si el material no se
            vende por medida.
          </p>

          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-acento"
                checked={activo}
                onChange={(evento) => setActivo(evento.target.checked)}
              />
              Activo
            </label>
            <div className="flex flex-col gap-1">
              <Label htmlFor="material-catalogo-orden">Orden</Label>
              <Input
                id="material-catalogo-orden"
                type="number"
                min={0}
                step={1}
                value={orden}
                onChange={(evento) => setOrden(evento.target.value)}
                className="w-24"
              />
            </div>
          </div>

          {material && material.costoVigente !== null && (
            <p className="text-xs text-texto-secundario sm:col-span-2">
              Costo vigente de este material: {formatearMoneda(material.costoVigente, material.monedaCosto, 4)}.
              Para cambiarlo usa «Costo manual» o «Proponer» en la tabla.
            </p>
          )}

          {mensaje !== null && (
            <p role="alert" className="text-sm text-peligro-texto sm:col-span-2">
              {mensaje}
            </p>
          )}

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variante="contorno" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : materialId ? 'Guardar cambios' : 'Crear material'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
