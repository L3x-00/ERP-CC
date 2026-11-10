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
import {
  PASOS_GENERALES_CAPACIDAD,
  type PasoGuiaCapacidad,
} from '@/modulos/planeacion/utilidades/diagnostico-capacidad';

/**
 * Aclaración cliente 2026-11-10: cuando la consulta de capacidad responde
 * «sin capacidad configurada», el aviso no basta. La guía muestra **solo los
 * pendientes detectados** (proceso sin grupo, grupo sin equipos activos, equipos
 * sin turnos, turno sin capacidad) con el nombre exacto; si la pantalla no puede
 * determinar la causa, cae en los pasos generales.
 */
export interface PropsDialogoCapacidadSinConfigurar {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /**
   * Cierra el contenedor que abrió la guía (por ejemplo, el diálogo de
   * reprogramación) al navegar a otra sección de la misma página.
   */
  onNavegar?: () => void;
  /** Pendientes detectados por la pantalla; vacío u omitido usa la guía general. */
  pasos?: readonly PasoGuiaCapacidad[];
}

export function DialogoCapacidadSinConfigurar({
  abierto,
  onAbiertoChange,
  onNavegar,
  pasos,
}: PropsDialogoCapacidadSinConfigurar) {
  const detectados = pasos && pasos.length > 0 ? pasos : PASOS_GENERALES_CAPACIDAD;
  const diagnostico = pasos !== undefined && pasos.length > 0;

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
            {diagnostico
              ? 'Revisamos esta revisión y encontramos estos pendientes concretos. Lo que ya está configurado no aparece aquí; resuelve solo lo que se muestra.'
              : 'Para comparar la carga con la capacidad, el sistema necesita saber cuántas horas puede trabajar cada equipo en cada turno. Sin ese dato no puede calcular la disponibilidad y muestra este aviso. No es un error de la propuesta ni de la fecha: es configuración pendiente.'}
          </DialogDescription>
        </DialogHeader>

        <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
          {detectados.map((paso) => (
            <li
              key={paso.clave}
              className="flex flex-col gap-1 pl-1"
              data-testid="guia-capacidad-paso"
              data-pendiente={paso.clave}
            >
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
  pasos,
}: {
  etiqueta?: string;
  variante?: 'contorno' | 'secundario' | 'fantasma';
  tamano?: 'sm' | 'md' | 'lg' | 'piso';
  onNavegar?: () => void;
  pasos?: readonly PasoGuiaCapacidad[];
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
        pasos={pasos}
      />
    </>
  );
}
