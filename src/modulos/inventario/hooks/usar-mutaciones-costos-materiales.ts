'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { ajustarSaldoMaterialAccion } from '@/modulos/inventario/acciones/ajustar-saldo-material-accion';
import { confirmarCostoMaterialAccion } from '@/modulos/inventario/acciones/confirmar-costo-material-accion';
import { guardarMaterialCatalogoAccion } from '@/modulos/inventario/acciones/guardar-material-catalogo-accion';
import { proponerCostoMaterialAccion } from '@/modulos/inventario/acciones/proponer-costo-material-accion';
import type {
  AjustarSaldoMaterialInput,
  GuardarMaterialInventarioInput,
} from '@/modulos/inventario/validaciones/materiales-catalogo';
import type {
  ConfirmarCostoMaterialInput,
  ProponerCostoMaterialInput,
} from '@/modulos/inventario/validaciones/materiales-costos';

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
    console.error(`[MATERIALES] ${contexto}:`, respuesta.error);
    throw new Error(respuesta.error);
  }
  return respuesta.datos;
}

// Nombre interno con prefijo `use` para `react-hooks/rules-of-hooks`; se exporta
// con el nombre en español vía alias.
function useMutacionesCostosMateriales() {
  const clienteQuery = useQueryClient();

  // Proponer y confirmar invalidan la rama `['inventario', ...]`: cambian el
  // costo vigente, las propuestas pendientes y el historial.
  const invalidarInventario = () =>
    clienteQuery.invalidateQueries({ queryKey: ['inventario'] });

  const proponerCosto = useMutation({
    mutationFn: (datos: ProponerCostoMaterialInput) =>
      ejecutar(proponerCostoMaterialAccion(datos), 'proponer costo'),
    onSuccess: invalidarInventario,
  });

  const confirmarCosto = useMutation({
    mutationFn: (datos: ConfirmarCostoMaterialInput) =>
      ejecutar(confirmarCostoMaterialAccion(datos), 'confirmar costo'),
    onSuccess: invalidarInventario,
  });

  // Obs. 8: alta/edición de material y ajuste manual de existencia.
  const guardarMaterial = useMutation({
    mutationFn: (datos: GuardarMaterialInventarioInput) =>
      ejecutar(guardarMaterialCatalogoAccion(datos), 'guardar material'),
    onSuccess: invalidarInventario,
  });

  const ajustarSaldo = useMutation({
    mutationFn: (datos: AjustarSaldoMaterialInput) =>
      ejecutar(ajustarSaldoMaterialAccion(datos), 'ajustar saldo'),
    onSuccess: invalidarInventario,
  });

  return { proponerCosto, confirmarCosto, guardarMaterial, ajustarSaldo };
}

export { useMutacionesCostosMateriales as usarMutacionesCostosMateriales };
