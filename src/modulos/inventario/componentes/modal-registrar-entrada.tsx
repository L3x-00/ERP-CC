'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { usarInventarioTienda } from '@/estado/inventario-tienda';
import { usarMutacionesInventario } from '@/modulos/inventario/hooks/usar-mutaciones-inventario';
import { esquemaEntradaInventario } from '@/modulos/inventario/validaciones/inventario';
import type { Material } from '@/modulos/inventario/tipos/inventario';
import { ETIQUETA_UNIDAD_CONTROL } from '@/modulos/inventario/utilidades/indice';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';

// El material sale del contexto (fila seleccionada), no del formulario.
const esquemaFormEntrada = esquemaEntradaInventario.omit({ materialId: true });
type FormEntrada = z.infer<typeof esquemaFormEntrada>;

/**
 * Modal para registrar una entrada de compra del material seleccionado. Pide
 * cantidad en unidades de compra, costo unitario de compra, referencia de
 * factura/proveedor y notas. Envía a la mutación `registrarEntrada`.
 */
export function ModalRegistrarEntrada() {
  const abierto = usarInventarioTienda((e) => e.modalActivo === 'registrar-entrada');
  const material = usarInventarioTienda((e) => e.materialSeleccionado);
  const cerrarModal = usarInventarioTienda((e) => e.cerrarModal);

  return (
    <Dialog open={abierto && material !== null} onOpenChange={(v) => (!v ? cerrarModal() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar entrada</DialogTitle>
          <DialogDescription>{material?.nombre}</DialogDescription>
        </DialogHeader>
        {material && (
          <FormularioEntrada key={material.id} material={material} onExito={cerrarModal} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Cuerpo del formulario de entrada (exportado para pruebas aisladas del Dialog). */
export function FormularioEntrada({
  material,
  onExito,
}: {
  material: Material;
  onExito: () => void;
}) {
  const { registrarEntrada } = usarMutacionesInventario();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormEntrada>({
    resolver: zodResolver(esquemaFormEntrada),
    defaultValues: { cantidadCompra: 1, costoUnitarioCompra: 0, referenciaExterna: '', notas: '' },
  });

  const unidadControl = ETIQUETA_UNIDAD_CONTROL[material.unidadControl];

  async function alEnviar(datos: FormEntrada): Promise<void> {
    try {
      await registrarEntrada.mutateAsync({ materialId: material.id, ...datos });
      onExito();
    } catch {
      // Error ya reflejado en `registrarEntrada.error` + consola.
    }
  }

  return (
    <form onSubmit={handleSubmit(alEnviar)} className="flex flex-col gap-3" noValidate>
      <p className="rounded-base bg-foreground/5 p-2 text-sm text-foreground/70">
        Stock actual: {material.stockActualControl.toLocaleString('es-MX')} {unidadControl} · cada
        unidad de compra ({material.unidadCompra}) equivale a {material.factorConversion}{' '}
        {unidadControl}.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label>Cantidad ({material.unidadCompra})</Label>
          <Input type="number" step="0.0001" min={0} {...register('cantidadCompra', { valueAsNumber: true })} />
          {errors.cantidadCompra && (
            <span className="text-xs text-red-600">{errors.cantidadCompra.message}</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Label>Costo unitario de compra</Label>
          <Input type="number" step="0.01" min={0} {...register('costoUnitarioCompra', { valueAsNumber: true })} />
          {errors.costoUnitarioCompra && (
            <span className="text-xs text-red-600">{errors.costoUnitarioCompra.message}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label>Referencia de factura / proveedor (opcional)</Label>
        <Input {...register('referenciaExterna')} />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Notas (opcional)</Label>
        <Textarea {...register('notas')} />
      </div>

      {registrarEntrada.isError && (
        <p role="alert" className="text-sm text-red-600">
          No se pudo registrar la entrada.
        </p>
      )}

      <DialogFooter>
        <Button type="button" variante="contorno" onClick={onExito}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando…' : 'Registrar entrada'}
        </Button>
      </DialogFooter>
    </form>
  );
}
