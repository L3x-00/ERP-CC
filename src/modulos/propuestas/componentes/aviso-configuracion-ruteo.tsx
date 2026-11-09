'use client';

import Link from 'next/link';

import type { PendienteConfiguracionRuteo } from '@/modulos/propuestas/utilidades/diagnostico-ruteo';

/**
 * Aclaración cliente 2026-11-09: antes de costear, la pantalla explica qué
 * falta configurar y lleva directo a la pantalla donde se resuelve.
 *
 * Es informativo (no bloquea guardar el ruteo): si el problema impide costear,
 * el error del servidor se muestra además con el mismo enlace.
 */
export function AvisoConfiguracionRuteo({
  pendientes,
}: {
  pendientes: readonly PendienteConfiguracionRuteo[];
}) {
  if (pendientes.length === 0) return null;

  return (
    <div
      role="status"
      data-testid="configuracion-pendiente-ruteo"
      className="flex flex-col gap-2 rounded-lg border border-advertencia/40 bg-advertencia-suave px-3 py-3 text-sm"
    >
      <p className="font-semibold text-advertencia-texto">
        Configuración pendiente para costear correctamente
      </p>
      <p className="text-xs text-advertencia-texto">
        Puedes guardar el ruteo, pero el costo no será confiable hasta resolver estos puntos. Cada
        uno indica dónde se corrige.
      </p>
      <ul className="flex flex-col gap-2">
        {pendientes.map((pendiente) => (
          <li key={pendiente.clave} className="flex flex-col gap-1">
            <span className="font-medium text-texto-primario">{pendiente.titulo}</span>
            <span className="text-xs text-texto-secundario">{pendiente.detalle}</span>
            <Link
              href={pendiente.enlace.href}
              className="w-fit text-xs font-semibold text-acento underline-offset-2 hover:underline"
            >
              {pendiente.enlace.etiqueta} →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
