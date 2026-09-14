'use client';

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
import { EditorCotizacion } from '@/modulos/pipeline/componentes/editor-cotizacion';
import { ESTILO_PRIORIDAD, diasDesde } from '@/modulos/pipeline/componentes/tarjeta-oportunidad';
import type { Oportunidad } from '@/modulos/pipeline/tipos/indice';

/**
 * Vista de tabla del pipeline: folio, empresa, contacto, etapa con badge,
 * prioridad, días en la etapa actual y si la oportunidad ya está vinculada a un
 * cliente. La última columna abre la cotización (edición o consulta según la
 * etapa), para no obligar a cambiar de vista para cotizar.
 */
export function TablaOportunidades({
  oportunidades,
}: {
  oportunidades: readonly Oportunidad[];
}) {
  return (
    <TablaContenedor>
      <Tabla>
        <TablaEncabezado>
          <tr>
            <TablaEncabezadoCelda>Folio</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Empresa</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Contacto</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Etapa</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Prioridad</TablaEncabezadoCelda>
            <TablaEncabezadoCelda className="text-right">Días en etapa</TablaEncabezadoCelda>
            <TablaEncabezadoCelda>Cliente</TablaEncabezadoCelda>
            <TablaEncabezadoCelda className="text-right">Cotización</TablaEncabezadoCelda>
          </tr>
        </TablaEncabezado>
        <TablaCuerpo>
          {oportunidades.map((oportunidad) => {
            const prioridad = ESTILO_PRIORIDAD[oportunidad.prioridad];
            return (
              <TablaFila key={oportunidad.id}>
                <TablaCelda className="font-mono text-xs">
                  {oportunidad.folioCnc ?? oportunidad.folioOp}
                </TablaCelda>
                <TablaCelda className="font-medium">{oportunidad.empresa}</TablaCelda>
                <TablaCelda>{oportunidad.nombreContacto}</TablaCelda>
                <TablaCelda>
                  <BadgeEstado estado={oportunidad.etapa} />
                </TablaCelda>
                <TablaCelda>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${prioridad.clase}`}>
                    {prioridad.texto}
                  </span>
                </TablaCelda>
                <TablaCelda className="text-right tabular-nums">
                  {diasDesde(oportunidad.actualizadoEn)}
                </TablaCelda>
                <TablaCelda className="text-texto-secundario">
                  {oportunidad.clienteId ? 'Vinculado' : 'Sin vincular'}
                </TablaCelda>
                <TablaCelda className="text-right">
                  <EditorCotizacion oportunidad={oportunidad} />
                </TablaCelda>
              </TablaFila>
            );
          })}
        </TablaCuerpo>
      </Tabla>
    </TablaContenedor>
  );
}
