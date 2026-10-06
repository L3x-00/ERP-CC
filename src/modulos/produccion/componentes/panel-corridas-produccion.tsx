'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/compartido/componentes/ui/dialog';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { formatearNumero } from '@/compartido/utilidades/formatear';
import { ETIQUETAS_ESTADO_CORRIDA, esEstadoCorridaTerminal } from '@/modulos/produccion/utilidades/indice';
import type { VerificacionInicio } from '@/modulos/produccion/tipos/indice';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';
import type { CatalogosPiso } from '@/modulos/produccion/acciones/consultas-b6';

import { crearCorridaAccion, iniciarCorridaAccion, completarCorridaAccion, cancelarCorridaAccion } from '../acciones/indice';
import { obtenerCorridasOrdenAccion } from '../acciones/consultas-b6';
import { DialogoChecklistInicio } from './dialogo-checklist-inicio';
import { CLAVE_CORRIDAS_ORDEN } from './claves-consulta';


/**
 * SII-B6.1: corridas de la orden seleccionada. Alta con ítems compatibles,
 * ciclo PLANIFICADA→EN_PROCESO→PAUSADA/COMPLETADA/CANCELADA por acciones.
 */
export function PanelCorridasProduccion({
  orden,
  catalogos,
  corridaSeleccionadaId,
  onSeleccionarCorrida,
  onOperarCorrida,
}: {
  orden: OrdenTableroProduccion | null;
  catalogos: CatalogosPiso | null;
  corridaSeleccionadaId: string | null;
  onSeleccionarCorrida: (corridaId: string | null) => void;
  onOperarCorrida: () => void;
}) {
  const clienteConsultas = useQueryClient();
  const [dialogoCrear, setDialogoCrear] = useState(false);
  const [procesoId, setProcesoId] = useState('');
  const [partidasMarcadas, setPartidasMarcadas] = useState<Record<string, boolean>>({});
  const [checklistCorrida, setChecklistCorrida] = useState<string | null>(null);
  const [cancelar, setCancelar] = useState<string | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const consulta = useQuery({
    queryKey: [...CLAVE_CORRIDAS_ORDEN, orden?.id ?? 'sin-orden'],
    queryFn: async () => {
      if (!orden) return [];
      const resultado = await obtenerCorridasOrdenAccion({ ordenId: orden.id });
      if (!resultado.exito || !resultado.datos) {
        throw new Error(resultado.exito ? 'La consulta no devolvi� datos' : resultado.error);
      }
      return resultado.datos;
    },
    enabled: orden !== null,
  });
  const corridas = consulta.data ?? [];

  const procesoSeleccionado = catalogos?.procesos.find((proceso) => proceso.id === procesoId)
    ?? catalogos?.procesos[0]
    ?? null;

  const partidasCompatibles = useMemo(() => orden?.partidas.map((partida) => {
    const pendiente = Math.max(0, Number(partida.cantidadSolicitada) - Number(partida.cantidadProducida));
    const compatible = !procesoSeleccionado
      ? false
      : !partida.procesos || partida.procesos.length === 0
        || partida.procesos.some((valor) => {
          const texto = valor.trim().toLowerCase();
          return texto === procesoSeleccionado.nombre.trim().toLowerCase()
            || texto === procesoSeleccionado.codigo.trim().toLowerCase();
        });
    return { partida, pendiente, compatible };
  }) ?? [], [orden, procesoSeleccionado]);

  function alternarPartida(partidaId: string): void {
    setPartidasMarcadas((previas) => ({ ...previas, [partidaId]: !previas[partidaId] }));
  }

  async function crearCorrida(): Promise<void> {
    if (!orden || !procesoSeleccionado) return;
    const items = partidasCompatibles
      .filter(({ partida, compatible, pendiente }) =>
        compatible && pendiente > 0 && partidasMarcadas[partida.id] === true)
      .map(({ partida, pendiente }) => ({ partidaId: partida.id, cantidad: pendiente }));
    if (items.length === 0) {
      setMensaje('Selecciona al menos una partida compatible con pendiente');
      return;
    }
    setProcesando(true);
    const resultado = await crearCorridaAccion({
      ordenId: orden.id,
      procesoId: procesoSeleccionado.id,
      items,
    });
    setProcesando(false);
    if (!resultado.exito) {
      setMensaje(resultado.error);
      return;
    }
    setMensaje(null);
    setDialogoCrear(false);
    setPartidasMarcadas({});
    await clienteConsultas.invalidateQueries({ queryKey: CLAVE_CORRIDAS_ORDEN });
  }

  async function confirmarInicioCorrida(verificacion: VerificacionInicio): Promise<{ exito: true } | { exito: false; error: string }> {
    if (!checklistCorrida) return { exito: false, error: 'Corrida inválida' };
    const resultado = await iniciarCorridaAccion({ corridaId: checklistCorrida, verificacion });
    if (!resultado.exito) return { exito: false, error: resultado.error };
    setMensaje('Corrida iniciada');
    setChecklistCorrida(null);
    await clienteConsultas.invalidateQueries({ queryKey: CLAVE_CORRIDAS_ORDEN });
    return { exito: true };
  }

  async function completar(corridaId: string): Promise<void> {
    setProcesando(true);
    const resultado = await completarCorridaAccion({ corridaId });
    setProcesando(false);
    setMensaje(resultado.exito ? 'Corrida completada' : resultado.error);
    await clienteConsultas.invalidateQueries({ queryKey: CLAVE_CORRIDAS_ORDEN });
  }

  async function confirmarCancelacion(): Promise<void> {
    if (!cancelar || motivoCancelar.trim().length < 3) return;
    setProcesando(true);
    const resultado = await cancelarCorridaAccion({ corridaId: cancelar, motivo: motivoCancelar.trim() });
    setProcesando(false);
    if (!resultado.exito) {
      setMensaje(resultado.error);
      return;
    }
    setMensaje('Corrida cancelada');
    setCancelar(null);
    setMotivoCancelar('');
    await clienteConsultas.invalidateQueries({ queryKey: CLAVE_CORRIDAS_ORDEN });
  }

  return (
    <section className="rounded-lg border border-borde bg-superficie p-4" data-testid="panel-corridas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-texto-primario">Corridas</h2>
        <Button
          type="button"
          tamano="sm"
          disabled={!orden || !catalogos || catalogos.procesos.length === 0}
          onClick={() => { setMensaje(null); setDialogoCrear(true); }}
          data-testid="crear-corrida"
        >
          Nueva corrida
        </Button>
      </div>

      {!orden && <p className="mt-2 text-sm text-texto-secundario">Selecciona una orden del Kanban.</p>}
      {orden && consulta.isLoading && <Skeleton className="mt-3 h-20" />}
      {mensaje !== null && <p role="status" className="mt-2 text-sm text-texto-primario">{mensaje}</p>}
      {orden && !consulta.isLoading && corridas.length === 0 && (
        <EstadoVacio
          titulo="Sin corridas"
          descripcion="Crea una corrida con partidas compatibles del mismo proceso; si inicias una sesión sin corrida se genera una automática."
        />
      )}

      {corridas.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3">
          {corridas.map((corrida) => (
            <li
              key={corrida.id}
              data-testid={`corrida-${corrida.codigo}`}
              className={
                corrida.id === corridaSeleccionadaId
                  ? 'rounded-md border border-acento bg-acento-suave/40 p-3'
                  : 'rounded-md border border-borde p-3'
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{corrida.codigo}</span>
                  <BadgeEstado estado={corrida.estado} etiqueta={ETIQUETAS_ESTADO_CORRIDA[corrida.estado]} />
                  <span className="text-xs text-texto-secundario">
                    {corrida.procesoNombre} · {formatearNumero(corrida.cantidadPlanificada)} planificadas
                    {corrida.requierePrimeraPieza ? ' · requiere primera pieza' : ''}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variante="contorno"
                    tamano="sm"
                    data-testid={`operar-corrida-${corrida.codigo}`}
                    onClick={() => { onSeleccionarCorrida(corrida.id); onOperarCorrida(); }}
                  >
                    Operar
                  </Button>
                  {corrida.estado === 'PLANIFICADA' || corrida.estado === 'PAUSADA' ? (
                    <Button
                      type="button"
                      variante="contorno"
                      tamano="sm"
                      disabled={procesando}
                      data-testid={`iniciar-corrida-${corrida.codigo}`}
                      onClick={() => { setMensaje(null); setChecklistCorrida(corrida.id); }}
                    >
                      Iniciar
                    </Button>
                  ) : null}
                  {corrida.estado === 'EN_PROCESO' || corrida.estado === 'PAUSADA' ? (
                    <Button
                      type="button"
                      variante="contorno"
                      tamano="sm"
                      disabled={procesando}
                      data-testid={`completar-corrida-${corrida.codigo}`}
                      onClick={() => void completar(corrida.id)}
                    >
                      Completar
                    </Button>
                  ) : null}
                  {!esEstadoCorridaTerminal(corrida.estado) ? (
                    <Button
                      type="button"
                      variante="destructivo"
                      tamano="sm"
                      disabled={procesando}
                      data-testid={`cancelar-corrida-${corrida.codigo}`}
                      onClick={() => { setMensaje(null); setCancelar(corrida.id); }}
                    >
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-texto-secundario">
                {corrida.items.map((item) => (
                  <li key={`${corrida.id}-${item.partidaId}`}>
                    <span className="font-mono">{item.codigoItem}</span>
                    {' · '}{item.partidaCodigo}
                    {' · '}{formatearNumero(item.cantidad)} en corrida
                    {' · '}producidas {formatearNumero(item.cantidadProducida)}/{formatearNumero(item.cantidadSolicitada)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogoCrear} onOpenChange={(valor) => !procesando && setDialogoCrear(valor)}>
        <DialogContent aria-label="Nueva corrida" data-testid="dialogo-crear-corrida">
          <DialogHeader>
            <DialogTitle>Nueva corrida</DialogTitle>
            <DialogDescription>
              Solo se agrupan partidas compatibles (misma orden, proceso y grupo de equipo).
            </DialogDescription>
          </DialogHeader>
          <label className="grid gap-1 text-sm font-medium" htmlFor="corrida-proceso">
            Proceso
            <Select
              id="corrida-proceso"
              data-testid="proceso-corrida"
              value={procesoSeleccionado?.id ?? ''}
              onChange={(evento) => { setProcesoId(evento.target.value); setPartidasMarcadas({}); }}
            >
              {(catalogos?.procesos ?? []).map((proceso) => (
                <option key={proceso.id} value={proceso.id}>{proceso.nombre} · {proceso.prefijoCorrida}</option>
              ))}
            </Select>
          </label>
          <fieldset className="grid gap-1 rounded-md border border-borde p-2">
            <legend className="px-1 text-sm font-medium">Partidas (cantidad pendiente)</legend>
            {partidasCompatibles.length === 0 && (
              <p className="text-sm text-texto-secundario">La orden no tiene partidas.</p>
            )}
            {partidasCompatibles.map(({ partida, pendiente, compatible }) => (
              <label
                key={partida.id}
                className="flex items-center justify-between gap-2 text-sm"
                htmlFor={`corrida-partida-${partida.id}`}
              >
                <span className="flex items-center gap-2">
                  <input
                    id={`corrida-partida-${partida.id}`}
                    data-testid={`partida-corrida-${partida.id}`}
                    type="checkbox"
                    disabled={!compatible || pendiente <= 0}
                    checked={partidasMarcadas[partida.id] === true}
                    onChange={() => alternarPartida(partida.id)}
                  />
                  {partida.codigoPieza}
                </span>
                <span className="text-xs text-texto-secundario">
                  {pendiente > 0 ? `${formatearNumero(pendiente)} pend` : 'sin pendiente'}
                  {!compatible ? ' · incompatible con el proceso' : ''}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button type="button" variante="contorno" disabled={procesando} onClick={() => setDialogoCrear(false)}>
              Cerrar
            </Button>
            <Button type="button" disabled={procesando} data-testid="confirmar-crear-corrida" onClick={() => void crearCorrida()}>
              {procesando ? 'Creando…' : 'Crear corrida'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DialogoChecklistInicio
        abierto={checklistCorrida !== null}
        procesando={procesando}
        titulo="Inicio de corrida"
        onAbiertoCambiar={(abierto) => { if (!abierto) setChecklistCorrida(null); }}
        onConfirmar={confirmarInicioCorrida}
      />

      <Dialog open={cancelar !== null} onOpenChange={(valor) => !valor && setCancelar(null)}>
        <DialogContent aria-label="Cancelar corrida">
          <DialogHeader>
            <DialogTitle>Cancelar corrida</DialogTitle>
            <DialogDescription>Exige motivo y se rechaza si ya hay producción finalizada.</DialogDescription>
          </DialogHeader>
          <label className="grid gap-1 text-sm font-medium" htmlFor="corrida-motivo-cancelar">
            Motivo
            <Input
              id="corrida-motivo-cancelar"
              value={motivoCancelar}
              maxLength={300}
              onChange={(evento) => setMotivoCancelar(evento.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variante="contorno" disabled={procesando} onClick={() => setCancelar(null)}>
              Volver
            </Button>
            <Button
              type="button"
              variante="destructivo"
              disabled={motivoCancelar.trim().length < 3 || procesando}
              data-testid="confirmar-cancelar-corrida"
              onClick={() => void confirmarCancelacion()}
            >
              Confirmar cancelación
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
