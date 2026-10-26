import { redirect } from 'next/navigation';
import { OperacionDashboard } from '@/modulos/dashboard/componentes/indice';
import { obtenerMetricasInicioAccion } from '@/modulos/dashboard/acciones/indice';
import type { FiltroPeriodoDashboard } from '@/modulos/dashboard/tipos/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { AvisoTipoCambioDiario } from '@/modulos/configuracion/componentes/indice';
import { obtenerEstadoTipoCambioDiario } from '@/modulos/configuracion/servicios/indice';
import type { EstadoTipoCambioDiario } from '@/modulos/configuracion/utilidades/tipo-cambio-diario';
import { SeccionKpisSii } from '@/modulos/kpis/componentes/seccion-kpis-sii';

export const dynamic = 'force-dynamic';

function filtroDeHoy(): FiltroPeriodoDashboard {
  const ahora = new Date();
  const inicio = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
  const fin = new Date(inicio);
  fin.setUTCDate(fin.getUTCDate() + 1);
  return { fechaInicio: inicio.toISOString(), fechaFin: fin.toISOString(), periodoTipo: 'hoy' };
}

/**
 * ACC-06: solo el administrador confirma el TC del día y solo en la pantalla de
 * inicio. Si la lectura falla, el dashboard sigue operando sin el recordatorio.
 */
async function estadoTipoCambioDelDia(
  rol: string | null | undefined,
): Promise<EstadoTipoCambioDiario | null> {
  if (rol !== 'admin') return null;
  try {
    return await obtenerEstadoTipoCambioDiario();
  } catch (error) {
    console.error('[CONFIGURACION] No se pudo evaluar el tipo de cambio diario:', error);
    return null;
  }
}

/** Dashboard RSC: la primera lectura ya cruza la misma acción protegida que usa el cliente. */
export default async function PaginaDashboard() {
  const [respuesta, usuario] = await Promise.all([
    obtenerMetricasInicioAccion(filtroDeHoy()),
    obtenerUsuarioServidor(),
  ]);
  if (!respuesta.exito || !respuesta.datos) {
    return <p role="alert">No se pudo cargar el dashboard. Vuelve a intentarlo.</p>;
  }
  if (respuesta.datos.redireccion) redirect(respuesta.datos.redireccion);
  const estadoTipoCambio = await estadoTipoCambioDelDia(usuario?.rol);
  return (
    <div className="flex flex-col gap-8">
      {estadoTipoCambio ? <AvisoTipoCambioDiario estado={estadoTipoCambio} /> : null}
      <OperacionDashboard datosIniciales={respuesta.datos} />
      <SeccionKpisSii />
    </div>
  );
}
