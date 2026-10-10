import { notFound } from 'next/navigation';

import { FichaOrden } from '@/modulos/ordenes/componentes/ficha-orden';
import { obtenerFichaOrdenServicio } from '@/modulos/ordenes/servicios/ficha-orden-servicio';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

type ParametrosPaginaOrden = {
  params: Promise<{ id: string }>;
};

/** Ficha de una orden SII-B5: snapshot, partidas, entregas y actividad. */
export default async function PaginaOrden({ params }: ParametrosPaginaOrden) {
  const { id } = await params;
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'orden_vista'))) notFound();

  const [puedeLiberar, puedeCerrar, puedeCancelar, puedeVerFinanzas] = await Promise.all([
    can(usuario, 'orden_liberar'),
    can(usuario, 'orden_cerrar_admin'),
    can(usuario, 'orden_cancelar'),
    can(usuario, 'ver_finanzas'),
  ]);
  const ficha = await obtenerFichaOrdenServicio(crearClienteSupabaseAdmin(), id, {
    incluirFinanzas: puedeVerFinanzas,
  });
  if (!ficha) notFound();

  const permisos = {
    puedeLiberar,
    puedeCerrar,
    puedeCancelar,
    puedeVerFinanzas,
  };

  return <FichaOrden ficha={ficha} permisos={permisos} />;
}
