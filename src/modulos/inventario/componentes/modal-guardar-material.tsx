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
import type { MaterialCosto, MonedaCosto } from '../tipos/materiales-costos';

/** Fila editable de espesor dentro del modal (mm como texto para el input). */
type FilaEspesor = {
  clave: string;
  id?: string;
  etiqueta: string;
  espesorMm: string;
  activo: boolean;
  orden: string;
};

function nuevaClave(): string {
  return Math.random().toString(36).slice(2);
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function filaDesdeMaterial(material: MaterialCosto, indice: number): FilaEspesor {
  return {
    clave: nuevaClave(),
    id: material.espesores[indice]?.id,
    etiqueta: material.espesores[indice]?.etiqueta ?? '',
    espesorMm: String(material.espesores[indice]?.espesorMm ?? ''),
    activo: material.espesores[indice]?.activo ?? true,
    orden: String(material.espesores[indice]?.orden ?? 0),
  };
}

/**
 * Obs. cliente 2026-10-13 (8): «Nuevo material» / «Editar» en Materiales y
 * costos —código, nombre, grupo, unidad, espesores y (solo alta) costo inicial
 * vía confirmación—. Mismas tablas y versionado del catálogo; los espesores
 * existentes se desactivan, nunca se borran.
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
  const { guardarMaterial, confirmarCosto } = usarMutacionesCostosMateriales();
  const [codigo, setCodigo] = useState(material?.codigo ?? '');
  const [nombre, setNombre] = useState(material?.nombre ?? '');
  const [unidadBase, setUnidadBase] = useState(material?.unidadBase ?? '');
  const [padreId, setPadreId] = useState(material?.padreId ?? '');
  const [activo, setActivo] = useState(material?.activo ?? true);
  const [orden, setOrden] = useState(String(material?.orden ?? 0));
  const [espesores, setEspesores] = useState<FilaEspesor[]>(
    material ? material.espesores.map((_, indice) => filaDesdeMaterial(material, indice)) : [],
  );
  const [costoInicial, setCostoInicial] = useState('');
  const [moneda, setMoneda] = useState<MonedaCosto>(material?.monedaCosto ?? 'MXN');
  const [fechaEfectiva, setFechaEfectiva] = useState(hoy());
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Alta parcial: si el material quedó guardado y el costo no se confirmó, el
  // reintento actualiza ese mismo material en vez de crear otro.
  const [guardado, setGuardado] = useState<{ id: string; actualizadoEn: string } | null>(null);

  const materialId = material?.id ?? guardado?.id ?? null;
  const tieneHijos = material
    ? materiales.some((candidato) => candidato.padreId === material.id)
    : false;
  const opcionesGrupo = materiales.filter(
    (candidato) => candidato.padreId === null && candidato.id !== materialId,
  );

  function actualizarFila(clave: string, parcial: Partial<FilaEspesor>): void {
    setEspesores((filas) =>
      filas.map((fila) => (fila.clave === clave ? { ...fila, ...parcial } : fila)),
    );
  }

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
    if (espesores.some((fila) => !fila.etiqueta.trim() || !(Number(fila.espesorMm) > 0))) {
      setMensaje('Revisa la etiqueta y los mm de cada espesor');
      return;
    }

    setGuardando(true);
    try {
      const resultado = await guardarMaterial.mutateAsync({
        ...(materialId ? { id: materialId } : {}),
        codigo: codigo.trim().toUpperCase(),
        nombre: nombre.trim(),
        unidadBase: unidadBase.trim(),
        padreId: padreId || null,
        activo,
        orden: Number(orden) || 0,
        espesores: espesores.map((fila) => ({
          ...(fila.id ? { id: fila.id } : {}),
          etiqueta: fila.etiqueta.trim(),
          espesorMm: Number(fila.espesorMm),
          activo: fila.activo,
          orden: Number(fila.orden) || 0,
        })),
      });
      if (!resultado) {
        setMensaje('No se pudo guardar el material');
        return;
      }
      setGuardado(resultado);

      // El costo inicial (solo alta) se confirma con la acción de costos (DC-13)
      // usando el token CAS recién devuelto; un fallo no pierde el material.
      if (!material && costoInicial.trim() !== '') {
        const costoNumero = Number(costoInicial);
        if (!Number.isFinite(costoNumero) || costoNumero < 0) {
          setMensaje(
            'Material guardado; el costo inicial no es válido. Confírmalo desde «Costo manual».',
          );
          return;
        }
        try {
          await confirmarCosto.mutateAsync({
            materialId: resultado.id,
            costo: costoNumero,
            moneda,
            fechaEfectiva,
            fuente: 'MANUAL',
            referencia: null,
            propuestaId: null,
            actualizadoEn: resultado.actualizadoEn,
          });
        } catch (error) {
          setMensaje(
            `Material guardado, pero no se confirmó el costo: ${
              error instanceof Error ? error.message : 'error'
            }. Guarda de nuevo para reintentar.`,
          );
          return;
        }
      }
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
            Código, nombre, grupo y unidad forman el catálogo que consumen RFQ, propuesta y orden.
            Los espesores existentes se desactivan, nunca se eliminan.
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
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="material-catalogo-nombre">Nombre</Label>
            <Input
              id="material-catalogo-nombre"
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              maxLength={120}
              required
            />
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
                : 'Solo dos niveles: un grupo con subítems no se agrupa.'}
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
          </div>
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

          <fieldset className="flex flex-col gap-2 rounded-lg border border-borde p-3 sm:col-span-2">
            <legend className="px-1 text-sm font-semibold">Espesores</legend>
            {espesores.length === 0 && (
              <p className="text-xs text-texto-secundario">
                Sin espesores. Agrega los que apliquen a este material.
              </p>
            )}
            {espesores.map((fila, indice) => (
              <div
                key={fila.clave}
                className="grid items-end gap-2 sm:grid-cols-[1fr_140px_auto_auto]"
              >
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`espesor-etiqueta-${fila.clave}`}>
                    {indice === 0 ? 'Etiqueta' : '\u00A0'}
                  </Label>
                  <Input
                    id={`espesor-etiqueta-${fila.clave}`}
                    value={fila.etiqueta}
                    onChange={(evento) =>
                      actualizarFila(fila.clave, { etiqueta: evento.target.value })
                    }
                    maxLength={40}
                    placeholder='p. ej. 3 mm o 1/8"'
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`espesor-mm-${fila.clave}`}>mm</Label>
                  <Input
                    id={`espesor-mm-${fila.clave}`}
                    type="number"
                    min={0.001}
                    step={0.001}
                    value={fila.espesorMm}
                    onChange={(evento) =>
                      actualizarFila(fila.clave, { espesorMm: evento.target.value })
                    }
                  />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-acento"
                    checked={fila.activo}
                    onChange={(evento) =>
                      actualizarFila(fila.clave, { activo: evento.target.checked })
                    }
                  />
                  Activo
                </label>
                {!fila.id && (
                  <Button
                    type="button"
                    variante="fantasma"
                    tamano="sm"
                    className="mb-1"
                    onClick={() =>
                      setEspesores((filas) => filas.filter((otra) => otra.clave !== fila.clave))
                    }
                  >
                    Quitar
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variante="contorno"
              tamano="sm"
              className="self-start"
              onClick={() =>
                setEspesores((filas) => [
                  ...filas,
                  { clave: nuevaClave(), etiqueta: '', espesorMm: '', activo: true, orden: '0' },
                ])
              }
            >
              Agregar espesor
            </Button>
          </fieldset>

          {!material && (
            <fieldset className="grid gap-3 rounded-lg border border-borde p-3 sm:col-span-2 sm:grid-cols-3">
              <legend className="px-1 text-sm font-semibold">Costo inicial (opcional)</legend>
              <div className="flex flex-col gap-1">
                <Label htmlFor="material-catalogo-costo">Costo</Label>
                <Input
                  id="material-catalogo-costo"
                  type="number"
                  min={0}
                  step={0.01}
                  value={costoInicial}
                  onChange={(evento) => setCostoInicial(evento.target.value)}
                  placeholder="Sin costo"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="material-catalogo-moneda">Moneda</Label>
                <Select
                  id="material-catalogo-moneda"
                  value={moneda}
                  onChange={(evento) => setMoneda(evento.target.value as MonedaCosto)}
                >
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="material-catalogo-fecha">Vigente desde</Label>
                <Input
                  id="material-catalogo-fecha"
                  type="date"
                  value={fechaEfectiva}
                  onChange={(evento) => setFechaEfectiva(evento.target.value)}
                />
              </div>
              <p className="text-xs text-texto-secundario sm:col-span-3">
                El costo se confirma con la acción autorizada de costos (DC-13) al guardar; luego
                puedes proponer compras/gastos o fijarlo manualmente.
              </p>
            </fieldset>
          )}

          {material && material.costoVigente !== null && (
            <p className="text-xs text-texto-secundario sm:col-span-2">
              Costo vigente actual: {formatearMoneda(material.costoVigente, material.monedaCosto, 4)}.
              Para cambiarlo usa «Costo manual» o «Proponer».
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
