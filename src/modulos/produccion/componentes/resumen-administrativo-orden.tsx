'use client';

import { useState } from 'react';

import { Button } from '@/compartido/componentes/ui/button';
import { Textarea } from '@/compartido/componentes/ui/input';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import type { CierreSupervisor } from '@/modulos/produccion/componentes/panel-operador-produccion';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/tablero-produccion-servicio';
import { horasTranscurridasSesion } from '@/modulos/produccion/utilidades/horas-extra';

type ResultadoPausa =
  | { exito: true; datos?: unknown }
  | { exito: false; error: string };

export interface PropsResumenAdministrativoOrden {
  orden: OrdenTableroProduccion;
  sesionActivaId: string | null;
  responsables: Readonly<Record<string, string>>;
  esAdmin: boolean;
  procesando: boolean;
  onPausarAdministrativa: (datos: CierreSupervisor) => Promise<ResultadoPausa>;
}

function textoHoras(horas: number): string {
  const totalMinutos = Math.max(0, Math.floor(horas * 60));
  const horasEnteras = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  return minutos === 0 ? `${horasEnteras} h` : `${horasEnteras} h ${minutos} min`;
}

/** Datos administrativos esenciales de la orden, sin repetir el panel del operador. */
export function ResumenAdministrativoOrden({
  orden,
  sesionActivaId,
  responsables,
  esAdmin,
  procesando,
  onPausarAdministrativa,
}: PropsResumenAdministrativoOrden) {
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);

  const partidas = orden.partidas ?? [];
  const solicitadas = partidas.reduce((total, partida) => total + Number(partida.cantidadSolicitada ?? 0), 0);
  const producidas = partidas.reduce((total, partida) => total + Number(partida.cantidadProducida ?? 0), 0);
  const entregadas = partidas.reduce((total, partida) => total + Number(partida.cantidadEntregada ?? 0), 0);
  const scrap = partidas.reduce((total, partida) => total + Number(partida.cantidadScrap ?? 0), 0);
  const horas = (orden.sesiones ?? []).reduce((total, sesion) => total + Number(sesion.horasNetas ?? 0), 0);
  const responsableId = partidas.find((partida) => partida.operadorAsignadoId)?.operadorAsignadoId;
  const responsable = responsableId ? responsables[responsableId] ?? 'Sin asignar' : 'Sin asignar';

  const sesion = (orden.sesiones ?? []).find(
    (item) => item.id === sesionActivaId && item.estadoSesion === 'activa',
  ) ?? null;
  const operadorEnPiso = sesion?.operadorId ? responsables[sesion.operadorId] ?? 'Operador' : null;

  const pausar = async (): Promise<void> => {
    if (!sesion || nota.trim().length < 3) return;
    const resultado = await onPausarAdministrativa({
      sesionId: sesion.id,
      piezasProducidas: Number(sesion.piezasProducidas ?? 0),
      estadoDestino: 'pausada',
      motivoPausa: 'PAUSA_ADMIN',
      notas: nota.trim(),
    });
    if (resultado.exito) {
      setNota('');
      setError(null);
    } else {
      setError(resultado.error);
    }
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-base border border-borde bg-superficie-2 p-3"
      aria-label="Resumen administrativo de la orden"
      data-testid="resumen-administrativo-orden"
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <p className="text-texto-secundario">Cliente</p>
          <p className="font-medium text-texto-primario">{orden.clienteNombre ?? 'Cliente'}</p>
        </div>
        <div>
          <p className="text-texto-secundario">Compromiso</p>
          <p className="font-medium text-texto-primario">
            {formatearFecha(orden.fechaCompromisoComercial ?? orden.fechaCompromiso)}
          </p>
        </div>
        <div>
          <p className="text-texto-secundario">Prioridad</p>
          <p className="font-medium text-texto-primario">{orden.prioridad}</p>
        </div>
        <div>
          <p className="text-texto-secundario">Responsable</p>
          <p className="font-medium text-texto-primario">{responsable}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-borde pt-2 text-xs sm:grid-cols-4">
        <div>
          <p className="text-texto-secundario">Avance</p>
          <p className="font-medium tabular-nums text-texto-primario" data-testid="resumen-avance-piezas">
            {producidas}/{solicitadas} piezas
          </p>
        </div>
        <div>
          <p className="text-texto-secundario">Entregadas</p>
          <p className="font-medium tabular-nums text-texto-primario">{entregadas}</p>
        </div>
        <div>
          <p className="text-texto-secundario">Scrap</p>
          <p className="font-medium tabular-nums text-texto-primario">{scrap}</p>
        </div>
        <div>
          <p className="text-texto-secundario">Horas registradas</p>
          <p className="font-medium tabular-nums text-texto-primario">{horas.toFixed(2)} h</p>
        </div>
      </div>

      {sesion && operadorEnPiso ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-borde pt-2 text-xs sm:grid-cols-4">
          <div>
            <p className="text-texto-secundario">Operando ahora</p>
            <p className="font-medium text-texto-primario" data-testid="resumen-operando-ahora">
              {operadorEnPiso}
            </p>
          </div>
          <div>
            <p className="text-texto-secundario">Inicio</p>
            <p className="font-medium tabular-nums text-texto-primario" data-testid="resumen-inicio-sesion">
              {formatearFecha(sesion.fechaInicio)}
            </p>
          </div>
          <div>
            <p className="text-texto-secundario">Tiempo transcurrido</p>
            <p className="font-medium tabular-nums text-texto-primario" data-testid="resumen-tiempo-sesion">
              {textoHoras(horasTranscurridasSesion(sesion.fechaInicio, new Date()))}
            </p>
          </div>
          <div>
            <p className="text-texto-secundario">Piezas de la sesión</p>
            <p className="font-medium tabular-nums text-texto-primario" data-testid="resumen-piezas-sesion">
              {Number(sesion.piezasProducidas ?? 0)}
            </p>
          </div>
        </div>
      ) : null}

      {esAdmin && sesion ? (
        <div className="flex flex-col gap-2 border-t border-borde pt-2">
          <Textarea
            aria-label="Motivo de la pausa administrativa"
            placeholder="¿Por qué se detiene la operación?"
            value={nota}
            onChange={(evento) => { setNota(evento.target.value); setError(null); }}
            maxLength={1000}
            rows={2}
            data-testid="pausa-administrativa-nota"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variante="contorno"
              tamano="sm"
              disabled={procesando || nota.trim().length < 3}
              onClick={() => void pausar()}
              data-testid="pausar-administrativamente"
            >
              Pausar por administración
            </Button>
            <p className="text-xs text-texto-secundario">
              El operador verá el motivo y no podrá reanudar hasta que Planeación lo autorice.
            </p>
          </div>
          {error ? <p role="alert" className="text-xs text-peligro-texto">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
