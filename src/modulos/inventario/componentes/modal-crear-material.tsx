'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { usarInventarioTienda } from '@/estado/inventario-tienda';
import { usarMutacionesInventario } from '@/modulos/inventario/hooks/usar-mutaciones-inventario';
import {
  esquemaCrearMaterial,
  type CrearMaterialInput,
} from '@/modulos/inventario/validaciones/inventario';
import { ETIQUETA_CATEGORIA } from '@/modulos/inventario/utilidades/indice';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';

const VALORES_INICIALES: CrearMaterialInput = {
  codigo: '',
  nombre: '',
  descripcion: '',
  categoria: 'materia_prima',
  unidadCompra: 'hoja',
  unidadControl: 'm2',
  factorConversion: 1,
  costoUnitarioCompra: 0,
  stockMinimoControl: 0,
  factorMermaPorcentaje: 8,
};

/**
 * Modal de alta de material (Dialog shadcn/ui). El formulario vive en un
 * componente interno montado DENTRO de `DialogContent`: Radix lo desmonta al
 * cerrar, por lo que el estado de React Hook Form se limpia en cada cierre (sin
 * campos sucios ni fugas). Abre/cierra según la tienda Zustand.
 */
export function ModalCrearMaterial() {
  const abierto = usarInventarioTienda((e) => e.modalActivo === 'crear-material');
  const cerrarModal = usarInventarioTienda((e) => e.cerrarModal);

  return (
    <Dialog open={abierto} onOpenChange={(v) => (!v ? cerrarModal() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo material</DialogTitle>
          <DialogDescription>
            El costo por unidad de control se deriva del costo de compra y el factor de conversión.
          </DialogDescription>
        </DialogHeader>
        {abierto && <FormularioCrearMaterial onExito={cerrarModal} />}
      </DialogContent>
    </Dialog>
  );
}

/** Cuerpo del formulario de alta (se remonta en cada apertura → estado limpio). */
function FormularioCrearMaterial({ onExito }: { onExito: () => void }) {
  const { crearMaterial } = usarMutacionesInventario();

  // Sin generic explícito: `esquemaCrearMaterial` tiene `.default()`, por lo que
  // el tipo de ENTRADA (valores del form) difiere del de SALIDA (tras parsear).
  // Se deja inferir del resolver para no chocar input/output.
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(esquemaCrearMaterial),
    defaultValues: VALORES_INICIALES,
  });

  async function alEnviar(datos: CrearMaterialInput): Promise<void> {
    try {
      await crearMaterial.mutateAsync(datos);
      onExito();
    } catch {
      // El error ya quedó en `crearMaterial.error` (mensaje genérico) y en consola.
    }
  }

  return (
    <form onSubmit={handleSubmit(alEnviar)} className="grid gap-3 sm:grid-cols-2" noValidate>
      <Campo etiqueta="Código" error={errors.codigo?.message}>
        <Input {...register('codigo')} />
      </Campo>
      <Campo etiqueta="Nombre" error={errors.nombre?.message}>
        <Input {...register('nombre')} />
      </Campo>

      <Campo etiqueta="Categoría" error={errors.categoria?.message}>
        <Select {...register('categoria')}>
          {(Object.keys(ETIQUETA_CATEGORIA) as CrearMaterialInput['categoria'][]).map((c) => (
            <option key={c} value={c}>
              {ETIQUETA_CATEGORIA[c]}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Descripción (opcional)" error={errors.descripcion?.message}>
        <Input {...register('descripcion')} />
      </Campo>

      <Campo etiqueta="Unidad de compra" error={errors.unidadCompra?.message}>
        <Select {...register('unidadCompra')}>
          <option value="hoja">Hoja</option>
          <option value="barra">Barra</option>
          <option value="rollo">Rollo</option>
          <option value="pieza">Pieza</option>
        </Select>
      </Campo>
      <Campo etiqueta="Unidad de control" error={errors.unidadControl?.message}>
        <Select {...register('unidadControl')}>
          <option value="m2">m²</option>
          <option value="ml">ml</option>
          <option value="pieza">Pieza</option>
          <option value="kg">kg</option>
        </Select>
      </Campo>

      <Campo
        etiqueta="Factor de conversión (control por compra)"
        error={errors.factorConversion?.message}
      >
        <Input type="number" step="0.0001" min={0} {...register('factorConversion', { valueAsNumber: true })} />
      </Campo>
      <Campo etiqueta="Costo unitario de compra" error={errors.costoUnitarioCompra?.message}>
        <Input type="number" step="0.01" min={0} {...register('costoUnitarioCompra', { valueAsNumber: true })} />
      </Campo>

      <Campo etiqueta="Stock mínimo (control)" error={errors.stockMinimoControl?.message}>
        <Input type="number" step="0.0001" min={0} {...register('stockMinimoControl', { valueAsNumber: true })} />
      </Campo>
      <Campo etiqueta="Merma (%)" error={errors.factorMermaPorcentaje?.message}>
        <Input type="number" step="0.01" min={0} max={100} {...register('factorMermaPorcentaje', { valueAsNumber: true })} />
      </Campo>

      {crearMaterial.isError && (
        <p role="alert" className="text-sm text-red-600 sm:col-span-2">
          No se pudo crear el material. Verifica que el código no esté duplicado.
        </p>
      )}

      <DialogFooter className="sm:col-span-2">
        <Button type="button" variante="contorno" onClick={onExito}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando…' : 'Crear material'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Campo({
  etiqueta,
  error,
  children,
}: {
  etiqueta: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{etiqueta}</Label>
      {children}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
