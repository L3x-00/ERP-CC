'use client';

import { useRef, useState, type FormEvent } from 'react';

import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { formatearMoneda } from '@/compartido/utilidades/formatear';

import { usarMutacionesCostosMateriales } from '../hooks/usar-mutaciones-costos-materiales';
import type {
  MaterialCosto,
  MonedaCosto,
  PropuestaCostoMaterial,
} from '../tipos/materiales-costos';
import { fechaLocalNegocio } from '@/compartido/utilidades/fecha-negocio';
import { formatearFechaDia } from '../utilidades/materiales-costos';

function hoy(): string {
  return fechaLocalNegocio();
}

type Props =
  | { modo: 'manual'; material: MaterialCosto; onCerrar: () => void }
  | {
      modo: 'propuesta';
      material: MaterialCosto;
      propuesta: PropuestaCostoMaterial;
      onCerrar: () => void;
    };

/**
 * Confirmación autorizada del costo (C6.1/DC-13): manual con captura directa o
 * de una propuesta de compra/gasto. Solo aquí cambia el maestro y se registra
 * la versión append-only del historial, con control de concurrencia (CAS).
 */
export function ModalConfirmarCosto(props: Props) {
  const { material, onCerrar } = props;
  const propuesta = props.modo === 'propuesta' ? props.propuesta : null;
  const { confirmarCosto, revaluarCostoConsumido } = usarMutacionesCostosMateriales();
  const [costo, setCosto] = useState(
    propuesta ? String(propuesta.costoPropuesto) : material.costoVigente === null ? '' : String(material.costoVigente),
  );
  const [moneda, setMoneda] = useState<MonedaCosto>(
    propuesta ? propuesta.moneda : material.monedaCosto,
  );
  const [fechaEfectiva, setFechaEfectiva] = useState(
    propuesta ? propuesta.fechaEfectiva : hoy(),
  );
  const [referencia, setReferencia] = useState('');
  const [recostear, setRecostear] = useState(false);
  const [motivoRecosteo, setMotivoRecosteo] = useState('');
  const [costoConfirmado, setCostoConfirmado] = useState<{ costo: number; moneda: MonedaCosto } | null>(null);
  const solicitudRecosteo = useRef<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aplicarRecosteo(costoNumero: number, monedaValor: MonedaCosto): Promise<boolean> {
    if (!solicitudRecosteo.current) solicitudRecosteo.current = crypto.randomUUID();
    try {
      await revaluarCostoConsumido.mutateAsync({
        materialId: material.id,
        costo: costoNumero,
        moneda: monedaValor,
        motivo: motivoRecosteo.trim(),
        solicitudId: solicitudRecosteo.current,
      });
      return true;
    } catch (error) {
      setCostoConfirmado({ costo: costoNumero, moneda: monedaValor });
      setMensaje(
        `El costo quedó confirmado, pero el recosteo falló: ${
          error instanceof Error ? error.message : 'error desconocido'
        }. Reintenta el recosteo.`,
      );
      return false;
    }
  }

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setMensaje(null);

    const motivoLimpio = motivoRecosteo.trim();
    if (recostear && motivoLimpio.length < 3) {
      setMensaje('Indica el motivo del recosteo (mínimo 3 caracteres)');
      return;
    }

    // Reintento del recosteo tras una confirmación ya aplicada.
    if (costoConfirmado) {
      setEnviando(true);
      try {
        const ok = await aplicarRecosteo(costoConfirmado.costo, costoConfirmado.moneda);
        if (ok) onCerrar();
      } finally {
        setEnviando(false);
      }
      return;
    }

    if (propuesta) {
      setEnviando(true);
      try {
        await confirmarCosto.mutateAsync({
          materialId: material.id,
          costo: propuesta.costoPropuesto,
          moneda: propuesta.moneda,
          fechaEfectiva: propuesta.fechaEfectiva,
          fuente: propuesta.fuente,
          referencia: propuesta.referencia,
          propuestaId: propuesta.id,
          actualizadoEn: material.actualizadoEn,
        });
        if (!recostear) {
          onCerrar();
          return;
        }
        const ok = await aplicarRecosteo(propuesta.costoPropuesto, propuesta.moneda);
        if (ok) onCerrar();
      } catch (error) {
        setMensaje(error instanceof Error ? error.message : 'No se pudo confirmar el costo');
      } finally {
        setEnviando(false);
      }
      return;
    }

    const costoNumero = Number(costo);
    if (costo.trim() === '' || !Number.isFinite(costoNumero) || costoNumero < 0) {
      setMensaje('Escribe un costo válido (mayor o igual a 0)');
      return;
    }
    const referenciaLimpia = referencia.trim();
    if (referenciaLimpia.length === 1) {
      setMensaje('La referencia debe tener al menos 2 caracteres o quedar vacía');
      return;
    }

    setEnviando(true);
    try {
      await confirmarCosto.mutateAsync({
        materialId: material.id,
        costo: costoNumero,
        moneda,
        fechaEfectiva,
        fuente: 'MANUAL',
        referencia: referenciaLimpia.length >= 2 ? referenciaLimpia : null,
        propuestaId: null,
        actualizadoEn: material.actualizadoEn,
      });
      if (!recostear) {
        onCerrar();
        return;
      }
      const ok = await aplicarRecosteo(costoNumero, moneda);
      if (ok) onCerrar();
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo confirmar el costo');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(valor) => {
        if (!valor) onCerrar();
      }}
    >
      <DialogContent aria-label={`Confirmar costo de ${material.nombre}`}>
        <DialogHeader>
          <DialogTitle>
            {propuesta ? 'Confirmar propuesta' : 'Registrar costo manual'} — {material.nombre}
          </DialogTitle>
          <DialogDescription>
            {propuesta
              ? 'Al confirmar, el costo vigente cambia y la propuesta pasa a confirmada. El historial no se modifica.'
              : 'El costo manual queda confirmado de inmediato y se agrega al historial de solo lectura.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="flex flex-col gap-3" noValidate>
          {propuesta ? (
            <dl className="grid gap-3 rounded-lg border border-borde bg-superficie-2 p-3 sm:grid-cols-2">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs font-medium text-texto-secundario">Costo propuesto</dt>
                <dd className="text-sm font-medium">
                  {formatearMoneda(propuesta.costoPropuesto, propuesta.moneda, 4)} por{' '}
                  {material.unidadBase}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs font-medium text-texto-secundario">Fecha efectiva</dt>
                <dd className="text-sm">{formatearFechaDia(propuesta.fechaEfectiva)}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs font-medium text-texto-secundario">Origen</dt>
                <dd className="text-sm">
                  {propuesta.fuente === 'COMPRA' ? 'Compra' : 'Gasto'}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs font-medium text-texto-secundario">Referencia</dt>
                <dd className="text-sm">{propuesta.referencia}</dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:col-span-2">
                <dt className="text-xs font-medium text-texto-secundario">Propuesta por</dt>
                <dd className="text-sm text-texto-secundario">{propuesta.propuestoPorNombre}</dd>
              </div>
            </dl>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="costo-manual">Costo</Label>
                <Input
                  id="costo-manual"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={costo}
                  onChange={(evento) => setCosto(evento.target.value)}
                  placeholder="0.0000"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="costo-manual-moneda">Moneda</Label>
                <Select
                  id="costo-manual-moneda"
                  value={moneda}
                  onChange={(evento) => setMoneda(evento.target.value as MonedaCosto)}
                >
                  <option value="MXN">MXN — Peso mexicano</option>
                  <option value="USD">USD — Dólar estadounidense</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="costo-manual-fecha">Fecha efectiva</Label>
                <Input
                  id="costo-manual-fecha"
                  type="date"
                  value={fechaEfectiva}
                  onChange={(evento) => setFechaEfectiva(evento.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="costo-manual-referencia">Referencia (opcional)</Label>
                <Input
                  id="costo-manual-referencia"
                  value={referencia}
                  onChange={(evento) => setReferencia(evento.target.value)}
                  maxLength={120}
                />
              </div>
            </div>
          )}

          {costoConfirmado ? (
            <p role="status" className="rounded-md bg-advertencia-suave px-3 py-2 text-sm text-advertencia-texto">
              El costo del catálogo ya quedó confirmado. Reintenta el recosteo para sustituir el
              costo provisional de los consumos ya registrados.
            </p>
          ) : (
            <div className="grid gap-3 rounded-lg border border-borde p-3">
              <label className="flex items-start gap-2 text-sm font-medium text-texto-primario">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={recostear}
                  onChange={(evento) => setRecostear(evento.target.checked)}
                  data-testid="recostear-consumos"
                />
                <span>
                  Sustituir el costo de los consumos ya registrados
                  <span className="block text-xs font-normal text-texto-secundario">
                    Actualiza el costo congelado de los consumos y retrabajos de este material
                    sin duplicarlos. Deja auditoría del cambio.
                  </span>
                </span>
              </label>
              {recostear ? (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="motivo-recosteo">Motivo del recosteo</Label>
                  <Input
                    id="motivo-recosteo"
                    maxLength={500}
                    value={motivoRecosteo}
                    onChange={(evento) => setMotivoRecosteo(evento.target.value)}
                    placeholder="Costo comprobado por factura o proveedor"
                    data-testid="motivo-recosteo"
                  />
                </div>
              ) : null}
            </div>
          )}

          {mensaje !== null && (
            <p role="alert" className="text-sm text-peligro-texto">
              {mensaje}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variante="contorno" tamano="sm" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" tamano="sm" disabled={enviando}>
              {enviando
                ? 'Procesando…'
                : costoConfirmado
                  ? 'Reintentar recosteo'
                  : propuesta
                    ? 'Confirmar propuesta'
                    : 'Confirmar costo'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
