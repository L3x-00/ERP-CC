'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import {
  ajustarContinuidadFoliosAccion,
  obtenerContinuidadFoliosAccion,
} from '@/modulos/configuracion/acciones/continuidad-folios';

const CLAVE_CONTINUIDAD_FOLIOS = ['configuracion', 'continuidad-folios'] as const;

function periodoDesdeMes(mes: string): string | null {
  if (!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(mes)) return null;
  return `${mes.slice(5, 7)}${mes.slice(2, 4)}`;
}

export function PestanaFolios() {
  const consultas = useQueryClient();
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [propuesto, setPropuesto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const periodo = periodoDesdeMes(mes);

  const consulta = useQuery({
    queryKey: [...CLAVE_CONTINUIDAD_FOLIOS, periodo],
    queryFn: async () => {
      const resultado = await obtenerContinuidadFoliosAccion({ periodo });
      if (!resultado.exito || !resultado.datos) {
        throw new Error(resultado.exito ? 'No se recibieron folios' : resultado.error);
      }
      return resultado.datos;
    },
    enabled: periodo !== null,
    staleTime: 15_000,
  });
  const datos = consulta.data;
  const minimo = Math.max(datos?.ultimoContador ?? 0, datos?.ultimoEmitido ?? 0);

  async function ajustar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setMensaje(null);
    setErrorEnvio(null);
    const numero = Number(propuesto);
    if (!periodo || propuesto.trim() === '' || !Number.isInteger(numero) || numero < minimo || numero > 9999) {
      setErrorEnvio(`Indica un número entero entre ${minimo} y 9999`);
      return;
    }
    setGuardando(true);
    try {
      const resultado = await ajustarContinuidadFoliosAccion({ periodo, ultimo: numero });
      if (!resultado.exito || !resultado.datos) {
        setErrorEnvio(resultado.exito ? 'No se recibió el ajuste confirmado' : resultado.error);
        return;
      }
      setPropuesto('');
      setMensaje(`Continuidad guardada en ${resultado.datos.ultimo}; el siguiente folio será ${numero < 9999 ? numero + 1 : 'no disponible'}`);
      await consultas.invalidateQueries({ queryKey: CLAVE_CONTINUIDAD_FOLIOS });
    } catch {
      setErrorEnvio('No se pudo comunicar el ajuste; consulta el contador antes de reintentar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="grid gap-5" aria-labelledby="titulo-continuidad-folios" data-testid="continuidad-folios">
      <div>
        <h2 id="titulo-continuidad-folios" className="text-lg font-semibold text-texto-primario">Continuidad de folios CNC</h2>
        <p className="text-sm text-texto-secundario">
          Consulta un mes y adelanta el último número reservado para conservar los identificadores anteriores. El ajuste nunca reduce un número ya reservado o emitido.
        </p>
      </div>
      <div className="max-w-xs">
        <Label htmlFor="mes-continuidad-folios">Mes de folio</Label>
        <Input id="mes-continuidad-folios" type="month" min="2000-01" max="2099-12"
          value={mes} onChange={(evento) => { setMes(evento.target.value); setPropuesto(''); setMensaje(null); setErrorEnvio(null); }} />
      </div>
      {consulta.isPending && periodo ? <p className="text-sm text-texto-secundario">Consultando continuidad…</p> : null}
      {consulta.isError ? <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-borde bg-superficie-2 p-3 text-sm text-peligro-texto">
        <span>No se pudo consultar el periodo.</span>
        <Button type="button" variante="contorno" tamano="sm" onClick={() => void consulta.refetch()}>Reintentar</Button>
      </div> : null}
      {datos && periodo ? <>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-borde bg-superficie-2 p-3">
            <dt className="text-xs text-texto-secundario">Último reservado o ajustado</dt>
            <dd className="mt-1 font-mono text-lg font-semibold">{datos.ultimoContador}</dd>
          </div>
          <div className="rounded-md border border-borde bg-superficie-2 p-3">
            <dt className="text-xs text-texto-secundario">Último emitido en oportunidades</dt>
            <dd className="mt-1 font-mono text-lg font-semibold">{datos.ultimoEmitido}</dd>
          </div>
          <div className="rounded-md border border-borde bg-superficie-2 p-3">
            <dt className="text-xs text-texto-secundario">Siguiente identificador</dt>
            <dd className="mt-1 font-mono text-lg font-semibold">{datos.siguiente === null ? 'Periodo agotado' : `CNC-${periodo}-${String(datos.siguiente).padStart(4, '0')}`}</dd>
          </div>
        </dl>
        <form className="grid gap-2 sm:max-w-md" noValidate onSubmit={(evento) => void ajustar(evento)}>
          <Label htmlFor="ultimo-folio-ajustar">Establecer último número reservado</Label>
          <div className="flex flex-wrap items-end gap-2">
            <Input id="ultimo-folio-ajustar" type="number" min={minimo} max={9999} step={1}
              value={propuesto} onChange={(evento) => setPropuesto(evento.target.value)} className="min-w-32 flex-1" />
            <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar continuidad'}</Button>
          </div>
          <p className="text-xs text-texto-secundario">Solo se permite un valor igual o mayor a {minimo}. Ajustar no crea una oportunidad ni consume un folio.</p>
        </form>
      </> : null}
      {errorEnvio ? <p role="alert" className="text-sm text-peligro-texto">{errorEnvio}</p> : null}
      {mensaje ? <p role="status" className="text-sm text-exito-texto">{mensaje}</p> : null}
    </section>
  );
}
