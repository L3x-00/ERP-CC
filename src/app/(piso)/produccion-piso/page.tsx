import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { IndicadorSesion } from '@/modulos/autenticacion/componentes/indicador-sesion';
import { COOKIE_SESION_OPERADOR } from '@/nucleo/autenticacion/constantes';
import {
  deserializarSesionOperador,
  sesionOperadorExpirada,
} from '@/nucleo/autenticacion/sesion';

/**
 * Página de producción en piso (Kanban) — placeholder de Fase 1.
 * Server Component: segunda guardia de autenticación además del middleware —
 * vuelve a leer y verificar la cookie de sesión de operador; si es
 * inexistente, corrupta o expiró por inactividad, redirige a `/operador`.
 * El Kanban real (5 columnas, registro de trabajo) se implementa en Fase 4.
 */
export default async function PaginaProduccionPiso() {
  const almacenCookies = await cookies();
  const valorCookie = almacenCookies.get(COOKIE_SESION_OPERADOR)?.value;
  const sesion = valorCookie ? await deserializarSesionOperador(valorCookie) : null;

  if (!sesion || sesionOperadorExpirada(sesion)) {
    redirect('/operador');
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <IndicadorSesion nombreUsuario={sesion.nombreUsuario} esOperador />
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-400">
        Kanban de producción (Fase 4)
      </div>
    </div>
  );
}
