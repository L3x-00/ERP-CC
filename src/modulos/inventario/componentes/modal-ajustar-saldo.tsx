'use client';

import { useState, type FormEvent } from 'react';

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
import { Label } from '@/compartido/componentes/ui/label';

import { usarMutacionesCostosMateriales } from '../hooks/usar-mutaciones-costos-materiales';
import type { MaterialCosto, SaldoMaterial } from '../tipos/materiales-costos';

/**
 * Obs. cliente 2026-10-13 (8): ajuste manual de existencia. El saldo nuevo se
 * fija por RPC atómica y queda su movimiento en el historial con motivo y
 * actor; el consumo de las órdenes no descuenta.
 */
export function ModalAjustarSaldo({
  materiales,
  saldos,
  inicial,
  onCerrar,
}: {
  materiales: readonly MaterialCosto[];
  saldos: readonly SaldoMaterial[];
  inicial?: { materialId: string; espesorId: string | null } | null;
  onCerrar: () => void;
}) {
  const { ajustarSaldo } = usarMutacionesCostosMateriales();
  const materialesActivos = materiales.filter((material) => material.activo);
  const [materialId, setMaterialId] = useState(
    inicial?.materialId ?? materialesActivos[0]?.id ?? materiales[0]?.id ?? '',
  );
  const [espesorId, setEspesorId] = useState(inicial?.espesorId ?? '');
  const [saldo, setSaldo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const material = materiales.find((candidato) => candidato.id === materialId) ?? null;
  const espesoresActivos = (material?.espesores ?? []).filter((espesor) => espesor.activo);
  const saldoActual =
    saldos.find(
      (fila) =>
        fila.materialId === materialId && (fila.espesorId ?? '') === (espesorId || ''),
    )?.saldo ?? 0;

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (enviando) return;
    setMensaje(null);
    if (!materialId) {
      setMensaje('Selecciona un material');
      return;
    }
    const saldoNumero = Number(saldo);
    if (saldo.trim() === '' || !Number.isFinite(saldoNumero) || saldoNumero < 0) {
      setMensaje('Escribe un saldo válido (mayor o igual a 0)');
      return;
    }
    if (motivo.trim().length < 3) {
      setMensaje('El motivo debe tener al menos 3 caracteres');
      return;
    }

    setEnviando(true);
    try {
      await ajustarSaldo.mutateAsync({
        materialId,
        espesorId: espesorId || null,
        saldo: saldoNumero,
        motivo: motivo.trim(),
      });
      onCerrar();
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo ajustar el saldo');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(valor) => (!valor && !enviando ? onCerrar() : undefined)}>
      <DialogContent data-testid="modal-ajustar-saldo" aria-label="Ajustar existencia">
        <DialogHeader>
          <DialogTitle>Ajustar existencia</DialogTitle>
          <DialogDescription>
            Fija el saldo manual del material (y espesor, si aplica). Cada ajuste queda en el
            historial con su motivo; el consumo de las órdenes no descuenta.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2" noValidate>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ajuste-material">Material</Label>
            <Select
              id="ajuste-material"
              value={materialId}
              onChange={(evento) => {
                setMaterialId(evento.target.value);
                setEspesorId('');
              }}
            >
              {materialesActivos.map((candidato) => (
                <option key={candidato.id} value={candidato.id}>
                  {candidato.codigo} · {candidato.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ajuste-espesor">Espesor (opcional)</Label>
            <Select
              id="ajuste-espesor"
              value={espesorId}
              onChange={(evento) => setEspesorId(evento.target.value)}
            >
              <option value="">Sin espesor</option>
              {espesoresActivos.map((espesor) => (
                <option key={espesor.id} value={espesor.id}>
                  {espesor.etiqueta}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ajuste-saldo">Saldo nuevo</Label>
            <Input
              id="ajuste-saldo"
              type="number"
              min={0}
              step={0.0001}
              value={saldo}
              onChange={(evento) => setSaldo(evento.target.value)}
              placeholder={String(saldoActual)}
              required
            />
            <span className="text-xs text-texto-secundario">
              Saldo actual: {saldoActual} {material?.unidadBase ?? ''}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ajuste-motivo">Motivo</Label>
            <Input
              id="ajuste-motivo"
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              maxLength={300}
              placeholder="Conteo físico, merma, corrección…"
              required
            />
          </div>

          {mensaje !== null && (
            <p role="alert" className="text-sm text-peligro-texto sm:col-span-2">
              {mensaje}
            </p>
          )}

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variante="contorno" onClick={onCerrar} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Ajustando…' : 'Ajustar saldo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
