import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { HojaTrabajoPiso } from '@/modulos/ordenes/componentes/hoja-trabajo-piso';
import {
  leerHojaTrabajoOrden,
  ordenEstaEnPiso,
} from '@/modulos/ordenes/servicios/hoja-trabajo-lectura-servicio';
import { obtenerAccesoLecturaPiso } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Hoja de trabajo (sin precios) de una orden del piso. Revalida la sesión de piso aunque el proxy ya
 * filtró /produccion-piso, y solo abre órdenes que están en el piso de ese operador: un id ajeno es 404.
 */
export default async function PaginaHojaTrabajoPiso({
  params,
}: {
  params: Promise<{ ordenId: string }>;
}) {
  const { ordenId } = await params;
  const acceso = await obtenerAccesoLecturaPiso();
  if (!acceso) redirect('/operador');
  if (!z.uuid().safeParse(ordenId).success) notFound();

  const admin = crearClienteSupabaseAdmin();
  if (!(await ordenEstaEnPiso(admin, ordenId, acceso.operadorId))) notFound();

  const hoja = await leerHojaTrabajoOrden(admin, ordenId);
  return <HojaTrabajoPiso ordenId={ordenId} hoja={hoja} />;
}
