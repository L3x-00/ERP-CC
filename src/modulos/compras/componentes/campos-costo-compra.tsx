'use client';

import { useState } from 'react';

import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { asignarRubroCostoCompraAccion } from '@/modulos/compras/acciones/asignar-rubro-costo-compra';
import type {
  CompraCola,
  MaterialOpcion,
  RubroCostoCompra,
  UltimoCostoMaterial,
} from '@/modulos/compras/tipos/indice';
import {
  ETIQUETA_RUBRO_COSTO_COMPRA,
  RUBROS_COSTO_COMPRA,
  describirNivelCosto,
} from '@/modulos/compras/utilidades/indice';

export interface ValoresCostoCompra {
  rubroCosto: RubroCostoCompra | '';
  concepto: string;
  materialId: string;
  cantidad: string;
  unidad: string;
  costoUnitario: string;
}

export function CamposCostoCompra({
  valores,
  materiales,
  ultimosCostos,
  onCambiar,
}: {
  valores: ValoresCostoCompra;
  materiales: MaterialOpcion[];
  ultimosCostos: Record<string, UltimoCostoMaterial>;
  onCambiar: (parcial: Partial<ValoresCostoCompra>) => void;
}) {
  const ultimoCosto = valores.materialId === '' ? null : ultimosCostos[valores.materialId];

  return (
    <>
      <label className="grid gap-1 text-sm font-medium">
        Rubro de costo (obligatorio con Orden)
        <Select
          className="min-h-11"
          data-testid="compra-rubro-costo"
          value={valores.rubroCosto}
          onChange={(evento) => onCambiar({ rubroCosto: evento.target.value as RubroCostoCompra | '' })}
        >
          <option value="">Sin clasificar</option>
          {RUBROS_COSTO_COMPRA.map((rubro) => (
            <option key={rubro} value={rubro}>{ETIQUETA_RUBRO_COSTO_COMPRA[rubro]}</option>
          ))}
        </Select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Concepto del bien o servicio (opcional)
        <Input
          className="min-h-11"
          maxLength={200}
          data-testid="compra-concepto"
          value={valores.concepto}
          onChange={(evento) => onCambiar({ concepto: evento.target.value })}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Material del catálogo (opcional)
        <Select
          className="min-h-11"
          data-testid="compra-material"
          value={valores.materialId}
          onChange={(evento) => onCambiar({ materialId: evento.target.value })}
        >
          <option value="">Sin material del catálogo</option>
          {materiales.map((material) => (
            <option key={material.id} value={material.id}>
              {material.codigo} · {material.nombre}
            </option>
          ))}
        </Select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Cantidad (opcional)
        <Input
          type="number"
          min="0.0001"
          step="0.0001"
          className="min-h-11"
          data-testid="compra-cantidad"
          value={valores.cantidad}
          onChange={(evento) => onCambiar({ cantidad: evento.target.value })}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Unidad (opcional)
        <Input
          className="min-h-11"
          maxLength={40}
          placeholder="PZA, KG, M…"
          data-testid="compra-unidad"
          value={valores.unidad}
          onChange={(evento) => onCambiar({ unidad: evento.target.value })}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Costo unitario sin IVA (opcional)
        <Input
          type="number"
          min="0"
          step="0.0001"
          className="min-h-11"
          data-testid="compra-costo-unitario"
          value={valores.costoUnitario}
          onChange={(evento) => onCambiar({ costoUnitario: evento.target.value })}
        />
      </label>
      <p className="text-xs text-texto-secundario sm:col-span-2" data-testid="compra-costo-ayuda">
        El detalle de material es solo un registro: no mueve inventario ni actualiza el maestro de costos.
        {ultimoCosto !== undefined && ultimoCosto !== null
          ? ` Último costo registrado en compras: ${formatearMoneda(ultimoCosto.costo, ultimoCosto.moneda)}.`
          : ''}
      </p>
    </>
  );
}

/** C10.1/F06: el nivel de costo solo se muestra si la compra tiene Orden. */
export function AvisoNivelCosto({ compra }: { compra: CompraCola }) {
  if (!compra.ordenId) return null;
  return (
    <p className="text-xs text-texto-secundario" data-testid="compra-nivel-costo">
      {describirNivelCosto(compra.estado)} Rubro: {compra.rubroCosto
        ? ETIQUETA_RUBRO_COSTO_COMPRA[compra.rubroCosto]
        : 'sin clasificar'}.
    </p>
  );
}

/** C10.1/F09: clasificación manual de una compra histórica con Orden y sin rubro. */
export function ClasificarRubroCompra({
  compra,
  onExito,
}: {
  compra: CompraCola;
  onExito: (texto: string) => void;
}) {
  const [rubro, setRubro] = useState<RubroCostoCompra | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(): Promise<void> {
    if (rubro === '') return;
    setOcupado(true);
    setError(null);
    const respuesta = await asignarRubroCostoCompraAccion({ compraId: compra.id, rubroCosto: rubro });
    setOcupado(false);
    if (!respuesta.exito) {
      setError(respuesta.error);
      return;
    }
    onExito(`Rubro asignado: ${ETIQUETA_RUBRO_COSTO_COMPRA[rubro]}.`);
  }

  return (
    <div className="grid gap-2 rounded-md border border-borde p-3" data-testid="compra-clasificar-rubro">
      <p className="text-sm font-medium">Esta compra histórica tiene Orden y no tiene rubro.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm font-medium">
          Rubro de costo
          <Select
            className="min-h-11"
            data-testid="compra-rubro-historico"
            value={rubro}
            onChange={(evento) => setRubro(evento.target.value as RubroCostoCompra | '')}
          >
            <option value="">Selecciona un rubro</option>
            {RUBROS_COSTO_COMPRA.map((opcion) => (
              <option key={opcion} value={opcion}>{ETIQUETA_RUBRO_COSTO_COMPRA[opcion]}</option>
            ))}
          </Select>
        </label>
        <Button
          type="button"
          variante="contorno"
          disabled={ocupado || rubro === ''}
          data-testid="confirmar-rubro-historico"
          onClick={() => void enviar()}
        >
          {ocupado ? 'Clasificando…' : 'Clasificar'}
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm text-peligro-texto">{error}</p> : null}
    </div>
  );
}
