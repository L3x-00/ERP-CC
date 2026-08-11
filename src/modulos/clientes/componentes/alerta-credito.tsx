'use client';

import { verificarCredito } from '@/modulos/clientes/servicios/verificar-credito';
import type { Cliente } from '@/modulos/clientes/tipos/indice';
import { formatearMoneda } from '@/compartido/utilidades/formatear';

/**
 * Resumen de crédito del cliente con alerta si está excedido. El crédito usado
 * es 0 por ahora (hook Fase 8 — AR real); cuando exista, esta vista lo reflejará
 * sin cambios de UI. Un límite excedido bloquea nuevas órdenes (enforce en Fase 5).
 */
export function AlertaCredito({ cliente }: { cliente: Cliente }) {
  const credito = verificarCredito({
    limite: cliente.limiteCredito,
    saldoAFavor: cliente.saldoAFavor,
    usado: 0,
  });

  return (
    <div
      className={`rounded-base border p-3 text-sm ${
        credito.excedido
          ? 'border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950/40'
          : 'border-foreground/15 bg-foreground/5'
      }`}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Dato etiqueta="Límite" valor={formatearMoneda(credito.limite)} />
        <Dato etiqueta="Saldo a favor" valor={formatearMoneda(credito.saldoAFavor)} />
        <Dato etiqueta="Usado (AR)" valor={formatearMoneda(credito.usado)} />
        <Dato etiqueta="Disponible" valor={formatearMoneda(credito.disponible)} />
      </div>
      {credito.excedido && (
        <p role="alert" className="mt-2 font-semibold text-red-700 dark:text-red-400">
          Crédito excedido. Nuevas órdenes requieren autorización de un administrador.
        </p>
      )}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-foreground/60">{etiqueta}</span>
      <span className="font-medium">{valor}</span>
    </div>
  );
}
