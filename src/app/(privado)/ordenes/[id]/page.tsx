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

  const [puedeLiberar, puedeCerrar, puedeCancelar, puedeVerFinanzas, puedeAdjuntar] = await Promise.all([
    can(usuario, 'orden_liberar'),
    can(usuario, 'orden_cerrar_admin'),
    can(usuario, 'orden_cancelar'),
    can(usuario, 'ver_finanzas'),
    can(usuario, 'aprobar_ordenes'),
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
    puedeAdjuntar,
    puedeEliminarTodos: usuario.rol === 'admin',
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
