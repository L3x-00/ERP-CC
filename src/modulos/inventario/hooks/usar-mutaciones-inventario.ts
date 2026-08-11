'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { crearMaterialAccion } from '@/modulos/inventario/acciones/crear-material-accion';
import { registrarEntradaAccion } from '@/modulos/inventario/acciones/registrar-entrada-accion';
import { registrarSalidaAccion } from '@/modulos/inventario/acciones/registrar-salida-accion';
import type {
  CrearMaterialInput,
  EntradaInventarioInput,
  SalidaInventarioInput,
} from '@/modulos/inventario/validaciones/inventario';
import type { RespuestaAccion } from '@/compartido/tipos/indice';

/**
 * Desenvuelve una `RespuestaAccion`: si falló, deja traza en consola del cliente
 * y lanza para que TanStack marque la mutación como error (la UI lee el mensaje
 * genérico ya saneado por la Server Action). En éxito devuelve los datos.
 */
async function ejecutar<T>(
  promesa: Promise<RespuestaAccion<T>>,
  contexto: string,
): Promise<T | undefined> {
  const respuesta = await promesa;
  if (!respuesta.exito) {
    console.error(`[INVENTARIO] ${contexto}:`, respuesta.error);
    throw new Error(respuesta.error);
  }
  return respuesta.datos;
}

// Nombre interno con prefijo `use` para `react-hooks/rules-of-hooks`; se exporta
// con el nombre en español vía alias.
function useMutacionesInventario() {
  const clienteQuery = useQueryClient();

  // Toda mutación de inventario invalida la rama `['inventario', ...]`:
  // materiales (stock/costo cambian) y movimientos (nuevo asiento).
  const invalidarInventario = () =>
    clienteQuery.invalidateQueries({ queryKey: ['inventario'] });

  const crearMaterial = useMutation({
    mutationFn: (datos: CrearMaterialInput) =>
      ejecutar(crearMaterialAccion(datos), 'crear material'),
    onSuccess: invalidarInventario,
  });

  const registrarEntrada = useMutation({
    mutationFn: (datos: EntradaInventarioInput) =>
      ejecutar(registrarEntradaAccion(datos), 'registrar entrada'),
    onSuccess: invalidarInventario,
  });

  const registrarSalida = useMutation({
    mutationFn: (datos: SalidaInventarioInput) =>
      ejecutar(registrarSalidaAccion(datos), 'registrar salida'),
    onSuccess: invalidarInventario,
  });

  return { crearMaterial, registrarEntrada, registrarSalida };
}

export { useMutacionesInventario as usarMutacionesInventario };
