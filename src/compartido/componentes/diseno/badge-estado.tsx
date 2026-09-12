'use client';

import { cn } from '@/compartido/utilidades/cn';

type TonoEstado = 'neutro' | 'exito' | 'advertencia' | 'peligro' | 'info';

type DefinicionEstado = {
  tono: TonoEstado;
  etiqueta: string;
  /** Punto pulsante para estados con actividad en tiempo real. */
  ping?: boolean;
};

/**
 * Mapa único de estados del negocio → color semántico + etiqueta legible.
 * Centraliza la consistencia entre módulos (antes cada tabla pintaba a mano).
 */
const ESTADOS: Record<string, DefinicionEstado> = {
  // Órdenes de producción
  borrador: { tono: 'neutro', etiqueta: 'Borrador' },
  programada: { tono: 'info', etiqueta: 'Programada' },
  en_proceso: { tono: 'info', etiqueta: 'En proceso', ping: true },
  pausada: { tono: 'advertencia', etiqueta: 'Pausada' },
  completada: { tono: 'exito', etiqueta: 'Completada' },
  terminada: { tono: 'exito', etiqueta: 'Terminada' },
  lista: { tono: 'exito', etiqueta: 'Lista' },
  entregada: { tono: 'exito', etiqueta: 'Entregada' },
  cancelada: { tono: 'neutro', etiqueta: 'Cancelada' },
  cancelado: { tono: 'neutro', etiqueta: 'Cancelado' },

  // Cobranza / Gastos
  pendiente: { tono: 'advertencia', etiqueta: 'Pendiente' },
  parcial: { tono: 'info', etiqueta: 'Parcial' },
  parcialmente_pagada: { tono: 'info', etiqueta: 'Parcialmente pagada' },
  pagado: { tono: 'exito', etiqueta: 'Pagado' },
  pagada: { tono: 'exito', etiqueta: 'Pagada' },
  aprobado: { tono: 'info', etiqueta: 'Aprobado' },
  vencida: { tono: 'peligro', etiqueta: 'Vencida', ping: true },

  // Planeación
  en_preparacion: { tono: 'info', etiqueta: 'En preparación' },
  en_uso: { tono: 'info', etiqueta: 'En uso', ping: true },
  bloqueada: { tono: 'advertencia', etiqueta: 'Bloqueada' },

  // Clientes / Pipeline
  prospecto: { tono: 'neutro', etiqueta: 'Prospecto' },
  activo: { tono: 'exito', etiqueta: 'Activo' },
  inactivo: { tono: 'neutro', etiqueta: 'Inactivo' },
  contactado: { tono: 'info', etiqueta: 'Contactado' },
  cotizado: { tono: 'info', etiqueta: 'Cotizado' },
  negociacion: { tono: 'advertencia', etiqueta: 'Negociación' },
  ganada: { tono: 'exito', etiqueta: 'Ganada' },
  perdida: { tono: 'peligro', etiqueta: 'Perdida' },

  // Inventario
  ok: { tono: 'exito', etiqueta: 'Stock OK' },
  reorden: { tono: 'advertencia', etiqueta: 'Punto de reorden' },
  critico: { tono: 'peligro', etiqueta: 'Stock crítico' },
  agotado: { tono: 'peligro', etiqueta: 'Agotado' },
};

const TONOS: Record<TonoEstado, string> = {
  neutro: 'bg-superficie-2 text-texto-secundario',
  exito: 'bg-exito-suave text-exito-texto',
  advertencia: 'bg-advertencia-suave text-advertencia-texto',
  peligro: 'bg-peligro-suave text-peligro-texto',
  info: 'bg-info-suave text-info-texto',
};

const PUNTOS: Record<TonoEstado, string> = {
  neutro: 'bg-texto-tenue',
  exito: 'bg-exito',
  advertencia: 'bg-advertencia',
  peligro: 'bg-peligro',
  info: 'bg-info',
};

/** Normaliza el estado recibido (espacios/guiones/mayúsculas) a la clave del mapa. */
function normalizar(estado: string): string {
  return estado.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

type PropsBadgeEstado = {
  estado: string;
  /** Sobrescribe la etiqueta derivada del mapa. */
  etiqueta?: string;
  className?: string;
};

/**
 * Badge de estado único del ERP: fondo semántico suave, punto de color y
 * etiqueta legible. `en_proceso`/`en_uso`/`vencida` usan punto pulsante.
 */
export function BadgeEstado({ estado, etiqueta, className }: PropsBadgeEstado) {
  const definicion = ESTADOS[normalizar(estado)];
  const tono: TonoEstado = definicion?.tono ?? 'neutro';
  const texto = etiqueta ?? definicion?.etiqueta ?? estado;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONOS[tono],
        className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {definicion?.ping ? (
          <span
            className={cn(
              'punto-en-proceso absolute inline-flex h-full w-full rounded-full opacity-75',
              PUNTOS[tono],
            )}
          />
        ) : null}
        <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', PUNTOS[tono])} />
      </span>
      {texto}
    </span>
  );
}
