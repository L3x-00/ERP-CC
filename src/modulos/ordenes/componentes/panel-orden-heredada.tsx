'use client';

import { useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { AdjuntosOrdenDialog } from '@/modulos/ordenes/componentes/adjuntos-orden-dialog';
import {
  CrearOrdenHeredadaDialog,
  type AreaOpcion,
  type ClienteOpcion,
} from '@/modulos/ordenes/componentes/crear-orden-heredada-dialog';
import { crearOrdenHeredadaAccion } from '@/modulos/ordenes/acciones/crear-orden-heredada';
import type { OrdenHistoricaCreada } from '@/modulos/ordenes/servicios/ordenes-servicio';

type Props = {
  clientes: ClienteOpcion[];
  areas: AreaOpcion[];
};

/** ORD-06: punto de entrada del alta heredada y sus adjuntos posteriores. */
export function PanelOrdenHeredada({ clientes, areas }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [ordenCreada, setOrdenCreada] = useState<OrdenHistoricaCreada | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-texto-secundario">
          El alta heredada es una excepción administrativa: crea una OP en Bandeja con su cuenta
          por cobrar no cobrable y no consume folios de cotización.
        </p>
        <Button
          type="button"
          variante="contorno"
          tamano="lg"
          data-testid="abrir-orden-heredada"
          onClick={() => { setMensaje(null); setAbierto(true); }}
        >
          Nueva orden heredada
        </Button>
      </div>
      {mensaje ? <p role="status" className="text-sm text-exito-texto">{mensaje}</p> : null}
      {abierto ? (
        <CrearOrdenHeredadaDialog
          clientes={clientes}
          areas={areas}
          alCrear={crearOrdenHeredadaAccion}
          onCerrar={() => setAbierto(false)}
          onCreada={(orden) => {
            setAbierto(false);
            setOrdenCreada(orden);
            setMensaje(`Orden ${orden.folio} creada con su cuenta por cobrar no cobrable.`);
          }}
        />
      ) : null}
      {ordenCreada ? (
        <AdjuntosOrdenDialog
          ordenId={ordenCreada.id}
          folio={ordenCreada.folio}
          onCerrar={() => setOrdenCreada(null)}
        />
      ) : null}
    </div>
  );
}
