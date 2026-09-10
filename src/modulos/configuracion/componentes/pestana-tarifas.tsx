'use client';

import { useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import { actualizarTipoCambioAccion, guardarTarifasCotizadorAccion } from '@/modulos/configuracion/acciones/indice';
import type { ConfiguracionSistema, TarifasCotizadorConfig } from '@/modulos/configuracion/tipos/indice';

export interface PestanaTarifasProps {
  configuracion: ConfiguracionSistema;
  onGuardado: (configuracion: ConfiguracionSistema) => void;
}

export function PestanaTarifas({ configuracion, onGuardado }: PestanaTarifasProps) {
  const [tarifas, setTarifas] = useState<TarifasCotizadorConfig>(configuracion.tarifas);
  const [tipoCambio, setTipoCambio] = useState(String(configuracion.tipoCambioUsd));
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

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
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar tarifas y TC'}</Button>
        <output data-testid="configuracion-tipo-cambio-vigente" className="text-sm text-foreground/70">Vigente: {configuracion.tipoCambioUsd.toFixed(4)} MXN/USD</output>
        {mensaje ? <p role="status" className="text-sm text-foreground/70">{mensaje}</p> : null}
      </div>
    </form>
  );
}
