'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { usarInventarioTienda } from '@/estado/inventario-tienda';
import { usarMutacionesInventario } from '@/modulos/inventario/hooks/usar-mutaciones-inventario';
import { esquemaSalidaInventario } from '@/modulos/inventario/validaciones/inventario';
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

const esquemaFormSalida = esquemaSalidaInventario.omit({ materialId: true });
type FormSalida = z.infer<typeof esquemaFormSalida>;

/**
 * Modal para registrar una salida a producción/ajuste del material seleccionado.
 * Muestra el stock disponible y BLOQUEA la confirmación si la cantidad supera el
 * stock (regla de no stock negativo; el servidor la reimpone atómicamente).
 */
export function ModalRegistrarSalida() {
  const abierto = usarInventarioTienda((e) => e.modalActivo === 'registrar-salida');
  const material = usarInventarioTienda((e) => e.materialSeleccionado);
  const cerrarModal = usarInventarioTienda((e) => e.cerrarModal);

  return (
    <Dialog open={abierto && material !== null} onOpenChange={(v) => (!v ? cerrarModal() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar salida</DialogTitle>
          <DialogDescription>{material?.nombre}</DialogDescription>
        </DialogHeader>
        {material && (
          <FormularioSalida key={material.id} material={material} onExito={cerrarModal} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Cuerpo del formulario de salida (exportado para pruebas aisladas del Dialog). */
export function FormularioSalida({
  material,
  onExito,
}: {
  material: Material;
  onExito: () => void;
}) {
  const { registrarSalida } = usarMutacionesInventario();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormSalida>({
    resolver: zodResolver(esquemaFormSalida),
    defaultValues: { cantidadControl: 0, ordenId: undefined, notas: '' },
  });

  // Se refleja la cantidad en estado local (vía el onChange de `register`) en vez
  // de `watch()`: RHF `watch` es incompatible con el React Compiler.
  const [cantidad, setCantidad] = useState(0);
  const unidad = ETIQUETA_UNIDAD_CONTROL[material.unidadControl];
  // Bloqueo de stock negativo en el cliente (el servidor lo reimpone bajo lock).
  const excedeStock = Number.isFinite(cantidad) && cantidad > material.stockActualControl;

  async function alEnviar(datos: FormSalida): Promise<void> {
    if (excedeStock) return; // Guardia extra: nunca enviar si excede.
    try {
      await registrarSalida.mutateAsync({ materialId: material.id, ...datos });
      onExito();
    } catch {
      // Error ya reflejado en `registrarSalida.error` + consola.
    }
  }

  return (
    <form onSubmit={handleSubmit(alEnviar)} className="flex flex-col gap-3" noValidate>
      <p className="rounded-base bg-foreground/5 p-2 text-sm text-foreground/70">
        Stock disponible:{' '}
        <span className="font-semibold text-foreground">
          {material.stockActualControl.toLocaleString('es-MX')} {unidad}
        </span>
      </p>

      <div className="flex flex-col gap-1">
        <Label>Cantidad a retirar ({unidad})</Label>
        <Input
          type="number"
          step="0.0001"
          min={0}
          aria-invalid={excedeStock}
          {...register('cantidadControl', {
            valueAsNumber: true,
            onChange: (e) => setCantidad(Number(e.target.value)),
          })}
        />
        {errors.cantidadControl && (
          <span className="text-xs text-red-600">{errors.cantidadControl.message}</span>
        )}
        {excedeStock && (
          <span role="alert" className="text-xs font-medium text-red-600">
            La cantidad supera el stock disponible ({material.stockActualControl.toLocaleString('es-MX')} {unidad}).
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Label>Notas (opcional)</Label>
        <Textarea {...register('notas')} />
      </div>

      {registrarSalida.isError && (
        <p role="alert" className="text-sm text-red-600">
          No se pudo registrar la salida.
        </p>
      )}

      <DialogFooter>
        <Button type="button" variante="contorno" onClick={onExito}>
          Cancelar
        </Button>
        <Button type="submit" variante="destructivo" disabled={isSubmitting || excedeStock}>
          {isSubmitting ? 'Guardando…' : 'Registrar salida'}
        </Button>
      </DialogFooter>
    </form>
  );
}
