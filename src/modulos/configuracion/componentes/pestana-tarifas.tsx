'use client';

import { useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { actualizarTipoCambioAccion, guardarTarifasCotizadorAccion } from '@/modulos/configuracion/acciones/indice';
import type { ConfiguracionSistema, TarifasCotizadorConfig } from '@/modulos/configuracion/tipos/indice';
import { EditorTarifasEstaciones } from '@/modulos/configuracion/componentes/editor-tarifas-estaciones';

const HORAS_VIGENCIA_TIPO_CAMBIO = 24;

/** Horas transcurridas desde una fecha ISO; `null` si la fecha es inválida. */
function horasTranscurridas(desde: string, ahora: number): number | null {
  const fecha = new Date(desde).getTime();
  if (!Number.isFinite(fecha)) return null;
  return (ahora - fecha) / (60 * 60 * 1000);
}

export interface PestanaTarifasProps {
  configuracion: ConfiguracionSistema;
  onGuardado: (configuracion: ConfiguracionSistema) => void;
}

export function PestanaTarifas({ configuracion, onGuardado }: PestanaTarifasProps) {
  const [tarifas, setTarifas] = useState<TarifasCotizadorConfig>(configuracion.tarifas);
  const [tipoCambio, setTipoCambio] = useState(String(configuracion.tipoCambioUsd));
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [ahora] = useState(() => Date.now());
  const antiguedadHoras = horasTranscurridas(configuracion.actualizadoEn, ahora);
  const tipoCambioObsoleto = antiguedadHoras !== null && antiguedadHoras > HORAS_VIGENCIA_TIPO_CAMBIO;

  const cambiarTarifa = (campo: keyof TarifasCotizadorConfig, valor: string): void => {
    const numero = Number(valor);
    setTarifas((actual) => ({ ...actual, [campo]: Number.isFinite(numero) ? numero : 0 }));
  };

  async function guardar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const tarifasRespuesta = await guardarTarifasCotizadorAccion(tarifas);
      if (!tarifasRespuesta.exito || !tarifasRespuesta.datos) {
        setMensaje(tarifasRespuesta.exito ? 'No se recibió la tarifa actualizada' : tarifasRespuesta.error);
        return;
      }
      const tipoCambioRespuesta = await actualizarTipoCambioAccion({ tipoCambioUsd: Number(tipoCambio) });
      if (!tipoCambioRespuesta.exito || !tipoCambioRespuesta.datos) {
        onGuardado(tarifasRespuesta.datos);
        setMensaje(tipoCambioRespuesta.exito ? 'Tarifas guardadas; el tipo de cambio no se actualizó' : tipoCambioRespuesta.error);
        return;
      }
      onGuardado(tipoCambioRespuesta.datos);
      setMensaje('Tarifas y tipo de cambio guardados');
    } catch {
      setMensaje('No se pudieron guardar las tarifas');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={guardar} aria-label="Tarifas del cotizador">
      <div className="rounded-lg border border-acento/30 bg-acento-suave p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-acento">Tipo de cambio vigente</p>
            <p className="text-2xl font-semibold tabular-nums text-texto-primario">
              {configuracion.tipoCambioUsd.toFixed(4)}
              <span className="ml-1 text-sm font-medium text-texto-secundario">MXN/USD</span>
            </p>
          </div>
          <p className="text-xs text-texto-secundario">Actualizado el {formatearFecha(configuracion.actualizadoEn)}</p>
        </div>
        {tipoCambioObsoleto ? (
          <p role="alert" className="mt-3 rounded-md bg-advertencia-suave px-3 py-2 text-sm font-medium text-advertencia-texto">
            El tipo de cambio lleva más de 24 horas sin actualizarse; revisa el valor antes de cotizar.
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-costo-hora">Costo por hora predeterminado (MXN)
          <Input id="configuracion-costo-hora" type="number" min="0" step="0.01" value={tarifas.costoHoraDefault} onChange={(e) => cambiarTarifa('costoHoraDefault', e.target.value)} required />
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-segundos-pierce">Segundos por pierce
          <Input id="configuracion-segundos-pierce" type="number" min="0.01" step="0.01" value={tarifas.segundosPorPierce} onChange={(e) => cambiarTarifa('segundosPorPierce', e.target.value)} required />
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-eficiencia-laser">Eficiencia láser (0–1)
          <Input id="configuracion-eficiencia-laser" type="number" min="0.01" max="1" step="0.01" value={tarifas.factorEficienciaLaser} onChange={(e) => cambiarTarifa('factorEficienciaLaser', e.target.value)} required />
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-merma-material">Factor de merma (0–1)
          <Input id="configuracion-merma-material" type="number" min="0" max="1" step="0.01" value={tarifas.factorMermaMaterial} onChange={(e) => cambiarTarifa('factorMermaMaterial', e.target.value)} required />
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-margen-utilidad">Margen predeterminado (%)
          <Input id="configuracion-margen-utilidad" type="number" min="0" max="100" step="0.01" value={tarifas.margenUtilidadDefault} onChange={(e) => cambiarTarifa('margenUtilidadDefault', e.target.value)} required />
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-tipo-cambio">Tipo de cambio USD/MXN
          <Input id="configuracion-tipo-cambio" data-testid="configuracion-tipo-cambio" type="number" min="0.0001" step="0.0001" value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} required />
        </label>
      </div>
      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold text-texto-primario">Tarifas por estación del cotizador</legend>
        <EditorTarifasEstaciones
          valor={tarifas.estaciones}
          onCambio={(estaciones) => setTarifas((actual) => ({ ...actual, estaciones }))}
          deshabilitado={guardando}
        />
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar tarifas y TC'}</Button>
        <output data-testid="configuracion-tipo-cambio-vigente" className="text-sm text-texto-secundario">Vigente: {configuracion.tipoCambioUsd.toFixed(4)} MXN/USD</output>
        {mensaje ? <p role="status" className="text-sm text-texto-secundario">{mensaje}</p> : null}
      </div>
    </form>
  );
}
