'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/compartido/componentes/ui/dialog';
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { formatearFecha, formatearHora } from '@/compartido/utilidades/formatear';
import { ETIQUETAS_TIPO_INSPECCION, referenciasLotePermitidas } from '@/modulos/produccion/utilidades/indice';
import type { TipoInspeccion } from '@/modulos/produccion/tipos/corridas';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';

import { registrarInspeccionAccion } from '../acciones/indice';
import {
  firmarFotoInspeccionAccion,
  obtenerInspeccionesOrdenAccion,
  subirFotoInspeccionAccion,
} from '../acciones/consultas-b6';
import type { CorridaDetalle } from '../servicios/consultas-b6-servicio';
import { CLAVE_INSPECCIONES_ORDEN } from './claves-consulta';

const CLASE_ETIQUETA = 'flex flex-col gap-1 text-sm font-medium text-texto-secundario';

/**
 * SII-B6.3: calidad básica por orden — primera pieza, referencias de lote
 * (1/3/5 e intervalos 10/20), cierre con cantidades/material y fotos.
 */
export function PanelCalidadProduccion({
  orden,
  corridas,
}: {
  orden: OrdenTableroProduccion | null;
  corridas: CorridaDetalle[];
}) {
  const clienteConsultas = useQueryClient();
  const [dialogo, setDialogo] = useState(false);
  const [tipo, setTipo] = useState<TipoInspeccion>('PRIMERA_PIEZA');
  const [corridaId, setCorridaId] = useState('');
  const [codigoItem, setCodigoItem] = useState('');
  const [referencia, setReferencia] = useState('');
  const [resultado, setResultado] = useState<'APROBADA' | 'RECHAZADA'>('APROBADA');
  const [cantidadOk, setCantidadOk] = useState('1');
  const [cantidadNok, setCantidadNok] = useState('0');
  const [cantidadRetrabajo, setCantidadRetrabajo] = useState('0');
  const [materialUsado, setMaterialUsado] = useState('');
  const [tolerancias, setTolerancias] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [fotos, setFotos] = useState<FileList | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const consulta = useQuery({
    queryKey: [...CLAVE_INSPECCIONES_ORDEN, orden?.id ?? 'sin-orden'],
    queryFn: async () => {
      if (!orden) return [];
      const respuesta = await obtenerInspeccionesOrdenAccion({ ordenId: orden.id });
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'La consulta no devolvi� datos' : respuesta.error);
      }
      return respuesta.datos;
    },
    enabled: orden !== null,
  });
  const inspecciones = consulta.data ?? [];

  const corridaSeleccionada = corridas.find((corrida) => corrida.id === corridaId) ?? null;
  const procesoCorrida = corridaSeleccionada;
  const referencias = useMemo(
    () => referenciasLotePermitidas(
      corridaSeleccionada?.cantidadPlanificada ?? 0,
      corridaSeleccionada?.intervaloInspeccionLote ?? null,
    ),
    [corridaSeleccionada],
  );

  function abrir(): void {
    setMensaje(null);
    const primeraCorrida = corridas.find((corrida) => corrida.estado !== 'CANCELADA') ?? null;
    setTipo(primeraCorrida?.requierePrimeraPieza ? 'PRIMERA_PIEZA' : 'CIERRE');
    setCorridaId(primeraCorrida?.id ?? '');
    setCodigoItem(primeraCorrida?.items[0]?.codigoItem ?? '');
    setReferencia('');
    setResultado('APROBADA');
    setCantidadOk('1');
    setCantidadNok('0');
    setCantidadRetrabajo('0');
    setMaterialUsado('');
    setTolerancias('');
    setObservaciones('');
    setFotos(null);
    setDialogo(true);
  }

  async function registrar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!orden) return;
    let toleranciasJson: Record<string, unknown> | undefined;
    if (tolerancias.trim()) {
      try {
        const parseado = JSON.parse(tolerancias) as unknown;
        if (parseado && typeof parseado === 'object' && !Array.isArray(parseado)) {
          toleranciasJson = parseado as Record<string, unknown>;
        } else {
          setMensaje('Las tolerancias deben ser un objeto JSON');
          return;
        }
      } catch {
        setMensaje('Las tolerancias no son JSON válido');
        return;
      }
    }

    setProcesando(true);
    const respuesta = await registrarInspeccionAccion({
      ordenId: orden.id,
      corridaId: corridaId || null,
      partidaId: corridaSeleccionada?.items[0]?.partidaId ?? null,
      codigoItem: codigoItem.trim(),
      tipo,
      referencia: referencia.trim() ? Number(referencia) : null,
      resultado,
      ...(toleranciasJson ? { tolerancias: toleranciasJson } : {}),
      cantidadInspeccionada: Number(cantidadOk) + Number(cantidadNok),
      cantidadOk: Number(cantidadOk),
      cantidadNok: Number(cantidadNok),
      cantidadRetrabajo: Number(cantidadRetrabajo),
      ...(materialUsado.trim() ? { materialUsado: { descripcion: materialUsado.trim() } } : {}),
      ...(observaciones.trim() ? { observaciones: observaciones.trim() } : {}),
    });

    if (!respuesta.exito || !respuesta.datos) {
      setProcesando(false);
      setMensaje(respuesta.exito ? 'La inspección no devolvió confirmación' : respuesta.error);
      return;
    }

    const subidas = fotos ? Array.from(fotos) : [];
    for (const foto of subidas) {
      const formData = new FormData();
      formData.set('inspeccionId', respuesta.datos.id);
      formData.set('archivo', foto);
      const subida = await subirFotoInspeccionAccion(formData);
      if (!subida.exito) {
        setMensaje(`Inspección registrada, pero una foto falló: ${subida.error}`);
        break;
      }
    }

    setProcesando(false);
    setMensaje(
      subidas.length > 0
        ? `Inspección ${ETIQUETAS_TIPO_INSPECCION[tipo].toLowerCase()} registrada con ${subidas.length} foto(s)`
        : `Inspección ${ETIQUETAS_TIPO_INSPECCION[tipo].toLowerCase()} registrada`,
    );
    setDialogo(false);
    await clienteConsultas.invalidateQueries({ queryKey: CLAVE_INSPECCIONES_ORDEN });
  }

  async function abrirFoto(archivoId: string): Promise<void> {
    const respuesta = await firmarFotoInspeccionAccion(archivoId);
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    window.open(respuesta.datos?.url, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="rounded-lg border border-borde bg-superficie p-4" data-testid="panel-calidad">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-texto-primario">Calidad</h2>
        <Button
          type="button"
          tamano="sm"
          disabled={!orden || corridas.length === 0}
          data-testid="registrar-inspeccion"
          onClick={abrir}
        >
          Registrar inspección
        </Button>
      </div>
      {!orden && <p className="mt-2 text-sm text-texto-secundario">Selecciona una orden del Kanban.</p>}
      {orden && corridas.length === 0 && (
        <p className="mt-2 text-sm text-texto-secundario">
          Crea o inicia una corrida para registrar inspecciones de la orden {orden.folio}.
        </p>
      )}
      {mensaje !== null && <p role="status" className="mt-2 text-sm text-texto-primario">{mensaje}</p>}

      {orden && inspecciones.length === 0 && corridas.length > 0 && (
        <EstadoVacio titulo="Sin inspecciones" descripcion="Registra primera pieza, referencias de lote o el cierre." />
      )}

      {inspecciones.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2" data-testid="lista-inspecciones">
          {inspecciones.map((inspeccion) => (
            <li key={inspeccion.id} className="rounded-md border border-borde p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{ETIQUETAS_TIPO_INSPECCION[inspeccion.tipo]}</strong>
                  {' · '}{inspeccion.resultado === 'APROBADA' ? 'Aprobada' : 'Rechazada'}
                  {inspeccion.referencia !== null ? ` · ref ${inspeccion.referencia}` : ''}
                  {inspeccion.corridaCodigo ? ` · ${inspeccion.corridaCodigo}` : ''}
                  {inspeccion.partidaCodigo ? ` · ${inspeccion.partidaCodigo}` : ''}
                </span>
                <span className="text-xs text-texto-secundario">
                  {formatearFecha(inspeccion.creadoEn)} {formatearHora(inspeccion.creadoEn)}
                </span>
              </div>
              <p className="mt-1 text-xs text-texto-secundario">
                {inspeccion.codigoItem} · OK {inspeccion.cantidadOk} · NOK {inspeccion.cantidadNok}
                {' · '}retrabajo {inspeccion.cantidadRetrabajo}
              </p>
              {inspeccion.observaciones ? <p className="mt-1 text-xs text-texto-secundario">{inspeccion.observaciones}</p> : null}
              {inspeccion.fotos.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-2">
                  {inspeccion.fotos.map((foto) => (
                    <button
                      key={foto.id}
                      type="button"
                      className="text-xs font-semibold text-acento hover:underline"
                      onClick={() => void abrirFoto(foto.id)}
                    >
                      {foto.nombreOriginal}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogo} onOpenChange={(valor) => !procesando && setDialogo(valor)}>
        <DialogContent data-testid="dialogo-inspeccion" aria-label="Registrar inspección de calidad">
          <DialogHeader>
            <DialogTitle>Registrar inspección</DialogTitle>
            <DialogDescription>
              {procesoCorrida?.requierePrimeraPieza
                ? 'El proceso exige primera pieza aprobada antes de declarar producción.'
                : 'Las referencias se registran sin bloquear la producción (control estadístico).'}
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={registrar}>
            <label className={CLASE_ETIQUETA}>
              Tipo
              <Select
                data-testid="tipo-inspeccion"
                value={tipo}
                onChange={(evento) => setTipo(evento.target.value as TipoInspeccion)}
              >
                <option value="PRIMERA_PIEZA">Primera pieza</option>
                <option value="REFERENCIA_LOTE">Referencia de lote</option>
                <option value="CIERRE">Cierre</option>
              </Select>
            </label>
            <label className={CLASE_ETIQUETA}>
              Corrida
              <Select
                data-testid="corrida-inspeccion"
                value={corridaId}
                onChange={(evento) => {
                  setCorridaId(evento.target.value);
                  const corrida = corridas.find((item) => item.id === evento.target.value);
                  setCodigoItem(corrida?.items[0]?.codigoItem ?? '');
                }}
              >
                {corridas.map((corrida) => (
                  <option key={corrida.id} value={corrida.id}>
                    {corrida.codigo} · {corrida.procesoNombre}
                  </option>
                ))}
              </Select>
            </label>
            <label className={CLASE_ETIQUETA}>
              Código de ítem
              <Input
                value={codigoItem}
                maxLength={40}
                onChange={(evento) => setCodigoItem(evento.target.value)}
                required
              />
            </label>
            {tipo === 'REFERENCIA_LOTE' ? (
              <label className={CLASE_ETIQUETA}>
                Referencia{tipo === 'REFERENCIA_LOTE' && referencias.length > 0 ? ` (sugeridas: ${referencias.join(', ')})` : ''}
                <Input
                  data-testid="referencia-inspeccion"
                  type="number"
                  min="1"
                  value={referencia}
                  onChange={(evento) => setReferencia(evento.target.value)}
                  required
                />
              </label>
            ) : null}
            <label className={CLASE_ETIQUETA}>
              Resultado
              <Select
                data-testid="resultado-inspeccion"
                value={resultado}
                onChange={(evento) => setResultado(evento.target.value as 'APROBADA' | 'RECHAZADA')}
              >
                <option value="APROBADA">Aprobada</option>
                <option value="RECHAZADA">Rechazada</option>
              </Select>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { etiqueta: 'Cantidad OK', valor: cantidadOk, set: setCantidadOk },
                { etiqueta: 'Cantidad NOK', valor: cantidadNok, set: setCantidadNok },
                { etiqueta: 'Retrabajo', valor: cantidadRetrabajo, set: setCantidadRetrabajo },
              ].map((campo) => (
                <label key={campo.etiqueta} className={CLASE_ETIQUETA}>
                  {campo.etiqueta}
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={campo.valor}
                    onChange={(evento) => campo.set(evento.target.value)}
                  />
                </label>
              ))}
            </div>
            <label className={CLASE_ETIQUETA}>
              Material usado (opcional)
              <Input
                value={materialUsado}
                maxLength={300}
                onChange={(evento) => setMaterialUsado(evento.target.value)}
              />
            </label>
            <label className={CLASE_ETIQUETA}>
              Tolerancias (JSON opcional)
              <Textarea
                className="min-h-11"
                value={tolerancias}
                maxLength={2000}
                placeholder='{"largo":0.5,"angulo":1}'
                onChange={(evento) => setTolerancias(evento.target.value)}
              />
            </label>
            <label className={CLASE_ETIQUETA}>
              Observaciones (opcional)
              <Textarea
                className="min-h-11"
                value={observaciones}
                maxLength={1000}
                onChange={(evento) => setObservaciones(evento.target.value)}
              />
            </label>
            <label className={CLASE_ETIQUETA}>
              Fotos de evidencia (opcional)
              <Input
                data-testid="fotos-inspeccion"
                type="file"
                accept="image/*,.pdf"
                multiple
                onChange={(evento) => setFotos(evento.target.files)}
              />
            </label>
            {mensaje !== null && <p role="alert" className="text-sm text-peligro-texto">{mensaje}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variante="contorno" disabled={procesando} onClick={() => setDialogo(false)}>
                Cerrar
              </Button>
              <Button type="submit" disabled={procesando} data-testid="confirmar-inspeccion">
                {procesando ? 'Guardando…' : 'Registrar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
