'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/compartido/componentes/ui/dialog';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { abrirCuentaPorCobrarAccion, obtenerOrdenesSinArAccion } from '@/modulos/cobranza/acciones/indice';
import type { OrdenSinAr } from '@/modulos/cobranza/acciones/obtener-ordenes-sin-ar';

function vencimientoSugerido(orden: OrdenSinAr): string {
  const dias = orden.condicionPago === 'contado' ? 0
    : orden.condicionPago === '15_dias' ? 15
      : orden.condicionPago === 'credito' ? 45 : 30;
  const fecha = new Date(orden.fechaEntrega);
  fecha.setDate(fecha.getDate() + dias);
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/** Alta excepcional: solo órdenes ya entregadas y sin cuenta, con confirmación del importe. */
export function ModalAbrirArExcepcion({
  abierto, onAbiertoChange, onCreada,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onCreada: (cuentaId: string, abrirAbono: boolean) => Promise<void>;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('');
  const [ordenes, setOrdenes] = useState<OrdenSinAr[]>([]);
  const [cargando, setCargando] = useState(false);
  const [ordenId, setOrdenId] = useState('');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<'MXN' | 'USD'>('MXN');
  const [tipoCambio, setTipoCambio] = useState('1');
  const [vencimiento, setVencimiento] = useState('');
  const [folio, setFolio] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    void (async () => {
      setCargando(true);
      setError(null);
      const resultado = await obtenerOrdenesSinArAccion(filtro);
      if (!vigente) return;
      setCargando(false);
      if (!resultado.exito) {
        setError(resultado.error);
        setOrdenes([]);
        return;
      }
      setOrdenes(resultado.datos ?? []);
    })().catch(() => {
      if (vigente) {
        setCargando(false);
        setError('No se pudieron cargar las órdenes. Vuelve a buscar.');
      }
    });
    return () => { vigente = false; };
  }, [abierto, filtro]);

  const orden = ordenes.find((candidata) => candidata.id === ordenId) ?? null;

  function seleccionarOrden(id: string): void {
    setOrdenId(id);
    const seleccionada = ordenes.find((candidata) => candidata.id === id);
    if (!seleccionada) return;
    setMonto(seleccionada.totalSugerido?.toFixed(2) ?? '');
    setMoneda(seleccionada.monedaSugerida);
    setTipoCambio(seleccionada.tipoCambioSugerido?.toString() ?? '');
    setVencimiento(vencimientoSugerido(seleccionada));
    setFolio('');
    setError(null);
  }

  async function guardar(abrirAbono: boolean): Promise<void> {
    if (!orden) return;
    setError(null);
    const importe = Number(monto);
    const cambio = moneda === 'MXN' ? 1 : Number(tipoCambio);
    if (!Number.isFinite(importe) || importe <= 0 || !Number.isFinite(cambio) || cambio <= 0 || !vencimiento || !folio.trim()) {
      setError('Confirma importe, moneda, tipo de cambio, vencimiento y número de factura.');
      return;
    }
    setProcesando(true);
    try {
      const resultado = await abrirCuentaPorCobrarAccion({
        ordenId: orden.id,
        montoTotal: importe,
        moneda,
        tipoCambioOrigen: cambio,
        fechaVencimiento: `${vencimiento}T12:00:00.000Z`,
        folioFacturaRemision: folio.trim(),
      });
      if (!resultado.exito || !resultado.datos) {
        setError(resultado.exito ? 'No se recibió la cuenta creada.' : resultado.error);
        return;
      }
      await onCreada(resultado.datos.id, abrirAbono);
    } catch {
      setError('No se pudo confirmar el alta. Revisa la cartera antes de repetirla.');
    } finally {
      setProcesando(false);
    }
  }

  function enviar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    void guardar(false);
  }

  return <Dialog open={abierto} onOpenChange={(siguiente) => { if (!procesando) onAbiertoChange(siguiente); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden">
      <DialogHeader>
        <DialogTitle>Nueva factura de orden entregada</DialogTitle>
        <DialogDescription>
          Solo para una orden histórica o manual sin cuenta por cobrar. La aprobación comercial ordinaria ya crea su cuenta.
        </DialogDescription>
      </DialogHeader>
      <form className="flex min-h-0 flex-col gap-4" onSubmit={enviar} noValidate>
        <div className="grid min-h-0 gap-4 overflow-y-auto pb-1">
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-40 flex-1 gap-1 text-sm font-medium">Buscar folio de orden
              <Input value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} maxLength={30} placeholder="OP-000123" />
            </label>
            <Button type="button" variante="contorno" disabled={cargando} onClick={() => setFiltro(busqueda.trim())}>
              {cargando ? 'Buscando…' : 'Buscar'}
            </Button>
          </div>
          <label className="grid gap-1 text-sm font-medium">Orden entregada sin cuenta
            <Select value={ordenId} onChange={(evento) => seleccionarOrden(evento.target.value)} disabled={cargando}>
              <option value="">{cargando ? 'Cargando…' : 'Selecciona una orden'}</option>
              {ordenes.map((candidata) => <option key={candidata.id} value={candidata.id}>
                {candidata.folio} · {candidata.clienteNombre}
              </option>)}
            </Select>
          </label>
          {!cargando && ordenes.length === 0 && !error && <p className="text-sm text-texto-secundario">No aparecen órdenes entre las 50 más recientes; busca por folio para consultar una anterior.</p>}
          {orden && <>
            <p className="rounded-md bg-superficie-2 p-3 text-sm text-texto-secundario">
              Cliente: {orden.clienteNombre}. Entrega: {new Date(orden.fechaEntrega).toLocaleDateString('es-MX')}.
              {orden.totalSugerido !== null
                ? ` RFQ: descuento ${formatearMoneda(orden.descuentoSugerido ?? 0, orden.monedaSugerida)}, subtotal neto ${formatearMoneda(orden.subtotalSugerido ?? 0, orden.monedaSugerida)}, IVA ${formatearMoneda(orden.ivaSugerido ?? 0, orden.monedaSugerida)}, total sugerido ${formatearMoneda(orden.totalSugerido, orden.monedaSugerida)}.`
                : ' Sin RFQ disponible; confirma el importe manualmente.'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">Importe total confirmado
                <Input type="number" min="0.0001" step="0.0001" value={monto} onChange={(evento) => setMonto(evento.target.value)} required />
              </label>
              <label className="grid gap-1 text-sm font-medium">Moneda
                <Select value={moneda} onChange={(evento) => setMoneda(evento.target.value as 'MXN' | 'USD')}>
                  <option value="MXN">MXN</option><option value="USD">USD</option>
                </Select>
              </label>
              {moneda === 'USD' && <label className="grid gap-1 text-sm font-medium">Tipo de cambio (MXN por USD)
                <Input type="number" min="0.0001" step="0.0001" value={tipoCambio} onChange={(evento) => setTipoCambio(evento.target.value)} required />
              </label>}
              <label className="grid gap-1 text-sm font-medium">Fecha de vencimiento
                <Input type="date" value={vencimiento} onChange={(evento) => setVencimiento(evento.target.value)} required />
              </label>
            </div>
            <label className="grid gap-1 text-sm font-medium">Número de factura o remisión
              <Input value={folio} onChange={(evento) => setFolio(evento.target.value)} maxLength={60} required />
            </label>
          </>}
          {error && <p role="alert" className="text-sm text-peligro-texto">{error}</p>}
        </div>
        <DialogFooter className="static mt-2 shrink-0">
          <Button type="button" variante="contorno" disabled={procesando} onClick={() => onAbiertoChange(false)}>Cancelar</Button>
          <Button type="submit" disabled={!orden || procesando}>{procesando ? 'Guardando…' : 'Guardar cuenta'}</Button>
          <Button type="button" variante="secundario" disabled={!orden || procesando} onClick={() => void guardar(true)}>
            Guardar y registrar abono
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
