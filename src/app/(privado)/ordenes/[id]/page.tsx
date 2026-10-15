import { notFound } from 'next/navigation';

import { FichaOrden } from '@/modulos/ordenes/componentes/ficha-orden';
import { obtenerFichaOrdenServicio } from '@/modulos/ordenes/servicios/ficha-orden-servicio';
import { esquemaPestanaFicha } from '@/modulos/ordenes/validaciones/ficha-orden';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

type ParametrosPaginaOrden = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/** Ficha de una orden SII-B5: snapshot, partidas, entregas, actividad y comentarios. */
export default async function PaginaOrden({ params, searchParams }: ParametrosPaginaOrden) {
  const { id } = await params;
  const parametros = searchParams ? await searchParams : {};
  const pestana = esquemaPestanaFicha.safeParse(parametros.pestana);
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'orden_vista'))) notFound();

  const [
    puedeLiberar, puedeCerrar, puedeCancelar, puedeVerTotales, puedeAdjuntar, puedeVerRfq, puedeVerPropuesta,
  ] = await Promise.all([
    can(usuario, 'orden_liberar'),
    can(usuario, 'orden_cerrar_admin'),
    can(usuario, 'orden_cancelar'),
    can(usuario, 'orden_ver_totales'),
    can(usuario, 'aprobar_ordenes'),
    can(usuario, 'rfq_vista'),
    can(usuario, 'propuesta_vista'),
  ]);
  const ficha = await obtenerFichaOrdenServicio(crearClienteSupabaseAdmin(), id, {
    incluirTotales: puedeVerTotales,
  });
  if (!ficha) notFound();

  const permisos = {
    puedeLiberar,
    puedeCerrar,
    puedeCancelar,
    puedeVerTotales,
    puedeAdjuntar,
    puedeEliminarTodos: usuario.rol === 'admin',
    puedeVerRfq,
    puedeVerPropuesta,
  };

  return (
    <FichaOrden
      ficha={ficha}
      permisos={permisos}
      usuarioActualId={usuario.id}
      pestanaInicial={pestana.success ? pestana.data : undefined}
    />
  );
}
