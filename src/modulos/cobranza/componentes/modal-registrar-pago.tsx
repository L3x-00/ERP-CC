'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { obtenerCuentasBancariasAccion } from '@/modulos/cobranza/acciones/consultar-historial';
import { esquemaRegistrarPago, esquemaAplicarSaldoFavor } from '@/modulos/cobranza/validaciones/cobranza';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import type { CuentaCartera } from '@/modulos/cobranza/servicios/cobranza-servicio';

export interface DatosPagoFormulario {
  arId: string;
  montoPagado: number;
  monedaPago: 'USD' | 'MXN';
  tipoCambioPago: number;
  metodoPago: 'transferencia' | 'efectivo' | 'cheque' | 'tarjeta';
  referenciaBancaria?: string;
  cuentaBancariaId?: string;
  notas?: string;
  solicitudId: string;
}

export interface DatosSaldoFormulario {
  clienteId: string;
  arId: string;
  montoAAplicar: number;
  solicitudId: string;
}

export interface ModalRegistrarPagoProps {
  cuenta: CuentaCartera | null;
  abierto: boolean;
  procesando: boolean;
  puedeRegistrarPago?: boolean;
  puedeAplicarSaldo?: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onRegistrarPago: (datos: DatosPagoFormulario) => Promise<{ exito: boolean; error?: string; rechazoConfirmado?: boolean }>;
  onAplicarSaldo: (datos: DatosSaldoFormulario) => Promise<{ exito: boolean; error?: string; rechazoConfirmado?: boolean }>;
}

export function ModalRegistrarPago({
  cuenta,
  abierto,
  procesando,
  onAbiertoChange,
  onRegistrarPago,
  onAplicarSaldo,
  puedeRegistrarPago = true,
  puedeAplicarSaldo = true,
}: ModalRegistrarPagoProps) {
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<'USD' | 'MXN'>('MXN');
  const [tipoCambio, setTipoCambio] = useState('1');
  const [metodo, setMetodo] = useState<DatosPagoFormulario['metodoPago']>('transferencia');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [bancoId, setBancoId] = useState('');
  const [intento, setIntento] = useState<{ tipo: 'pago'; datos: DatosPagoFormulario } | { tipo: 'saldo'; datos: DatosSaldoFormulario } | null>(null);
  const enviando = useRef(false);
  const [ocupado, setOcupado] = useState(false);
  const [estado, setEstado] = useState<string | null>(null);
  useEffect(() => {
    if (!intento) return;
    const prevenirSalida = (evento: BeforeUnloadEvent) => { evento.preventDefault(); evento.returnValue = ''; };
    window.addEventListener('beforeunload', prevenirSalida);
    return () => window.removeEventListener('beforeunload', prevenirSalida);
  }, [intento]);
  const bancos = useQuery({ queryKey: ['cobranza', 'bancos', moneda], enabled: abierto, staleTime: 0, queryFn: async () => {
    const resultado = await obtenerCuentasBancariasAccion({ moneda });
    if (!resultado.exito || !resultado.datos) throw new Error('Cuentas no disponibles');
    return resultado.datos;
  } });

  if (!cuenta) return null;

  function cerrar(forzado = false): void {
    if (!forzado && (enviando.current || intento)) return;
    setEstado(null);
    setIntento(null);
    setMonto(''); setMoneda('MXN'); setTipoCambio('1'); setMetodo('transferencia'); setReferencia(''); setNotas(''); setBancoId('');
    onAbiertoChange(false);
  }

  async function registrarPago(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!puedeRegistrarPago || !cuenta || enviando.current || (intento && intento.tipo !== 'pago')) return;
    const datos = intento?.tipo === 'pago' ? intento.datos : {
      arId: cuenta.id,
      montoPagado: Number(monto),
      monedaPago: moneda,
      tipoCambioPago: moneda === 'MXN' ? 1 : Number(tipoCambio),
      metodoPago: metodo,
      referenciaBancaria: referencia || undefined,
      notas: notas || undefined,
      cuentaBancariaId: bancoId || undefined,
      solicitudId: crypto.randomUUID(),
    };
    const analisis = esquemaRegistrarPago.safeParse(datos);
    if (!analisis.success) { setEstado(analisis.error.issues[0]?.message ?? 'Revisa el pago'); return; }
    if (!intento && bancoId && !bancos.data?.some(banco => banco.id === bancoId)) { setEstado('Selecciona una cuenta bancaria disponible'); return; }
    await ejecutar({ tipo: 'pago', datos: analisis.data });
  }

  async function aplicarSaldo(): Promise<void> {
    if (!puedeAplicarSaldo || !cuenta || enviando.current || (intento && intento.tipo !== 'saldo')) return;
    const datos = intento?.tipo === 'saldo' ? intento.datos : {
      clienteId: cuenta.clienteId,
      arId: cuenta.id,
      montoAAplicar: Number(monto),
      solicitudId: crypto.randomUUID(),
    };
    const analisis = esquemaAplicarSaldoFavor.safeParse(datos);
    if (!analisis.success) { setEstado(analisis.error.issues[0]?.message ?? 'Revisa el importe'); return; }
    await ejecutar({ tipo: 'saldo', datos: analisis.data });
  }

  async function ejecutar(nuevo: NonNullable<typeof intento>): Promise<void> {
    enviando.current = true; setOcupado(true); setIntento(nuevo); setEstado(null);
    try {
      const respuesta = nuevo.tipo === 'pago' ? await onRegistrarPago(nuevo.datos) : await onAplicarSaldo(nuevo.datos);
      if (respuesta.exito) cerrar(true);
      else {
        if (respuesta.rechazoConfirmado) setIntento(null);
        setEstado(respuesta.error ?? 'No se pudo confirmar la operación');
      }
    } catch {
      setEstado('No se recibió confirmación. Reintenta la misma operación.');
    } finally {
      enviando.current = false; setOcupado(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(siguiente) => {
      if (siguiente) onAbiertoChange(true); else cerrar();
    }}>
      <DialogContent aria-describedby="descripcion-registro-pago">
        <DialogHeader>
          <DialogTitle>Registrar cobro · {cuenta.folioOrden}</DialogTitle>
          <DialogDescription id="descripcion-registro-pago">
            Saldo pendiente: {cuenta.moneda} {formatearMoneda(cuenta.saldoPendiente, cuenta.moneda)} · Monedero disponible: MXN {formatearMoneda(cuenta.saldoAFavorMxn)}
            {cuenta.cobrableDesde === null
              ? ' · Cuenta no cobrable: este cobro se registra como anticipo de la orden.'
              : ''}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={registrarPago}>
          <fieldset className="grid min-w-0 gap-3" disabled={procesando || ocupado || intento !== null}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="monto-pago" obligatorio>Monto</Label>
              <div className="flex items-stretch gap-2">
                <span className="inline-flex items-center rounded-md border border-borde-fuerte bg-superficie-2 px-3 text-sm font-medium text-texto-secundario">
                  {moneda}
                </span>
                <Input id="monto-pago" className="flex-1" type="number" min="0.0001" step="0.0001" value={monto} onChange={(evento) => setMonto(evento.target.value)} required />
              </div>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="moneda-pago">Moneda de pago</Label>
              <Select id="moneda-pago" value={moneda} onChange={(evento) => { setMoneda(evento.target.value as 'USD' | 'MXN'); setBancoId(''); setTipoCambio(evento.target.value === 'MXN' ? '1' : ''); }}>
                <option value="MXN">MXN</option>
                <option value="USD">USD</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="tipo-cambio-pago" obligatorio>Tipo de cambio (MXN)</Label>
              <Input id="tipo-cambio-pago" type="number" min="0.0001" step="0.0001" value={tipoCambio} disabled={moneda === 'MXN'} onChange={(evento) => setTipoCambio(evento.target.value)} required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="metodo-pago">Método</Label>
              <Select id="metodo-pago" value={metodo} onChange={(evento) => setMetodo(evento.target.value as DatosPagoFormulario['metodoPago'])}>
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
                <option value="cheque">Cheque</option>
                <option value="tarjeta">Tarjeta</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="banco-pago">Cuenta bancaria (opcional)</Label>
            <Select id="banco-pago" value={bancoId} onChange={evento => setBancoId(evento.target.value)} disabled={bancos.isPending || bancos.isError}>
              <option value="">Sin cuenta bancaria asociada</option>
              {(bancos.data ?? []).map(banco => <option key={banco.id} value={banco.id}>{banco.banco} · {banco.numeroCuentaEnmascarado} · {banco.moneda}</option>)}
            </Select>
            {bancos.isPending && <p role="status" className="text-sm text-texto-secundario">Cargando cuentas bancarias…</p>}
            {bancos.isError && <p role="alert" className="text-sm text-peligro-texto">No se pudieron cargar las cuentas. <Button type="button" variante="contorno" onClick={() => void bancos.refetch()}>Reintentar cuentas</Button></p>}
            {!bancos.isPending && !bancos.isError && !bancos.data?.length && <p className="text-sm text-texto-secundario">No hay cuentas activas en {moneda}.</p>}
          </div>
          <div className="grid gap-1">
            <Label htmlFor="referencia-pago">Referencia bancaria</Label>
            <Input id="referencia-pago" value={referencia} onChange={(evento) => setReferencia(evento.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="notas-pago">Notas</Label>
            <Textarea id="notas-pago" value={notas} onChange={(evento) => setNotas(evento.target.value)} />
          </div>
          </fieldset>
          {estado ? <p role="alert" className="text-sm text-peligro-texto">{estado}</p> : null}
          {intento && !ocupado && <p className="text-sm text-texto-secundario">La operación está pendiente de confirmación. Conservamos sus datos para reintentar sin duplicar el cobro; confirma el resultado antes de cerrar o cambiar datos.</p>}
          <DialogFooter>
            <Button variante="contorno" type="button" onClick={() => cerrar()} disabled={procesando || ocupado || intento !== null}>Cancelar</Button>
            <Button
              variante="secundario"
              type="button"
              disabled={!puedeAplicarSaldo || procesando || ocupado || (intento !== null && intento.tipo !== 'saldo') || (!intento && (!monto || cuenta.saldoAFavorMxn <= 0))}
              onClick={() => void aplicarSaldo()}
            >
              {intento?.tipo === 'saldo' ? 'Reintentar aplicación' : 'Aplicar saldo a favor (MXN)'}
            </Button>
            <Button tamano="lg" type="submit" disabled={!puedeRegistrarPago || procesando || ocupado || (intento !== null && intento.tipo !== 'pago')}>{procesando || ocupado ? 'Registrando…' : intento?.tipo === 'pago' ? 'Reintentar pago' : 'Registrar pago'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
