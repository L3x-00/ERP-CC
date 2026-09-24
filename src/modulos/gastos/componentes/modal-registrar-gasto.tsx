'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { Button } from '@/compartido/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/compartido/componentes/ui/dialog';
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { useQuery } from '@tanstack/react-query';
import { obtenerCuentasGastoAccion } from '@/modulos/gastos/acciones/obtener-cuentas-gasto';
import { obtenerOrdenesGastoAccion } from '@/modulos/gastos/acciones/obtener-ordenes-gasto';
import type { RespuestaAccion } from '@/compartido/tipos/indice';
import {
  CATEGORIAS_GASTO,
  METODOS_PAGO_GASTO,
  type DatosComprobanteOCR,
  type MonedaGasto,
  type Gasto,
  type TipoGasto,
} from '@/modulos/gastos/tipos/indice';
import type { RegistrarGastoInput } from '@/modulos/gastos/validaciones/indice';
import { usarCatalogosComerciales } from '@/modulos/configuracion/hooks/usar-catalogos-comerciales';

export interface ModalRegistrarGastoProps {
  abierto: boolean;
  procesando: boolean;
  ocrEnCurso: boolean;
  ordenIdInicial?: string;
  gastoEditar?: Gasto | null;
  proveedores: readonly { id: string; nombre: string }[];
  onAbiertoChange: (abierto: boolean) => void;
  onGuardar: (entrada: RegistrarGastoInput & {
    modo: 'crear' | 'editar'; gastoId?: string; actualizadoEn?: string; tipoGasto: TipoGasto;
  }, archivo: File | null) => Promise<RespuestaAccion<unknown>>;
  onVerComprobante: (gasto: Gasto) => void;
  onOcr: (archivo: File) => Promise<RespuestaAccion<DatosComprobanteOCR>>;
}

export function ModalRegistrarGasto({
  abierto,
  procesando,
  ocrEnCurso,
  ordenIdInicial,
  gastoEditar,
  proveedores,
  onAbiertoChange,
  onGuardar,
  onVerComprobante,
  onOcr,
}: ModalRegistrarGastoProps) {
  const { categoriasGasto } = usarCatalogosComerciales();
  const [ordenId, setOrdenId] = useState(gastoEditar?.ordenId ?? ordenIdInicial ?? '');
  const [proveedorId, setProveedorId] = useState(gastoEditar?.proveedorId ?? '');
  const [tipoGasto, setTipoGasto] = useState<TipoGasto>(gastoEditar?.tipoGasto ?? 'variable');
  const [busquedaOrden, setBusquedaOrden] = useState('');
  const ordenesOpciones = useQuery({
    queryKey: ['gastos', 'ordenes', busquedaOrden],
    queryFn: async () => {
      const respuesta = await obtenerOrdenesGastoAccion(
        busquedaOrden.trim() ? { busqueda: busquedaOrden.trim() } : {},
      );
      return respuesta.exito ? (respuesta.datos ?? []) : [];
    },
    enabled: abierto,
    staleTime: 30_000,
  });
  const [categoria, setCategoria] = useState<string>(gastoEditar?.categoria ?? CATEGORIAS_GASTO[0]);
  const [descripcion, setDescripcion] = useState(gastoEditar?.descripcion ?? '');
  const [subtotal, setSubtotal] = useState(gastoEditar ? String(gastoEditar.montoSubtotal) : '');
  const [iva, setIva] = useState(gastoEditar ? String(gastoEditar.montoIva) : '');
  const [total, setTotal] = useState(gastoEditar ? String(gastoEditar.montoTotal) : '');
  const [moneda, setMoneda] = useState<MonedaGasto>(gastoEditar?.moneda ?? 'MXN');
  const [tipoCambio, setTipoCambio] = useState(gastoEditar ? String(gastoEditar.tipoCambio) : '1');
  const [fechaGasto, setFechaGasto] = useState(() => gastoEditar?.fechaGasto.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [fechaVencimiento, setFechaVencimiento] = useState(gastoEditar?.fechaVencimiento?.slice(0, 10) ?? '');
  const [folioComprobante, setFolioComprobante] = useState(gastoEditar?.folioComprobante ?? '');
  const [metodoPago, setMetodoPago] = useState<(typeof METODOS_PAGO_GASTO)[number] | ''>(gastoEditar ? gastoEditar.metodoPago ?? '' : 'transferencia');
  // OBS-28: cuenta bancaria de salida (opcional). El catálogo llega enmascarado.
  const [cuentaBancariaId, setCuentaBancariaId] = useState(gastoEditar?.cuentaBancariaId ?? '');
  const cuentasBancarias = useQuery({
    queryKey: ['gastos', 'cuentas-bancarias'],
    queryFn: async () => {
      const respuesta = await obtenerCuentasGastoAccion();
      return respuesta.exito ? (respuesta.datos ?? []) : [];
    },
    enabled: abierto,
    staleTime: 5 * 60 * 1000,
  });
  const [notas, setNotas] = useState(gastoEditar?.notas ?? '');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [arrastrandoArchivo, setArrastrandoArchivo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [estadoOcr, setEstadoOcr] = useState<'inactivo' | 'exito' | 'error'>('inactivo');
  const [mensajeOcr, setMensajeOcr] = useState<string | null>(null);
  // GAS-08: evidencia cruda de la última lectura, se guarda con el gasto.
  const [datosOcr, setDatosOcr] = useState<DatosComprobanteOCR | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  useEffect(() => () => { if (vistaPrevia) URL.revokeObjectURL(vistaPrevia); }, [vistaPrevia]);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setMensaje(null);
    const resultado = await onGuardar({
      modo: gastoEditar ? 'editar' : 'crear',
      ...(gastoEditar ? { gastoId: gastoEditar.id, actualizadoEn: gastoEditar.actualizadoEn } : {}),
      tipoGasto,
      ordenId: ordenId || undefined,
      proveedorId: proveedorId || undefined,
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
      metodoPago: metodoPago || undefined,
      cuentaBancariaId: cuentaBancariaId || undefined,
      notas: notas || undefined,
      ...(datosOcr
        ? { datosOcrJson: datosOcr as unknown as Record<string, unknown> }
        : {}),
    }, archivo);
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
    setDatosOcr(datos);
    setEstadoOcr('exito');
  }

  function seleccionarArchivo(archivoSeleccionado: File | undefined): void {
    if (archivoSeleccionado) {
      setArchivo(archivoSeleccionado);
      setVistaPrevia(URL.createObjectURL(archivoSeleccionado));
      setDatosOcr(null);
      setEstadoOcr('inactivo');
    }
    setArrastrandoArchivo(false);
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent aria-describedby="descripcion-registro-gasto">
        <DialogHeader>
          <DialogTitle>{gastoEditar ? `Editar ${gastoEditar.folio}` : 'Registrar gasto'}</DialogTitle>
          <DialogDescription id="descripcion-registro-gasto">Los importes se validan y guardan en su moneda original. Solo los pendientes admiten corrección.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(evento) => void enviar(evento)}>
          <div
            className={`grid gap-3 rounded-lg border border-dashed p-4 transition-colors ${arrastrandoArchivo ? 'border-acento bg-acento-suave' : 'border-borde-fuerte bg-superficie-2/50'}`}
            onDragOver={(evento) => { evento.preventDefault(); setArrastrandoArchivo(true); }}
            onDragLeave={() => setArrastrandoArchivo(false)}
            onDrop={(evento) => { evento.preventDefault(); seleccionarArchivo(evento.dataTransfer.files[0]); }}
          >
            <div className="grid gap-1">
              <Label htmlFor="gasto-comprobante">Comprobante (opcional)</Label>
              <p className="text-xs text-texto-secundario">Imagen o PDF hasta 10 MiB. El OCR admite imágenes hasta 5 MiB; guardar no requiere escanear.</p>
            </div>
            <Input id="gasto-comprobante" type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" onChange={(evento) => seleccionarArchivo(evento.target.files?.[0])} />
            {archivo ? <p className="text-xs text-texto-secundario" aria-live="polite">Archivo seleccionado: <span className="font-medium text-texto-primario">{archivo.name}</span></p> : null}
            {vistaPrevia && archivo?.type.startsWith('image/') ? <Image src={vistaPrevia} alt="Vista previa del comprobante seleccionado" width={320} height={160} unoptimized className="max-h-40 max-w-full rounded-md object-contain" /> : null}
            {vistaPrevia && archivo?.type === 'application/pdf' ? <a href={vistaPrevia} target="_blank" rel="noopener noreferrer" className="text-sm text-acento underline">Previsualizar PDF seleccionado</a> : null}
            {gastoEditar && (gastoEditar.comprobanteRuta || gastoEditar.comprobanteUrl) ? <Button type="button" variante="contorno" tamano="sm" onClick={() => onVerComprobante(gastoEditar)}>Ver comprobante guardado</Button> : null}
            <Button
              type="button"
              variante="secundario"
              tamano="lg"
              className="w-full"
              disabled={!archivo || archivo.type === 'application/pdf' || archivo.size > 5 * 1024 * 1024 || ocrEnCurso}
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
            <div className="grid gap-1">
              <Label htmlFor="gasto-orden-busqueda">Orden vinculada (opcional)</Label>
              <Input
                id="gasto-orden-busqueda"
                data-testid="gasto-orden-busqueda"
                value={busquedaOrden}
                onChange={(evento) => setBusquedaOrden(evento.target.value)}
                placeholder="Busca por folio (OP-…) o cliente"
              />
              <Select
                id="gasto-orden"
                data-testid="gasto-orden"
                value={ordenId}
                onChange={(evento) => setOrdenId(evento.target.value)}
                disabled={ordenesOpciones.isPending}
              >
                <option value="">Sin orden (indirecto)</option>
                {ordenId && !(ordenesOpciones.data ?? []).some((opcion) => opcion.id === ordenId) ? (
                  <option value={ordenId}>Orden seleccionada</option>
                ) : null}
                {(ordenesOpciones.data ?? []).map((opcion) => (
                  <option key={opcion.id} value={opcion.id}>
                    {opcion.etiqueta}
                  </option>
                ))}
              </Select>
              {ordenesOpciones.isError ? (
                <span role="alert" className="text-xs text-peligro-texto">
                  No se pudieron cargar las órdenes.
                </span>
              ) : null}
            </div>
            <div className="grid gap-1"><Label htmlFor="gasto-categoria">Categoría</Label><Select id="gasto-categoria" value={categoria} onChange={(evento) => setCategoria(evento.target.value)}>{categoria && !categoriasGasto.includes(categoria) ? <option value={categoria}>{categoria} (histórica)</option> : null}{categoriasGasto.map((item) => <option key={item} value={item}>{item}</option>)}</Select></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1"><Label htmlFor="gasto-tipo">Tipo de gasto</Label><Select id="gasto-tipo" value={tipoGasto} onChange={(evento) => setTipoGasto(evento.target.value as TipoGasto)}><option value="fijo">Fijo</option><option value="variable">Variable</option></Select></div>
            <div className="grid gap-1"><Label htmlFor="gasto-proveedor">Proveedor (opcional)</Label><Select id="gasto-proveedor" value={proveedorId} onChange={(evento) => setProveedorId(evento.target.value)}><option value="">Sin proveedor</option>{proveedorId && !proveedores.some((item) => item.id === proveedorId) ? <option value={proveedorId}>{gastoEditar?.proveedorNombre ?? 'Proveedor seleccionado'}</option> : null}{proveedores.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</Select></div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="gasto-cuenta">Cuenta de salida (opcional)</Label>
            <Select
              id="gasto-cuenta"
              value={cuentaBancariaId}
              onChange={(evento) => setCuentaBancariaId(evento.target.value)}
              disabled={cuentasBancarias.isPending}
            >
              <option value="">Sin especificar</option>
              {cuentaBancariaId && !(cuentasBancarias.data ?? []).some((cuenta) => cuenta.id === cuentaBancariaId) ? <option value={cuentaBancariaId}>Cuenta actual (no disponible)</option> : null}
              {(cuentasBancarias.data ?? []).map((cuenta) => (
                <option key={cuenta.id} value={cuenta.id}>{cuenta.etiqueta}</option>
              ))}
            </Select>
            {cuentasBancarias.isError ? (
              <span role="alert" className="text-xs text-peligro-texto">No se pudieron cargar las cuentas.</span>
            ) : null}
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
            <div className="grid gap-1"><Label htmlFor="gasto-metodo">Método de pago</Label><Select id="gasto-metodo" value={metodoPago} onChange={(evento) => setMetodoPago(evento.target.value as typeof metodoPago)}><option value="">Sin especificar</option>{METODOS_PAGO_GASTO.map((item) => <option key={item} value={item}>{item}</option>)}</Select></div>
          </div>
          <div className="grid gap-1"><Label htmlFor="gasto-notas">Notas</Label><Textarea id="gasto-notas" value={notas} onChange={(evento) => setNotas(evento.target.value)} /></div>
          {mensaje ? <p role="alert" className="text-sm text-peligro-texto">{mensaje}</p> : null}
          <DialogFooter><Button variante="contorno" type="button" onClick={() => onAbiertoChange(false)} disabled={procesando}>Cancelar</Button><Button type="submit" disabled={procesando}>{procesando ? 'Guardando…' : gastoEditar ? 'Guardar cambios' : 'Guardar gasto'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
