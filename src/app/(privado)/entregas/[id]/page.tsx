import { notFound } from 'next/navigation';

import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { DetalleEntrega } from '@/modulos/entregas/componentes/detalle-entrega';
import {
  obtenerDetalleEntrega,
  obtenerEvidenciasDeNota,
} from '@/modulos/entregas/servicios/obtener-entregas';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SII-B7.3: detalle de una nota de entrega con renglones, evidencia y firma. */
export default async function PaginaDetalleEntrega({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const usuario = await obtenerUsuarioServidor();
  const [puedeGenerar, puedeEvidencia, puedeVerOrden, puedeVerFinanzas, puedeFacturar] = await Promise.all([
    usuario ? can(usuario, 'entrega_generar') : Promise.resolve(false),
    usuario ? can(usuario, 'entrega_evidencia') : Promise.resolve(false),
    usuario ? can(usuario, 'orden_vista') : Promise.resolve(false),
    usuario ? can(usuario, 'ver_finanzas') : Promise.resolve(false),
    usuario ? can(usuario, 'registrar_pagos') : Promise.resolve(false),
  ]);
  if (!puedeGenerar && !puedeEvidencia && !puedeVerOrden && !puedeVerFinanzas) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-borde p-6">
        <h1 className="text-xl font-bold">Entrega</h1>
        <p className="mt-2 text-sm text-texto-secundario">No tienes permiso para ver esta entrega.</p>
      </div>
    );
  }

  const servidor = await crearClienteSupabaseServidor();
  const detalle = await obtenerDetalleEntrega(servidor, id);
  if (!detalle) notFound();
  const evidencias = await obtenerEvidenciasDeNota(servidor, id);

  return (
    <DetalleEntrega
      inicial={{ detalle, evidencias }}
      puedeEvidencia={puedeEvidencia}
      puedeEditar={puedeGenerar}
      puedeFacturar={puedeFacturar}
    />
  );
}
