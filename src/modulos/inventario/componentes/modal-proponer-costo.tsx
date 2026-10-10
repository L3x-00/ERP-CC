'use client';

import { useState, type FormEvent } from 'react';

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
  FuentePropuestaCosto,
  MaterialCosto,
  MonedaCosto,
} from '../tipos/materiales-costos';

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Propone un costo a partir de una compra o gasto (C6.1/DC-13). No cambia el
 * maestro: queda pendiente hasta una confirmación autorizada.
 */
export function ModalProponerCosto({
  material,
  onCerrar,
}: {
  material: MaterialCosto;
  onCerrar: () => void;
}) {
  const { proponerCosto } = usarMutacionesCostosMateriales();
  const [costo, setCosto] = useState('');
  const [moneda, setMoneda] = useState<MonedaCosto>(material.monedaCosto);
  const [fechaEfectiva, setFechaEfectiva] = useState(hoy());
  const [fuente, setFuente] = useState<FuentePropuestaCosto>('COMPRA');
  const [referencia, setReferencia] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setMensaje(null);
    const costoNumero = Number(costo);
    if (costo.trim() === '' || !Number.isFinite(costoNumero) || costoNumero < 0) {
      setMensaje('Escribe un costo válido (mayor o igual a 0)');
      return;
    }
    const referenciaLimpia = referencia.trim();
    if (referenciaLimpia.length < 2) {
      setMensaje('La referencia debe tener al menos 2 caracteres');
      return;
    }
    setEnviando(true);
    try {
      await proponerCosto.mutateAsync({
        materialId: material.id,
        costo: costoNumero,
        moneda,
        fechaEfectiva,
        fuente,
        referencia: referenciaLimpia,
      });
      onCerrar();
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo proponer el costo');
    } finally {
      setEnviando(false);
    }
  }

  const costoActual =
    material.costoVigente === null
      ? 'sin costo confirmado'
      : `${formatearMoneda(material.costoVigente, material.monedaCosto, 4)} por ${material.unidadBase}`;

  return (
    <Dialog
      open
      onOpenChange={(valor) => {
        if (!valor) onCerrar();
      }}
    >
      <DialogContent aria-label={`Proponer costo de ${material.nombre}`}>
        <DialogHeader>
          <DialogTitle>Proponer costo — {material.nombre}</DialogTitle>
          <DialogDescription>
            Costo vigente: {costoActual}. La compra o gasto no cambia el maestro hasta que se
            confirme.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="flex flex-col gap-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="costo-propuesto">Costo propuesto</Label>
              <Input
                id="costo-propuesto"
                type="number"
                min="0"
                step="0.0001"
                value={costo}
                onChange={(evento) => setCosto(evento.target.value)}
                placeholder="0.0000"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="costo-moneda">Moneda</Label>
              <Select
                id="costo-moneda"
                value={moneda}
                onChange={(evento) => setMoneda(evento.target.value as MonedaCosto)}
              >
                <option value="MXN">MXN — Peso mexicano</option>
                <option value="USD">USD — Dólar estadounidense</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="costo-fecha">Fecha efectiva</Label>
              <Input
                id="costo-fecha"
                type="date"
                value={fechaEfectiva}
                onChange={(evento) => setFechaEfectiva(evento.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="costo-fuente">Origen</Label>
              <Select
                id="costo-fuente"
                value={fuente}
                onChange={(evento) => setFuente(evento.target.value as FuentePropuestaCosto)}
              >
                <option value="COMPRA">Compra</option>
                <option value="GASTO">Gasto</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="costo-referencia">Referencia</Label>
              <Input
                id="costo-referencia"
                value={referencia}
                onChange={(evento) => setReferencia(evento.target.value)}
                maxLength={120}
                placeholder="Folio o nota de la compra/gasto"
              />
            </div>
          </div>

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
              {enviando ? 'Proponiendo…' : 'Proponer costo'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
