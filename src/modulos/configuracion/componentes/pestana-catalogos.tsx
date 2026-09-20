'use client';

import { useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import {
  TIERS_CLIENTE,
  type CatalogoTiers,
  type TierCliente,
} from '@/modulos/clientes/tipos/indice';
import { ETIQUETA_TIER } from '@/modulos/clientes/utilidades/indice';
import {
  guardarCatalogoCategoriasAccion,
  guardarCatalogoTiersAccion,
} from '@/modulos/configuracion/acciones/indice';
import type { ConfiguracionSistema } from '@/modulos/configuracion/tipos/indice';

const FORMATO_CATEGORIA = /^[a-z0-9_]{2,40}$/;

export interface PestanaCatalogosProps {
  configuracion: ConfiguracionSistema;
  onGuardado: (configuracion: ConfiguracionSistema) => void;
}

export function PestanaCatalogos({ configuracion, onGuardado }: PestanaCatalogosProps) {
  const [tiers, setTiers] = useState<CatalogoTiers>(configuracion.tiers);
  const [categorias, setCategorias] = useState<readonly string[]>(configuracion.categoriasGasto);
  const [nuevaCategoria, setNuevaCategoria] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cambiarTier = (
    clave: TierCliente,
    campo: 'umbralMxn' | 'descuentoPorcentaje',
    valor: string,
  ): void => {
    const numero = Number(valor);
    setTiers((actual) => ({
      ...actual,
      tiers: {
        ...actual.tiers,
        [clave]: { ...actual.tiers[clave], [campo]: Number.isFinite(numero) ? numero : 0 },
      },
    }));
  };

  async function guardarTiers(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const respuesta = await guardarCatalogoTiersAccion({
        diasManual: tiers.diasManual,
        tiers: TIERS_CLIENTE.map((clave) => ({ clave, ...tiers.tiers[clave] })),
      });
      if (!respuesta.exito || !respuesta.datos) {
        setMensaje(respuesta.exito ? 'No se recibió el catálogo actualizado' : respuesta.error);
        return;
      }
      setTiers(respuesta.datos.tiers);
      onGuardado(respuesta.datos);
      setMensaje('Tiers guardados');
    } catch {
      setMensaje('No se pudieron guardar los tiers');
    } finally {
      setGuardando(false);
    }
  }

  function agregarCategoria(): void {
    const valor = nuevaCategoria.trim();
    if (!FORMATO_CATEGORIA.test(valor) || categorias.includes(valor)) {
      setMensaje('Usa minúsculas, números y guion bajo (2 a 40 caracteres), sin repetir');
      return;
    }
    setCategorias([...categorias, valor]);
    setNuevaCategoria('');
    setMensaje(null);
  }

  function quitarCategoria(valor: string): void {
    setCategorias(categorias.filter((item) => item !== valor));
  }

  async function guardarCategorias(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const respuesta = await guardarCatalogoCategoriasAccion({ categorias });
      if (!respuesta.exito || !respuesta.datos) {
        setMensaje(respuesta.exito ? 'No se recibió el catálogo actualizado' : respuesta.error);
        return;
      }
      setCategorias(respuesta.datos.categoriasGasto);
      onGuardado(respuesta.datos);
      setMensaje('Categorías guardadas');
    } catch {
      setMensaje('No se pudieron guardar las categorías');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form
        className="grid content-start gap-3"
        onSubmit={(evento) => void guardarTiers(evento)}
        aria-label="Catálogo de tiers"
      >
        <div>
          <h2 className="text-base font-semibold text-texto-primario">Tiers comerciales</h2>
          <p className="text-xs text-texto-secundario">
            Umbral de consumo (MXN, últimos 3 meses) y descuento informativo por tier. La vigencia
            aplica cuando un admin asigna un tier manual.
          </p>
        </div>
        <label className="grid gap-1 text-sm font-medium" htmlFor="catalogo-dias-manual">
          Vigencia del tier manual (días)
          <Input
            id="catalogo-dias-manual"
            data-testid="catalogo-dias-manual"
            type="number"
            min="1"
            max="3650"
            step="1"
            value={tiers.diasManual}
            onChange={(evento) =>
              setTiers((actual) => ({ ...actual, diasManual: Number(evento.target.value) || 1 }))
            }
            required
          />
        </label>
        <div className="grid gap-2">
          {TIERS_CLIENTE.map((clave) => (
            <div key={clave} className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
              <span className="text-sm font-medium">{ETIQUETA_TIER[clave]}</span>
              <label className="grid gap-1 text-xs text-texto-secundario">
                Umbral MXN
                <Input
                  data-testid={`catalogo-umbral-${clave}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={tiers.tiers[clave].umbralMxn}
                  onChange={(evento) => cambiarTier(clave, 'umbralMxn', evento.target.value)}
                  required
                />
              </label>
              <label className="grid gap-1 text-xs text-texto-secundario">
                Descuento %
                <Input
                  data-testid={`catalogo-descuento-${clave}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={tiers.tiers[clave].descuentoPorcentaje}
                  onChange={(evento) => cambiarTier(clave, 'descuentoPorcentaje', evento.target.value)}
                  required
                />
              </label>
            </div>
          ))}
        </div>
        <div>
          <Button type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar tiers'}
          </Button>
        </div>
      </form>
      <form
        className="grid content-start gap-3"
        onSubmit={(evento) => void guardarCategorias(evento)}
        aria-label="Catálogo de categorías de gasto"
      >
        <div>
          <h2 className="text-base font-semibold text-texto-primario">Categorías de gasto</h2>
          <p className="text-xs text-texto-secundario">
            El catálogo alimenta el registro y los filtros de gastos; los gastos históricos
            conservan su categoría aunque se retire del catálogo.
          </p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {categorias.map((item) => (
            <li
              key={item}
              className="inline-flex items-center gap-1 rounded-full border border-borde bg-superficie-2 px-3 py-1 text-sm"
            >
              {item}
              <button
                type="button"
                className="text-texto-secundario hover:text-peligro-texto"
                aria-label={`Quitar ${item}`}
                onClick={() => quitarCategoria(item)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-end gap-2">
          <label className="grid flex-1 gap-1 text-sm font-medium" htmlFor="catalogo-nueva-categoria">
            Nueva categoría
            <Input
              id="catalogo-nueva-categoria"
              data-testid="catalogo-nueva-categoria"
              value={nuevaCategoria}
              onChange={(evento) => setNuevaCategoria(evento.target.value)}
              placeholder="p. ej. acero_inoxidable"
            />
          </label>
          <Button type="button" variante="secundario" onClick={agregarCategoria}>
            Agregar
          </Button>
        </div>
        <div>
          <Button type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar categorías'}
          </Button>
        </div>
      </form>
      {mensaje ? (
        <p
          role="status"
          data-testid="catalogo-confirmacion"
          className="text-sm text-texto-secundario xl:col-span-2"
        >
          {mensaje}
        </p>
      ) : null}
    </div>
  );
}
