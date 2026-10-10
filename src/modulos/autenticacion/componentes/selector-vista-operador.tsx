'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/compartido/componentes/ui/button';
import { Select, Textarea } from '@/compartido/componentes/ui/input';
import { iniciarVistaOperadorAccion } from '@/modulos/autenticacion/acciones/iniciar-vista-operador';

export type OperadorDelegable = { id: string; nombre: string };

export function SelectorVistaOperador({ operadores }: { operadores: OperadorDelegable[] }) {
  const router = useRouter();
  const [operadorId, setOperadorId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  async function entrar(): Promise<void> {
    if (procesando) return;
    setError(null);
    setProcesando(true);
    try {
      const respuesta = await iniciarVistaOperadorAccion({ operadorId, motivo });
      if (!respuesta.exito || !respuesta.datos) {
        setError(respuesta.exito ? 'No se pudo iniciar la vista' : respuesta.error);
        return;
      }
      router.push(respuesta.datos.ruta);
      router.refresh();
    } catch {
      setError('No se pudo iniciar la vista. Intenta de nuevo.');
    } finally {
      setProcesando(false);
    }
  }

  return (
    <section
      data-testid="selector-vista-operador"
      className="rounded-lg border border-borde bg-superficie p-4"
      aria-labelledby="titulo-vista-operador"
    >
      <div className="flex flex-col gap-1">
        <h2 id="titulo-vista-operador" className="text-base font-semibold text-texto-primario">
          Ver como operador
        </h2>
        <p className="text-sm text-texto-secundario">
          Revisa su trabajo durante 15 minutos. Esta vista no permite registrar producción.
        </p>
      </div>

      {operadores.length === 0 ? (
        <p className="mt-4 text-sm text-texto-secundario">No hay operadores activos.</p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] md:items-end">
          <label className="flex flex-col gap-1 text-sm font-medium text-texto-secundario" htmlFor="operador-delegado">
            Operador
            <Select
              id="operador-delegado"
              value={operadorId}
              onChange={(evento) => setOperadorId(evento.target.value)}
              disabled={procesando}
            >
              <option value="">Selecciona un operador</option>
              {operadores.map((operador) => (
                <option key={operador.id} value={operador.id}>{operador.nombre}</option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-texto-secundario" htmlFor="motivo-vista-operador">
            Motivo
            <Textarea
              id="motivo-vista-operador"
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Ej. revisar instrucciones del trabajo"
              disabled={procesando}
              maxLength={500}
              className="min-h-11"
            />
          </label>
          <Button
            type="button"
            tamano="lg"
            onClick={() => void entrar()}
            disabled={procesando || operadorId === '' || motivo.trim() === ''}
          >
            {procesando ? 'Abriendo...' : 'Abrir vista'}
          </Button>
        </div>
      )}
      {error ? <p role="alert" className="mt-3 text-sm font-medium text-peligro-texto">{error}</p> : null}
    </section>
  );
}
