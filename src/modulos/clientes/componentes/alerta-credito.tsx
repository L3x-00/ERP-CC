'use client';

import { verificarCredito } from '@/modulos/clientes/servicios/verificar-credito';
import type { Cliente } from '@/modulos/clientes/tipos/indice';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { BarraProgreso } from '@/compartido/componentes/diseno/barra-progreso';

/**
 * Resumen de crédito del cliente con alerta si está excedido. El crédito usado
 * se calcula con las AR pendientes/parciales (MXN) leídas bajo RLS: un usuario
 * sin `ver_finanzas` verá 0 porque las cuentas no le son visibles. Un límite
 * excedido bloquea nuevas órdenes (enforce en Fase 5).
 */
export function AlertaCredito({ cliente, usado = 0 }: { cliente: Cliente; usado?: number }) {
  const credito = verificarCredito({
    limite: cliente.limiteCredito,
    saldoAFavor: cliente.saldoAFavor,
    usado,
  });

  // Un límite en 0 significa "sin límite de crédito definido": no se calcula
  // porcentaje ni se marca excedido; solo se informa lo usado y el saldo a favor.
  const sinLimite = credito.limite <= 0;

  const base = credito.limite + credito.saldoAFavor;
  const porcentajeUso = base > 0 ? (credito.usado / base) * 100 : 0;
  // Desde el 80% exacto, no a partir de superarlo: el corte de aviso es el 80%.
  const tono = credito.excedido ? 'peligro' : porcentajeUso >= 80 ? 'advertencia' : 'exito';

  if (sinLimite) {
    return (
      <div className="rounded-lg border border-borde bg-superficie-2 p-3 text-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Dato etiqueta="Límite" valor="Sin límite definido" />
          <Dato etiqueta="Saldo a favor" valor={formatearMoneda(credito.saldoAFavor)} />
          <Dato etiqueta="Usado (AR)" valor={formatearMoneda(credito.usado)} />
        </div>
        <p className="mt-2 text-texto-secundario">
          Este cliente no tiene un límite de crédito definido; no se calcula disponibilidad.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        credito.excedido
          ? 'border-peligro/40 bg-peligro-suave'
          : 'border-borde bg-superficie-2'
      }`}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Dato etiqueta="Límite" valor={formatearMoneda(credito.limite)} />
        <Dato etiqueta="Saldo a favor" valor={formatearMoneda(credito.saldoAFavor)} />
        <Dato etiqueta="Usado (AR)" valor={formatearMoneda(credito.usado)} />
        <Dato etiqueta="Disponible" valor={formatearMoneda(credito.disponible)} />
      </div>
      <BarraProgreso
        className="mt-3"
        valor={porcentajeUso}
        tono={tono}
        etiqueta="Uso del crédito"
        mostrarPorcentaje
      />
      {credito.excedido ? (
        <p role="alert" className="mt-2 font-semibold text-peligro-texto">
          Crédito excedido. Nuevas órdenes requieren autorización de un administrador.
        </p>
      ) : (
        porcentajeUso >= 80 && (
          <p role="alert" className="mt-2 font-medium text-advertencia-texto">
            Crédito al {Math.round(porcentajeUso)}% de su límite. Revisa la cartera antes de
            comprometer nuevas órdenes.
          </p>
        )
      )}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-texto-secundario">{etiqueta}</span>
      <span className="font-medium tabular-nums">{valor}</span>
    </div>
  );
}
