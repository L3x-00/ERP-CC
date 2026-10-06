'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { obtenerCobroMultipleAccion } from '@/modulos/cobranza/acciones/obtener-cobro-multiple';
import {
  registrarCobroMultipleAccion,
  type ResultadoCobroMultiple,
} from '@/modulos/cobranza/acciones/registrar-cobro-multiple';

/**
 * SII-B8 F3: cobro repartido — un recibo RP-MMYY_0000-YY aplicado a varias
 * facturas del mismo cliente; el excedente pasa al monedero.
 */
export function ModalCobroMultiple({
  abierto,
  onCerrar,
  onRegistrado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onRegistrado: () => Promise<void> | void;
}) {
  const [clienteId, setClienteId] = useState('');
  const [desmarcadas, setDesmarcadas] = useState<Set<string>>(new Set());
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [montoPagado, setMontoPagado] = useState('');
  const [monedaPago, setMonedaPago] = useState<'MXN' | 'USD'>('MXN');
  const [tipoCambio, setTipoCambio] = useState('1');
  const [metodoPago, setMetodoPago] = useState<'transferencia' | 'efectivo' | 'cheque' | 'tarjeta'>('transferencia');
  const [referencia, setReferencia] = useState('');
  const [resultado, setResultado] = useState<ResultadoCobroMultiple | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const consultaClientes = useQuery({
    queryKey: ['cobranza', 'cobro-multiple', 'clientes'],
    enabled: abierto,
    queryFn: async () => {
      const respuesta = await obtenerCobroMultipleAccion({});
      if (!respuesta.exito || !respuesta.datos || respuesta.datos.modo !== 'clientes') {
        throw new Error(respuesta.exito ? 'Sin clientes' : respuesta.error);
      }
      return respuesta.datos.clientes;
    },
  });

  const consultaCuentas = useQuery({
    queryKey: ['cobranza', 'cobro-multiple', 'cuentas', clienteId],
    enabled: abierto && clienteId !== '',
    queryFn: async () => {
      const respuesta = await obtenerCobroMultipleAccion({ clienteId });
      if (!respuesta.exito || !respuesta.datos || respuesta.datos.modo !== 'cuentas') {
        throw new Error(respuesta.exito ? 'Sin cuentas' : respuesta.error);
      }
      return respuesta.datos.cuentas;
    },
  });

  const cuentas = useMemo(() => consultaCuentas.data ?? [], [consultaCuentas.data]);

  const seleccionadas = useMemo(
    () => cuentas
      .filter((cuenta) => !desmarcadas.has(cuenta.id))
      .map((cuenta) => ({
        cuentaId: cuenta.id,
        monto: Number(montos[cuenta.id] ?? cuenta.saldo),
      })),
    [cuentas, desmarcadas, montos],
  );

  const totalAplicado = useMemo(
    () => seleccionadas.reduce((suma, aplicacion) => suma + (Number.isFinite(aplicacion.monto) ? aplicacion.monto : 0), 0),
    [seleccionadas],
  );

  function alternar(cuentaIdCuenta: string, marcada: boolean): void {
    setDesmarcadas((actuales) => {
      const siguiente = new Set(actuales);
      if (marcada) siguiente.delete(cuentaIdCuenta);
      else siguiente.add(cuentaIdCuenta);
      return siguiente;
    });
  }

  function cambiarCliente(valor: string): void {
    setClienteId(valor);
    setDesmarcadas(new Set());
    setMontos({});
    setMontoPagado('');
    setResultado(null);
    setError(null);
  }

  async function registrar(): Promise<void> {
    setOcupado(true);
    setError(null);
    const respuesta = await registrarCobroMultipleAccion({
      clienteId,
      montoPagado: montoPagado.trim() === '' ? totalAplicado : Number(montoPagado),
      monedaPago,
      tipoCambio: Number(tipoCambio),
      metodoPago,
      referencia: referencia.trim() === '' ? null : referencia.trim(),
      aplicaciones: seleccionadas,
    });
    setOcupado(false);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    setResultado(respuesta.datos ?? null);
    await consultaCuentas.refetch();
    await onRegistrado();
  }

  return (
    <Dialog open={abierto} onOpenChange={(siguiente) => (!siguiente ? onCerrar() : undefined)}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl" data-testid="modal-cobro-multiple">
        <DialogHeader>
          <DialogTitle>Cobro múltiple</DialogTitle>
          <DialogDescription>
            Un solo recibo RP-MMYY_0000-YY aplicado a varias facturas del mismo cliente; el excedente
            se acredita al monedero.
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <div className="grid gap-2 rounded-md border border-exito-texto/40 bg-exito-suave p-3 text-sm" data-testid="cobro-multiple-mensaje">
            <p className="font-semibold">
              Recibo {resultado.folioRecibo} registrado · {resultado.aplicaciones} factura(s) aplicadas.
            </p>
            {resultado.saldoAFavorMxn > 0 ? (
              <p>Saldo a favor del cliente: {formatearMoneda(resultado.saldoAFavorMxn, 'MXN')}.</p>
            ) : null}
          </div>
        ) : null}

        {error ? <p role="alert" className="text-sm text-peligro-texto" data-testid="cobro-multiple-error">{error}</p> : null}

        {!resultado ? (
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Cliente
              <Select className="min-h-11" data-testid="cobro-cliente"
                value={clienteId} onChange={(evento) => cambiarCliente(evento.target.value)}>
                <option value="">Selecciona un cliente</option>
                {(consultaClientes.data ?? []).map((cliente) => (
                  <option key={cliente.clienteId} value={cliente.clienteId}>
                    {cliente.nombre} · {cliente.cuentas} factura(s) · {formatearMoneda(cliente.saldoTotal, 'MXN')}
                  </option>
                ))}
              </Select>
            </label>

            {consultaCuentas.isPending && clienteId ? (
              <p className="text-sm text-texto-secundario">Cargando facturas…</p>
            ) : null}

            {cuentas.length > 0 ? (
              <fieldset className="grid gap-2 rounded-md border border-borde p-3">
                <legend className="px-1 text-sm font-semibold">Facturas a cubrir</legend>
                {cuentas.map((cuenta) => {
                  const marcada = !desmarcadas.has(cuenta.id);
                  return (
                    <div key={cuenta.id} className="grid grid-cols-[auto_1fr_8rem] items-center gap-2 text-sm">
                      <input type="checkbox" checked={marcada} data-testid={`cobro-cuenta-${cuenta.id}`}
                        onChange={(evento) => alternar(cuenta.id, evento.target.checked)} />
                      <span>
                        <span className="font-mono text-xs">{cuenta.referenciaInterna}</span>
                        <span className="block text-xs text-texto-secundario">
                          {cuenta.folioOrden} · saldo {formatearMoneda(cuenta.saldo, cuenta.moneda as 'MXN' | 'USD')}
                        </span>
                      </span>
                      <Input type="number" min="0" step="0.01" className="min-h-11"
                        aria-label={`Monto para ${cuenta.referenciaInterna}`}
                        data-testid={`cobro-cuenta-monto-${cuenta.id}`}
                        disabled={!marcada}
                        value={montos[cuenta.id] ?? String(cuenta.saldo)}
                        onChange={(evento) => setMontos((actuales) => ({ ...actuales, [cuenta.id]: evento.target.value }))} />
                    </div>
                  );
                })}
                <p className="text-xs text-texto-secundario" data-testid="cobro-total-aplicado">
                  Total aplicado: {formatearMoneda(totalAplicado, 'MXN')}
                </p>
              </fieldset>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                Monto pagado (vacío = total aplicado)
                <Input type="number" min="0" step="0.01" className="min-h-11" data-testid="cobro-monto-pagado"
                  value={montoPagado} onChange={(evento) => setMontoPagado(evento.target.value)} />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Moneda de pago
                <Select className="min-h-11" data-testid="cobro-moneda"
                  value={monedaPago}
                  onChange={(evento) => {
                    const valor = evento.target.value as 'MXN' | 'USD';
                    setMonedaPago(valor);
                    if (valor === 'MXN') setTipoCambio('1');
                  }}>
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                </Select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Tipo de cambio (MXN por unidad)
                <Input type="number" min="0" step="0.0001" className="min-h-11" data-testid="cobro-tipo-cambio"
                  disabled={monedaPago === 'MXN'}
                  value={tipoCambio} onChange={(evento) => setTipoCambio(evento.target.value)} />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Método
                <Select className="min-h-11" data-testid="cobro-metodo"
                  value={metodoPago} onChange={(evento) => setMetodoPago(evento.target.value as typeof metodoPago)}>
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="cheque">Cheque</option>
                  <option value="tarjeta">Tarjeta</option>
                </Select>
              </label>
              <label className="grid gap-1 text-sm font-medium sm:col-span-2">
                Referencia bancaria (opcional)
                <Input className="min-h-11" data-testid="cobro-referencia"
                  value={referencia} onChange={(evento) => setReferencia(evento.target.value)} />
              </label>
            </div>

            <DialogFooter>
              <Button type="button" variante="contorno" onClick={onCerrar}>Cancelar</Button>
              <Button type="button" data-testid="confirmar-cobro-multiple"
                disabled={ocupado || clienteId === '' || seleccionadas.length === 0 || !(Number(tipoCambio) > 0)}
                onClick={() => void registrar()}>
                {ocupado ? 'Registrando…' : 'Registrar cobro múltiple'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <DialogFooter>
            <Button type="button" onClick={onCerrar} data-testid="cerrar-cobro-multiple">Cerrar</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
