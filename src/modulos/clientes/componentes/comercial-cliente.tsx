'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { actualizarClienteAccion } from '@/modulos/clientes/acciones/actualizar-cliente';
import type { Cliente, MonedaCliente } from '@/modulos/clientes/tipos/indice';
import { ETIQUETA_CONDICIONES_PAGO } from '@/modulos/clientes/utilidades/indice';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { Tarjeta } from '@/compartido/componentes/diseno/tarjeta';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';

/**
 * Pestaña Comercial (SII-B2.4): moneda MXN/USD, crédito sí/no, días de crédito y
 * límite, con el resumen de crédito usado/disponible. Los días exigen
 * `cliente_comercial` y el límite `ver_finanzas`; el servidor lo valida igual.
 */
export function PanelComercial({
  cliente,
  creditoUsado,
  puedeComercial,
  puedeFinanzas,
}: {
  cliente: Cliente;
  creditoUsado: number;
  puedeComercial: boolean;
  puedeFinanzas: boolean;
}) {
  const queryClient = useQueryClient();
  const [moneda, setMoneda] = useState<MonedaCliente>(cliente.moneda);
  const [creditoHabilitado, setCreditoHabilitado] = useState(cliente.creditoHabilitado);
  const [diasCredito, setDiasCredito] = useState(
    String(cliente.diasCredito ?? (cliente.creditoHabilitado ? 30 : 0)),
  );
  const [limite, setLimite] = useState(String(cliente.limiteCredito));
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const disponible = cliente.limiteCredito + cliente.saldoAFavor - creditoUsado;
  const puedeGuardar = puedeComercial || puedeFinanzas;

  async function guardar(): Promise<void> {
    const cambios: Record<string, unknown> = { id: cliente.id };

    if (puedeComercial) {
      if (moneda !== cliente.moneda) cambios.moneda = moneda;
      const dias = creditoHabilitado
        ? Math.max(1, Math.min(365, Number(diasCredito) || 0))
        : 0;
      const diasActuales = cliente.diasCredito ?? 0;
      if (creditoHabilitado !== cliente.creditoHabilitado || dias !== diasActuales) {
        cambios.creditoHabilitado = creditoHabilitado;
        cambios.diasCredito = dias;
      }
    }

    if (puedeFinanzas) {
      const valor = Number(limite) || 0;
      if (valor !== cliente.limiteCredito) cambios.limiteCredito = valor;
    }

    if (Object.keys(cambios).length === 1) {
      setMensaje('Sin cambios.');
      return;
    }

    setEnviando(true);
    setMensaje(null);
    const respuesta = await actualizarClienteAccion(cambios);
    setEnviando(false);
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    setMensaje('Condiciones comerciales actualizadas.');
    await queryClient.invalidateQueries({ queryKey: ['cliente', cliente.id] });
    await queryClient.invalidateQueries({ queryKey: ['clientes'] });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="panel-comercial">
      <Tarjeta className="p-3 text-sm">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Dato etiqueta="Moneda" valor={cliente.moneda} />
          <Dato etiqueta="Crédito" valor={cliente.creditoHabilitado ? 'Sí' : 'No'} />
          <Dato
            etiqueta="Días de crédito"
            valor={cliente.creditoHabilitado ? String(cliente.diasCredito ?? '—') : '—'}
          />
          <Dato
            etiqueta="Límite"
            valor={formatearMoneda(cliente.limiteCredito, cliente.moneda)}
          />
          <Dato etiqueta="Crédito usado" valor={formatearMoneda(creditoUsado, cliente.moneda)} />
          <Dato
            etiqueta="Disponible"
            valor={
              cliente.limiteCredito > 0
                ? formatearMoneda(disponible, cliente.moneda)
                : 'Sin límite definido'
            }
          />
          <Dato
            etiqueta="Condiciones de pago"
            valor={
              cliente.condicionesPago
                ? ETIQUETA_CONDICIONES_PAGO[cliente.condicionesPago]
                : '—'
            }
          />
        </dl>
      </Tarjeta>

      {puedeGuardar && (
        <Tarjeta>
          <div className="flex flex-col gap-3 p-3">
            <span className="text-sm font-medium text-texto-primario">
              Editar condiciones comerciales
            </span>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Moneda</span>
                <Select
                  value={moneda}
                  onChange={(evento) => setMoneda(evento.target.value as MonedaCliente)}
                  aria-label="Moneda"
                  disabled={!puedeComercial}
                  className="w-auto"
                >
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                </Select>
              </label>

              <label className="flex items-center gap-2 self-end text-sm">
                <input
                  type="checkbox"
                  checked={creditoHabilitado}
                  onChange={(evento) => setCreditoHabilitado(evento.target.checked)}
                  disabled={!puedeComercial}
                  aria-label="Habilitar crédito"
                />
                Crédito habilitado
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Días de crédito</span>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={diasCredito}
                  onChange={(evento) => setDiasCredito(evento.target.value)}
                  disabled={!puedeComercial || !creditoHabilitado}
                  aria-label="Días de crédito"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Límite de crédito</span>
                <Input
                  type="number"
                  min={0}
                  value={limite}
                  onChange={(evento) => setLimite(evento.target.value)}
                  disabled={!puedeFinanzas}
                  aria-label="Límite de crédito"
                />
              </label>
            </div>

            <div className="flex items-center gap-3">
              <Button tamano="sm" onClick={() => void guardar()} disabled={enviando}>
                {enviando ? 'Guardando…' : 'Guardar comercial'}
              </Button>
              {mensaje && (
                <span role="status" className="text-xs text-texto-secundario">
                  {mensaje}
                </span>
              )}
            </div>
          </div>
        </Tarjeta>
      )}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-texto-secundario">{etiqueta}</dt>
      <dd className="font-medium tabular-nums">{valor}</dd>
    </div>
  );
}
