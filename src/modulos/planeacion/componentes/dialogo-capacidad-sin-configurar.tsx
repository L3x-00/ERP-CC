'use client';

import { useState } from 'react';
import Link from 'next/link';

import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';

type PasoGuia = {
  titulo: string;
  detalle: string;
  href?: string;
  etiqueta?: string;
};

/**
 * Aclaración cliente 2026-11-10: cuando la consulta de capacidad responde
 * «sin capacidad configurada», el aviso no basta. La guía explica en lenguaje
 * sencillo qué falta y lleva a las secciones donde se revisa. Guardar equipos y
 * jornada en Planeación registra el turno base cuando el equipo no tiene turnos.
 */
const PASOS: readonly PasoGuia[] = [
  {
    titulo: '1. Revisa el grupo del proceso',
    detalle:
      'En Configuración → Tarifas y costos, confirma que el proceso tenga asignado un grupo de equipo y que sus equipos estén activos.',
    href: '/configuracion?pestana=tarifas',
    etiqueta: 'Abrir Tarifas y costos',
  },
  {
    titulo: '2. Revisa equipos y jornada',
    detalle:
      'En Planeación → Capacidad instalada, confirma cuántos equipos tiene cada recurso y, si aplica, su jornada por equipo. Al guardar, si el equipo no tenía turnos se registra el turno matutino base de 8 h; por defecto se usan 8 h.',
    href: '/planeacion#capacidad-instalada',
    etiqueta: 'Abrir Capacidad instalada',
  },
  {
    titulo: '3. Revisa los turnos del equipo',
    detalle:
      'Si el equipo trabaja más de un turno (matutino, vespertino o nocturno), pide a un administrador que registre los turnos adicionales con sus horas. Un turno sin registrar no aparece en el calendario.',
  },
];

export interface PropsDialogoCapacidadSinConfigurar {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /**
   * Cierra el contenedor que abrió la guía (por ejemplo, el diálogo de
   * reprogramación) al navegar a otra sección de la misma página.
   */
  onNavegar?: () => void;
}

export function DialogoCapacidadSinConfigurar({
  abierto,
  onAbiertoChange,
  onNavegar,
}: PropsDialogoCapacidadSinConfigurar) {
  function navegar(): void {
    onAbiertoChange(false);
    onNavegar?.();
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent data-testid="guia-capacidad" className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Falta configurar la capacidad</DialogTitle>
          <DialogDescription>
            Para comparar la carga con la capacidad, el sistema necesita saber cuántas horas puede
            trabajar cada equipo en cada turno. Sin ese dato no puede calcular la disponibilidad y
            muestra este aviso. No es un error de la propuesta ni de la fecha: es configuración
            pendiente.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
          {PASOS.map((paso) => (
            <li key={paso.titulo} className="flex flex-col gap-1 pl-1">
              <span className="font-medium text-texto-primario">{paso.titulo}</span>
              <span className="text-xs text-texto-secundario">{paso.detalle}</span>
              {paso.href && paso.etiqueta ? (
                <Link
                  href={paso.href}
                  className="w-fit text-xs font-semibold text-acento underline-offset-2 hover:underline"
                  onClick={navegar}
                >
                  {paso.etiqueta} →
                </Link>
              ) : null}
            </li>
          ))}
        </ol>

        <DialogFooter>
          <Button type="button" variante="contorno" onClick={() => onAbiertoChange(false)}>
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Botón de ayuda que abre la guía solo cuando la persona lo pide (decisión del
 * PO: nunca de forma automática). Se coloca junto al aviso de capacidad.
 */
export function BotonGuiaCapacidad({
  etiqueta = '¿Cómo lo configuro?',
  variante = 'contorno',
  tamano = 'sm',
  onNavegar,
}: {
  etiqueta?: string;
  variante?: 'contorno' | 'secundario' | 'fantasma';
  tamano?: 'sm' | 'md' | 'lg' | 'piso';
  onNavegar?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Button
        type="button"
        variante={variante}
        tamano={tamano}
        onClick={() => setAbierto(true)}
        data-testid="abrir-guia-capacidad"
      >
        {etiqueta}
      </Button>
      <DialogoCapacidadSinConfigurar
        abierto={abierto}
        onAbiertoChange={setAbierto}
        onNavegar={onNavegar}
      />
    </>
  );
}
