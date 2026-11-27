'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Input } from '@/compartido/componentes/ui/input';
import { formatearNumero } from '@/compartido/utilidades/formatear';
import {
  cerrarPausaHuerfanaAccion,
  obtenerDiagnosticoOrdenAccion,
} from '@/modulos/produccion/acciones/indice';
import {
  CLAVE_CONSUMOS_ORDEN,
  CLAVE_DIAGNOSTICO_ORDEN,
  CLAVE_TABLERO_PRODUCCION,
} from '@/modulos/produccion/componentes/claves-consulta';
import type { DiagnosticoOrdenItem } from '@/modulos/produccion/servicios/indice';

const ETIQUETA_CODIGO: Record<string, string> = {
  tiempo_real_desincronizado: 'Horas reales desincronizadas',
  produccion_excede_solicitada: 'Producción excede lo solicitado',
  meta_excede_piezas: 'Operación excede su meta',
  cantidad_producida_inconsistente: 'Cantidad producida inconsistente',
  produccion_sin_programacion: 'Producción sin operación programada',
  pausa_huerfana: 'Pausa pendiente de una orden terminada',
  sesion_vacia: 'Sesión vacía',
  sesion_activa_programacion_inoperable: 'Sesión activa sin operación',
  programacion_bloqueada_sin_sesion: 'Operación bloqueada sin sesión',
  consumo_material_pendiente: 'Consumo de material pendiente',
  orden_completada_sin_entrega: 'Entrega pendiente',
};

const CLASE_SEVERIDAD: Record<DiagnosticoOrdenItem['severidad'], string> = {
  alta: 'border-peligro/30 bg-peligro-suave text-peligro-texto',
  media: 'border-advertencia/30 bg-advertencia-suave text-advertencia-texto',
  baja: 'border-borde bg-superficie-2 text-texto-secundario',
};

export interface PropsPanelSaludOrden {
  ordenId: string;
  /** Compatibilidad: administrador implícito. Preferir los permisos reales. */
  esAdmin?: boolean;
  /** C31/A6: permiso real de la RPC que cierra pausas. */
  puedeGestionarProduccion?: boolean;
  /** C31/A6: permiso real para reabrir operaciones bloqueadas. */
  puedeGestionarPlaneacion?: boolean;
  /** En una orden concluida no se pueden crear programaciones ni consumos. */
  filtrarNoAccionables?: boolean;
  /** Abre el formulario de entrega que ya existe en la ficha de la orden. */
  onGenerarEntrega?: () => void;
}

/**
 * C23: panel de salud de una orden. Lista las inconsistencias accionables que
 * dejó el trabajo real (horas, cantidades, pausas atrapadas, material y
 * entrega) y permite al administrador cerrar pausas huérfanas sin inventar
 * piezas.
 */
export function PanelSaludOrden({
  ordenId,
  esAdmin = false,
  puedeGestionarProduccion = false,
  puedeGestionarPlaneacion = false,
  filtrarNoAccionables = false,
  onGenerarEntrega,
}: PropsPanelSaludOrden) {
  const enrutador = useRouter();
  const clienteConsultas = useQueryClient();
  const [pausaSeleccionada, setPausaSeleccionada] = useState<DiagnosticoOrdenItem | null>(null);
  const [conservarTiempo, setConservarTiempo] = useState(true);
  const [horasReales, setHorasReales] = useState('');
  const [motivo, setMotivo] = useState('');
  const [cerrando, setCerrando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null);

  const consulta = useQuery({
    queryKey: [...CLAVE_DIAGNOSTICO_ORDEN, ordenId],
    queryFn: async () => {
      const respuesta = await obtenerDiagnosticoOrdenAccion({ ordenId });
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'La consulta no devolvió datos' : respuesta.error);
      }
      return respuesta.datos;
    },
    staleTime: 30_000,
  });

  const incidencias = (consulta.data ?? []).filter((incidencia) => (
    !filtrarNoAccionables
    || !['produccion_sin_programacion', 'consumo_material_pendiente'].includes(incidencia.codigo)
  ));
  const abrirCierre = (incidencia: DiagnosticoOrdenItem) => {
    setPausaSeleccionada(incidencia);
    setConservarTiempo(true);
    setHorasReales('');
    setMotivo('');
    setMensaje(null);
  };
  const cerrarDialogo = () => {
    if (cerrando) return;
    setPausaSeleccionada(null);
    setMensaje(null);
  };

  const confirmarCierre = async () => {
    if (!pausaSeleccionada?.sesionId) return;
    const horas = horasReales.trim() === '' ? undefined : Number(horasReales.replace(',', '.'));
    if (horas !== undefined && (!Number.isFinite(horas) || horas <= 0)) {
      setMensaje({ tipo: 'error', texto: 'Indica horas reales válidas o déjalas vacías.' });
      return;
    }
    setCerrando(true);
    setMensaje(null);
    try {
      const respuesta = await cerrarPausaHuerfanaAccion({
        sesionId: pausaSeleccionada.sesionId,
        conservarTiempo,
        ...(horas !== undefined ? { horasReales: horas } : {}),
        ...(motivo.trim().length >= 3 ? { motivo: motivo.trim() } : {}),
      });
      if (!respuesta.exito) {
        setMensaje({ tipo: 'error', texto: respuesta.error });
        return;
      }
      setPausaSeleccionada(null);
      await Promise.all([
        consulta.refetch(),
        clienteConsultas.invalidateQueries({ queryKey: [...CLAVE_CONSUMOS_ORDEN, ordenId] }),
        clienteConsultas.invalidateQueries({ queryKey: CLAVE_TABLERO_PRODUCCION }),
      ]);
    } finally {
      setCerrando(false);
    }
  };

  return (
    <section
      aria-labelledby="titulo-salud-orden"
      className="rounded-lg border border-borde bg-superficie p-4"
      data-testid="panel-salud-orden"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="titulo-salud-orden" className="text-base font-semibold text-texto-primario">
            Salud de la orden
          </h2>
          <p className="mt-1 text-xs text-texto-secundario">
            Revisión de horas, cantidades, pausas, material y entrega. No modifica datos por sí sola.
          </p>
        </div>
        {consulta.isPending ? null : (
          <span className="rounded-full border border-borde px-2 py-0.5 text-xs text-texto-secundario">
            {incidencias.length === 0
              ? 'Sin inconsistencias'
              : `${incidencias.length} punto${incidencias.length === 1 ? '' : 's'} por revisar`}
          </span>
        )}
      </div>

      {consulta.isPending ? (
        <p className="mt-3 text-sm text-texto-secundario" role="status">Revisando la orden…</p>
      ) : consulta.isError ? (
        <div className="mt-3 flex flex-col items-start gap-2" role="alert">
          <p className="text-sm text-peligro-texto">No se pudo revisar la consistencia de la orden.</p>
          <Button type="button" variante="contorno" tamano="sm" onClick={() => void consulta.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : incidencias.length === 0 ? (
        <p className="mt-3 text-sm text-texto-secundario" data-testid="salud-orden-ok">
          Horas, cantidades, pausas y entregas coinciden con los registros de producción.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2" data-testid="lista-salud-orden">
          {incidencias.map((incidencia, indice) => (
            <li
              key={`${incidencia.codigo}-${incidencia.sesionId ?? incidencia.partidaId ?? indice}`}
              className="rounded-md border border-borde p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${CLASE_SEVERIDAD[incidencia.severidad]}`}>
                  {incidencia.severidad}
                </span>
                <strong className="text-sm text-texto-primario">
                  {ETIQUETA_CODIGO[incidencia.codigo] ?? incidencia.codigo}
                </strong>
                {incidencia.valorActual !== null && incidencia.valorEsperado !== null ? (
                  <span className="font-mono text-xs tabular-nums text-texto-secundario">
                    {formatearNumero(incidencia.valorActual, 2)} → {formatearNumero(incidencia.valorEsperado, 2)}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-texto-secundario">{incidencia.detalle}</p>
              {(() => {
                const permiso = incidencia.permisoRequerido;
                const puede = permiso === 'operador'
                  || (permiso === 'gestionar_produccion' && (puedeGestionarProduccion || esAdmin))
                  || (permiso === 'gestionar_planeacion' && puedeGestionarPlaneacion);
                if (!puede) {
                  return (
                    <p className="mt-2 text-xs text-texto-secundario" data-testid={`sin-permiso-${incidencia.codigo}`}>
                      {incidencia.textoAccion}. Necesitas permiso de {permiso === 'gestionar_planeacion' ? 'Planeación' : 'Producción'} para ejecutarlo.
                    </p>
                  );
                }
                if (incidencia.accionSugerida === 'cerrar_pausa' && incidencia.sesionId) {
                  return (
                    <Button
                      type="button"
                      variante="contorno"
                      tamano="sm"
                      className="mt-2"
                      data-testid={`accion-cerrar-pausa-${incidencia.sesionId}`}
                      onClick={() => abrirCierre(incidencia)}
                    >
                      {incidencia.textoAccion}
                    </Button>
                  );
                }
                if (incidencia.accionSugerida === 'generar_nota_entrega' && onGenerarEntrega) {
                  return (
                    <Button
                      type="button"
                      variante="fantasma"
                      tamano="sm"
                      className="mt-2"
                      data-testid={`accion-${incidencia.accionSugerida}-${incidencia.codigo}`}
                      onClick={onGenerarEntrega}
                    >
                      {incidencia.textoAccion}
                    </Button>
                  );
                }
                return (
                  <Button
                    type="button"
                    variante="fantasma"
                    tamano="sm"
                    className="mt-2"
                    data-testid={`accion-${incidencia.accionSugerida}-${incidencia.codigo}`}
                    onClick={() => enrutador.push(incidencia.destino)}
                  >
                    {incidencia.textoAccion}
                  </Button>
                );
              })()}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={pausaSeleccionada !== null} onOpenChange={(abierto) => (abierto ? undefined : cerrarDialogo())}>
        <DialogContent className="max-w-md" data-testid="cerrar-pausa-huerfana">
          <DialogHeader>
            <DialogTitle>Cerrar pausa de una orden terminada</DialogTitle>
            <DialogDescription>
              La orden ya terminó y este bloque de pausa quedó abierto. Elige qué hacer con su
              tiempo; las piezas ya registradas no cambian.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 flex flex-col gap-3 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="conservar-tiempo"
                checked={conservarTiempo}
                onChange={() => setConservarTiempo(true)}
              />
              <span>
                <span className="font-medium">Conservar el tiempo</span>
                <span className="block text-xs text-texto-secundario">
                  Suma las horas reales de la pausa al costo de la orden.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="conservar-tiempo"
                checked={!conservarTiempo}
                onChange={() => {
                  setConservarTiempo(false);
                  setHorasReales('');
                }}
              />
              <span>
                <span className="font-medium">Descartar el tiempo</span>
                <span className="block text-xs text-texto-secundario">
                  La pausa queda en el historial sin sumar horas ni costo.
                </span>
              </span>
            </label>

            {conservarTiempo ? (
              <label className="flex flex-col gap-1 text-xs text-texto-secundario">
                Horas reales (opcional)
                <Input
                  type="text"
                  inputMode="decimal"
                  value={horasReales}
                  placeholder="Ej. 1.5. Vacío conserva lo registrado."
                  onChange={(evento) => setHorasReales(evento.target.value)}
                />
              </label>
            ) : null}

            <label className="flex flex-col gap-1 text-xs text-texto-secundario">
              Motivo (opcional)
              <Input
                type="text"
                value={motivo}
                maxLength={500}
                placeholder="Ej. Pausa creada al completar la orden"
                onChange={(evento) => setMotivo(evento.target.value)}
              />
            </label>

            {mensaje ? (
              <p
                role="alert"
                className={mensaje.tipo === 'error' ? 'text-sm text-peligro-texto' : 'text-sm text-exito-texto'}
              >
                {mensaje.texto}
              </p>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button type="button" variante="fantasma" onClick={cerrarDialogo} disabled={cerrando}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void confirmarCierre()} disabled={cerrando}>
              {cerrando ? 'Cerrando…' : 'Cerrar pausa'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
