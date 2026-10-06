'use client';

import Link from 'next/link';

import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
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
import { ETIQUETAS_ESTADO_RFQ } from '@/modulos/rfq/utilidades/estados';

/**
 * Vista de lista de la cola RFQ: folio, empresa/contacto, estado, prioridad,
 * próxima acción con su fecha (vencida en rojo), responsable y orden. La fila
 * abre la ficha `/rfq?rfq=<id>`.
 */
export function TablaOportunidades({
  oportunidades,
}: {
  oportunidades: readonly Oportunidad[];
}) {
  const hoy = new Date().toISOString().slice(0, 10);

  return (
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
            <TablaEncabezadoCelda className="text-right">Abrir</TablaEncabezadoCelda>
          </tr>
        </TablaEncabezado>
        <TablaCuerpo>
          {oportunidades.map((oportunidad) => {
            const prioridad = ESTILO_PRIORIDAD[oportunidad.prioridad];
            const vencida = proximaAccionVencida(oportunidad, hoy);
            const folio = oportunidad.folioRfq ?? oportunidad.folioCnc ?? oportunidad.folioOp;
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
                  <BadgeEstado
                    estado={oportunidad.estadoRfq}
                    etiqueta={ETIQUETAS_ESTADO_RFQ[oportunidad.estadoRfq]}
                  />
                </TablaCelda>
                <TablaCelda>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${prioridad.clase}`}>
                    {prioridad.texto}
                  </span>
                </TablaCelda>
                <TablaCelda className={vencida ? 'font-semibold text-peligro-texto' : undefined}>
                  {oportunidad.fechaProximaAccion
                    ? `${etiquetaProximaAccion(oportunidad.proximaAccionCodigo)} · ${oportunidad.fechaProximaAccion}`
                    : '—'}
                </TablaCelda>
                <TablaCelda className="text-texto-secundario">
                  {oportunidad.responsableNombre ?? oportunidad.clienteNombre ?? '—'}
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
                  <Link
                    href={`/rfq?rfq=${oportunidad.id}`}
                    className="text-xs font-semibold text-acento hover:underline"
                  >
                    Abrir
                  </Link>
                </TablaCelda>
              </TablaFila>
            );
          })}
        </TablaCuerpo>
      </Tabla>
    </TablaContenedor>
  );
}
