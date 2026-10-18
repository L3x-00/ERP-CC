'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Input } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { crearOrdenBasadaEnAnteriorAccion } from '@/modulos/ordenes/acciones/crear-orden-basada-anterior';

function fechaCompromisoInicial(): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + 30);
  return fecha.toISOString().slice(0, 10);
}

/** C8.6/O-03 B: confirma una nueva OP técnica sin copiar importes ni CxC. */
export function CrearOrdenBasadaEnAnteriorDialog({
  abierto,
  ordenOrigenId,
  folioOrigen,
  onCerrar,
}: {
  abierto: boolean;
  ordenOrigenId: string;
  folioOrigen: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [fechaCompromiso, setFechaCompromiso] = useState(fechaCompromisoInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(): Promise<void> {
    if (!fechaCompromiso) {
      setError('Indica la fecha de compromiso de la nueva orden');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const respuesta = await crearOrdenBasadaEnAnteriorAccion({
        ordenOrigenId,
        fechaCompromiso: `${fechaCompromiso}T18:00:00.000Z`,
      });
      if (!respuesta.exito) {
        setError(respuesta.error ?? 'No se pudo crear la orden basada en la anterior');
        return;
      }
      if (!respuesta.datos) {
        setError('No se pudo crear la orden basada en la anterior');
        return;
      }
      router.push(`/ordenes/${respuesta.datos.id}`);
    } catch {
      setError('No se pudo crear la orden basada en la anterior. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(nuevoAbierto) => {
      if (!nuevoAbierto && !guardando) onCerrar();
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva orden basada en {folioOrigen}</DialogTitle>
          <DialogDescription>
            Crea una OP con folio propio y copia solo datos técnicos. No copia precios ni cuentas por cobrar.
          </DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-sm text-peligro-texto">{error}</p> : null}
        <div className="flex flex-col gap-1">
          <Label htmlFor="orden-basada-fecha-compromiso">Fecha de compromiso</Label>
          <Input
            id="orden-basada-fecha-compromiso"
            data-testid="orden-basada-fecha-compromiso"
            type="date"
            value={fechaCompromiso}
            onChange={(evento) => setFechaCompromiso(evento.target.value)}
            disabled={guardando}
          />
        </div>
        <DialogFooter>
          <Button type="button" variante="contorno" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button
            type="button"
            data-testid="confirmar-orden-basada"
            onClick={() => void crear()}
            disabled={guardando || !fechaCompromiso}
          >
            {guardando ? 'Creando…' : 'Crear nueva orden'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
