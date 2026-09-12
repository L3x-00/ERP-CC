'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/compartido/componentes/ui/dialog';
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import {
  CATEGORIAS_GASTO,
  METODOS_PAGO_GASTO,
  type DatosComprobanteOCR,
  type MonedaGasto,
} from '@/modulos/gastos/tipos/indice';
import type { RegistrarGastoInput } from '@/modulos/gastos/validaciones/indice';

export interface ModalRegistrarGastoProps {
  abierto: boolean;
  procesando: boolean;
  ocrEnCurso: boolean;
  ordenIdInicial?: string;
  onAbiertoChange: (abierto: boolean) => void;
  onRegistrar: (entrada: RegistrarGastoInput) => Promise<RespuestaAccion<unknown>>;
  onOcr: (archivo: File) => Promise<RespuestaAccion<DatosComprobanteOCR>>;
}

export function ModalRegistrarGasto({
  abierto,
  procesando,
  ocrEnCurso,
  ordenIdInicial,
  onAbiertoChange,
  onRegistrar,
  onOcr,
}: ModalRegistrarGastoProps) {
  const [ordenId, setOrdenId] = useState(ordenIdInicial ?? '');
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS_GASTO)[number]>('materia_prima');
  const [descripcion, setDescripcion] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const [iva, setIva] = useState('');
  const [total, setTotal] = useState('');
  const [moneda, setMoneda] = useState<MonedaGasto>('MXN');
  const [tipoCambio, setTipoCambio] = useState('1');
  const [fechaGasto, setFechaGasto] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [folioComprobante, setFolioComprobante] = useState('');
  const [metodoPago, setMetodoPago] = useState<(typeof METODOS_PAGO_GASTO)[number]>('transferencia');
  const [notas, setNotas] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [arrastrandoArchivo, setArrastrandoArchivo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [estadoOcr, setEstadoOcr] = useState<'inactivo' | 'exito' | 'error'>('inactivo');
  const [mensajeOcr, setMensajeOcr] = useState<string | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setMensaje(null);
    const resultado = await onRegistrar({
      ordenId: ordenId || undefined,
      categoria,
      descripcion,
      montoSubtotal: Number(subtotal),
      montoIva: Number(iva),
      montoTotal: Number(total),
      moneda,
      tipoCambio: Number(tipoCambio),
      fechaGasto,
      fechaVencimiento: fechaVencimiento || undefined,
      folioComprobante: folioComprobante || undefined,
      metodoPago,
      notas: notas || undefined,
    });
    if (resultado.exito) {
      setMensaje(null);
      onAbiertoChange(false);
    } else {
      setMensaje(resultado.error ?? 'No se pudo registrar el gasto');
    }
  }

  async function escanear(): Promise<void> {
    if (!archivo) return;
    setMensaje(null);
    setMensajeOcr(null);
    setEstadoOcr('inactivo');
    const resultado = await onOcr(archivo);
    if (!resultado.exito || !resultado.datos) {
      setEstadoOcr('error');
      setMensajeOcr(resultado.exito ? 'El OCR no devolvió datos' : resultado.error);
      return;
    }
    const datos = resultado.datos;
    setDescripcion(datos.proveedorSugerido ? 'Comprobante de ' + datos.proveedorSugerido : 'Comprobante escaneado');
    setFolioComprobante(datos.folioFactura ?? '');
    if (datos.montoSubtotal !== null) setSubtotal(String(datos.montoSubtotal));
    if (datos.montoIva !== null) setIva(String(datos.montoIva));
    if (datos.montoTotal !== null) setTotal(String(datos.montoTotal));
    if (datos.moneda) {
      setMoneda(datos.moneda);
      if (datos.moneda === 'MXN') setTipoCambio('1');
    }
    if (datos.fechaEmision) setFechaGasto(datos.fechaEmision);
    setEstadoOcr('exito');
  }

  function seleccionarArchivo(archivoSeleccionado: File | undefined): void {
    if (archivoSeleccionado) setArchivo(archivoSeleccionado);
    setArrastrandoArchivo(false);
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent aria-describedby="descripcion-registro-gasto">
        <DialogHeader>
          <DialogTitle>Registrar gasto</DialogTitle>
          <DialogDescription id="descripcion-registro-gasto">Los importes se validan y guardan en su moneda original.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(evento) => void enviar(evento)}>
          <div
            className={`grid gap-3 rounded-lg border border-dashed p-4 transition-colors ${arrastrandoArchivo ? 'border-acento bg-acento-suave' : 'border-borde-fuerte bg-superficie-2/50'}`}
            onDragOver={(evento) => { evento.preventDefault(); setArrastrandoArchivo(true); }}
            onDragLeave={() => setArrastrandoArchivo(false)}
            onDrop={(evento) => { evento.preventDefault(); seleccionarArchivo(evento.dataTransfer.files[0]); }}
          >
            <div className="grid gap-1">
              <Label htmlFor="gasto-comprobante">Comprobante para OCR</Label>
              <p className="text-xs text-texto-secundario">Arrastra una imagen o PDF, o selecciónalo desde tu equipo (máximo 5 MiB).</p>
            </div>
            <Input id="gasto-comprobante" type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" onChange={(evento) => seleccionarArchivo(evento.target.files?.[0])} />
            {archivo ? <p className="text-xs text-texto-secundario" aria-live="polite">Archivo seleccionado: <span className="font-medium text-texto-primario">{archivo.name}</span></p> : null}
            <Button
              type="button"
              variante="secundario"
              tamano="lg"
              className="w-full"
              disabled={!archivo || ocrEnCurso}
              onClick={() => void escanear()}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5 fill-none stroke-current"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              {ocrEnCurso ? 'Analizando comprobante…' : 'Escanear comprobante con IA'}
            </Button>
            {ocrEnCurso ? (
              <p role="status" aria-live="polite" className="rounded-md bg-info-suave px-3 py-2 text-sm text-info-texto">
                Analizando el comprobante con IA…
              </p>
            ) : null}
            {!ocrEnCurso && estadoOcr === 'exito' ? (
              <p role="status" className="rounded-md bg-exito-suave px-3 py-2 text-sm text-exito-texto">
                Datos extraídos; revisa los campos antes de guardar.
              </p>
            ) : null}
            {!ocrEnCurso && estadoOcr === 'error' ? (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-peligro-suave px-3 py-2">
                <p className="text-sm text-peligro-texto">{mensajeOcr ?? 'No se pudo analizar el comprobante'}</p>
                <Button type="button" variante="contorno" tamano="sm" disabled={!archivo} onClick={() => void escanear()}>
                  Reintentar
                </Button>
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1"><Label htmlFor="gasto-orden">ID de orden (opcional)</Label><Input id="gasto-orden" value={ordenId} onChange={(evento) => setOrdenId(evento.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="gasto-categoria">Categoría</Label><Select id="gasto-categoria" value={categoria} onChange={(evento) => setCategoria(evento.target.value as typeof categoria)}>{CATEGORIAS_GASTO.map((item) => <option key={item} value={item}>{item}</option>)}</Select></div>
          </div>
          <div className="grid gap-1"><Label htmlFor="gasto-descripcion" obligatorio>Descripción</Label><Input id="gasto-descripcion" value={descripcion} onChange={(evento) => setDescripcion(evento.target.value)} required /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1"><Label htmlFor="gasto-subtotal" obligatorio>Subtotal</Label><Input id="gasto-subtotal" type="number" min="0" step="0.0001" value={subtotal} onChange={(evento) => setSubtotal(evento.target.value)} required /></div>
            <div className="grid gap-1"><Label htmlFor="gasto-iva" obligatorio>IVA</Label><Input id="gasto-iva" type="number" min="0" step="0.0001" value={iva} onChange={(evento) => setIva(evento.target.value)} required /></div>
            <div className="grid gap-1"><Label htmlFor="gasto-total" obligatorio>Total</Label><Input id="gasto-total" type="number" min="0" step="0.0001" value={total} onChange={(evento) => setTotal(evento.target.value)} required /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1"><Label htmlFor="gasto-moneda">Moneda</Label><Select id="gasto-moneda" value={moneda} onChange={(evento) => { const valor = evento.target.value as MonedaGasto; setMoneda(valor); if (valor === 'MXN') setTipoCambio('1'); }}><option value="MXN">MXN</option><option value="USD">USD</option></Select></div>
            <div className="grid gap-1"><Label htmlFor="gasto-tipo-cambio" obligatorio>Tipo de cambio (MXN)</Label><Input id="gasto-tipo-cambio" type="number" min="0.0001" step="0.0001" value={tipoCambio} onChange={(evento) => setTipoCambio(evento.target.value)} required /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1"><Label htmlFor="gasto-fecha" obligatorio>Fecha de gasto</Label><Input id="gasto-fecha" type="date" value={fechaGasto} onChange={(evento) => setFechaGasto(evento.target.value)} required /></div>
            <div className="grid gap-1"><Label htmlFor="gasto-vencimiento">Vencimiento</Label><Input id="gasto-vencimiento" type="date" value={fechaVencimiento} onChange={(evento) => setFechaVencimiento(evento.target.value)} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1"><Label htmlFor="gasto-folio">Folio de comprobante</Label><Input id="gasto-folio" value={folioComprobante} onChange={(evento) => setFolioComprobante(evento.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="gasto-metodo">Método de pago</Label><Select id="gasto-metodo" value={metodoPago} onChange={(evento) => setMetodoPago(evento.target.value as typeof metodoPago)}>{METODOS_PAGO_GASTO.map((item) => <option key={item} value={item}>{item}</option>)}</Select></div>
          </div>
          <div className="grid gap-1"><Label htmlFor="gasto-notas">Notas</Label><Textarea id="gasto-notas" value={notas} onChange={(evento) => setNotas(evento.target.value)} /></div>
          {mensaje ? <p role="alert" className="text-sm text-peligro-texto">{mensaje}</p> : null}
          <DialogFooter><Button variante="contorno" type="button" onClick={() => onAbiertoChange(false)} disabled={procesando}>Cancelar</Button><Button type="submit" disabled={procesando}>{procesando ? 'Guardando…' : 'Guardar gasto'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
