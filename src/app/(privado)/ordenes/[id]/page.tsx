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
  const [ficha, usuario] = await Promise.all([
    obtenerFichaOrdenServicio(crearClienteSupabaseAdmin(), id),
    obtenerUsuarioServidor(),
  ]);
  if (!ficha) notFound();

  const permisos = usuario
    ? {
      puedeLiberar: await can(usuario, 'orden_liberar'),
      puedeCerrar: await can(usuario, 'orden_cerrar_admin'),
      puedeAjustar: await can(usuario, 'orden_editar'),
      puedeAdministrar: await can(usuario, 'aprobar_ordenes'),
    }
    : { puedeLiberar: false, puedeCerrar: false, puedeAjustar: false, puedeAdministrar: false };

  return <FichaOrden ficha={ficha} permisos={permisos} />;
}
