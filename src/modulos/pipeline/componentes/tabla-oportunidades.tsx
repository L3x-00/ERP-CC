'use client';

import { useState } from 'react';
import Link from 'next/link';

import { Button } from '@/compartido/componentes/ui/button';
import {
  Tabla,
  TablaCelda,
  TablaContenedor,
  TablaCuerpo,
  TablaEncabezado,
  TablaEncabezadoCelda,
  TablaFila,
} from '@/compartido/componentes/diseno/tabla';
import {
  ESTILO_PRIORIDAD,
  ETIQUETA_ESTADO_ORDEN,
} from '@/modulos/pipeline/componentes/tarjeta-oportunidad';
import { proximaAccionVencida } from '@/modulos/pipeline/servicios/filtrar-oportunidades';
import { etiquetaProximaAccion } from '@/modulos/pipeline/utilidades/proxima-accion';
import type { Oportunidad } from '@/modulos/pipeline/tipos/indice';
import { formatearFechaCalendario } from '@/modulos/ordenes/utilidades/formato-ficha';
import { DialogoHistorialRfq } from '@/modulos/rfq/componentes/dialogo-historial-rfq';
import { IndicadorEstadoRfq } from '@/modulos/rfq/componentes/indicador-estado-rfq';
import { usarValidacionColaRfq } from '@/modulos/rfq/hooks/usar-validacion-cola-rfq';
import { validacionConfirmadaDeFila } from '@/modulos/rfq/utilidades/validacion-cola';

/**
 * Texto de la próxima acción de la fila: nombre del catálogo y, para «Otro»,
 * su detalle. Se muestra aunque la fecha aún no esté capturada.
 */
function textoProximaAccion(oportunidad: Oportunidad): string | null {
  if (!oportunidad.proximaAccionCodigo) return null;
  const etiqueta = etiquetaProximaAccion(oportunidad.proximaAccionCodigo);
  const detalle = oportunidad.proximaAccionTexto?.trim();
  return detalle ? `${etiqueta}: ${detalle}` : etiqueta;
}

/**
 * Vista de lista de la cola RFQ: folio, empresa/contacto, estado (con la
 * indicación «Listo para validar» de la ficha, sin cambiar el estado), prioridad,
 * próxima acción con su fecha (vencida en rojo), responsable y orden. La fila
 * abre la ficha `/rfq?rfq=<id>`. Mientras no exista Propuesta Rev A, la fila
 * ofrece «Historial» con las versiones guardadas (solo lectura).
 */
export function TablaOportunidades({
  oportunidades,
}: {
  oportunidades: readonly Oportunidad[];
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [historialId, setHistorialId] = useState<string | null>(null);
  // Misma validación de la ficha, en una sola consulta acotada para toda la tabla.
  const validaciones = usarValidacionColaRfq(oportunidades);

  return (
    <>
      <TablaContenedor>
        <Tabla>
          <TablaEncabezado>
            <tr>
              <TablaEncabezadoCelda>Folio</TablaEncabezadoCelda>
              <TablaEncabezadoCelda>Empresa</TablaEncabezadoCelda>
              <TablaEncabezadoCelda>Estado</TablaEncabezadoCelda>
              <TablaEncabezadoCelda>Prioridad</TablaEncabezadoCelda>
              <TablaEncabezadoCelda>Próxima acción</TablaEncabezadoCelda>
              <TablaEncabezadoCelda>Responsable</TablaEncabezadoCelda>
              <TablaEncabezadoCelda>Orden</TablaEncabezadoCelda>
              <TablaEncabezadoCelda className="text-right">Acción</TablaEncabezadoCelda>
            </tr>
          </TablaEncabezado>
          <TablaCuerpo>
            {oportunidades.map((oportunidad) => {
              const prioridad = ESTILO_PRIORIDAD[oportunidad.prioridad];
              const vencida = proximaAccionVencida(oportunidad, hoy);
              const accionSiguiente = textoProximaAccion(oportunidad);
              const folio = oportunidad.folioRfq ?? oportunidad.folioCnc ?? oportunidad.folioOp;
              // DC-03: un alta interrumpida se reanuda sobre el MISMO RFQ, nunca
              // clonándolo ni generando otro folio.
              const incompleto = oportunidad.estadoRfq === 'INCOMPLETE';
              return (
                <TablaFila key={oportunidad.id}>
                  <TablaCelda className="font-mono text-xs">{folio}</TablaCelda>
                  <TablaCelda>
                    <span className="font-medium">{oportunidad.empresa}</span>
                    <span className="block text-xs text-texto-secundario">
                      {oportunidad.nombreContacto}
                    </span>
                  </TablaCelda>
                  <TablaCelda>
                    <IndicadorEstadoRfq
                      estadoRfq={oportunidad.estadoRfq}
                      validacion={validacionConfirmadaDeFila(validaciones, oportunidad.id)}
                    />
                  </TablaCelda>
                  <TablaCelda>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${prioridad.clase}`}
                    >
                      {prioridad.texto}
                    </span>
                  </TablaCelda>
                  <TablaCelda className={vencida ? 'font-semibold text-peligro-texto' : undefined}>
                    {accionSiguiente ? (
                      <span className="flex flex-col gap-0.5">
                        <span>{accionSiguiente}</span>
                        <span className="text-xs font-normal text-texto-secundario">
                          {oportunidad.fechaProximaAccion
                            ? formatearFechaCalendario(oportunidad.fechaProximaAccion)
                            : 'Sin fecha'}
                        </span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </TablaCelda>
                  <TablaCelda className="text-texto-secundario">
                    {oportunidad.responsableProximaAccionNombre
                      ?? oportunidad.responsableNombre
                      ?? oportunidad.clienteNombre
                      ?? '—'}
                  </TablaCelda>
                  <TablaCelda className="text-texto-secundario">
                    {oportunidad.ordenVinculada ? (
                      <span>
                        <span className="font-mono text-xs">{oportunidad.ordenVinculada.folio}</span>
                        {' · '}
                        {ETIQUETA_ESTADO_ORDEN[oportunidad.ordenVinculada.estado] ??
                          oportunidad.ordenVinculada.estado}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TablaCelda>
                  <TablaCelda className="text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Button
                        type="button"
                        variante="fantasma"
                        tamano="sm"
                        onClick={() => setHistorialId(oportunidad.id)}
                      >
                        Historial
                      </Button>
                      <Link
                        href={`/rfq?rfq=${oportunidad.id}${incompleto ? '&continuar=1' : ''}`}
                        className="text-xs font-semibold text-acento hover:underline"
                      >
                        {incompleto ? 'Continuar captura' : 'Abrir'}
                      </Link>
                    </div>
                  </TablaCelda>
                </TablaFila>
              );
            })}
          </TablaCuerpo>
        </Tabla>
      </TablaContenedor>
      {historialId !== null && (
        <DialogoHistorialRfq
          rfqId={historialId}
          abierto
          onCambioApertura={(valor) => {
            if (!valor) setHistorialId(null);
          }}
        />
      )}
    </>
  );
}
