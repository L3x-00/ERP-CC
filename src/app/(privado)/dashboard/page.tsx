import { redirect } from 'next/navigation';
import { OperacionDashboard } from '@/modulos/dashboard/componentes/indice';
import { obtenerMetricasInicioAccion } from '@/modulos/dashboard/acciones/indice';
import type { FiltroPeriodoDashboard } from '@/modulos/dashboard/tipos/indice';

export const dynamic = 'force-dynamic';

function filtroDeHoy(): FiltroPeriodoDashboard {
  const ahora = new Date();
  const inicio = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
  const fin = new Date(inicio);
  fin.setUTCDate(fin.getUTCDate() + 1);
  return { fechaInicio: inicio.toISOString(), fechaFin: fin.toISOString(), periodoTipo: 'hoy' };
}

/** Dashboard RSC: la primera lectura ya cruza la misma acción protegida que usa el cliente. */
export default async function PaginaDashboard() {
  const respuesta = await obtenerMetricasInicioAccion(filtroDeHoy());
  if (!respuesta.exito || !respuesta.datos) {
    return <p role="alert">No se pudo cargar el dashboard. Vuelve a intentarlo.</p>;
  }
  if (respuesta.datos.redireccion) redirect(respuesta.datos.redireccion);
  return <OperacionDashboard datosIniciales={respuesta.datos} />;
}
