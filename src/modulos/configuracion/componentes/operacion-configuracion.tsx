'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usarTiendaConfiguracion } from '@/estado/uso-tienda-configuracion';
import { obtenerConfiguracionAccion, type DatosConfiguracion } from '@/modulos/configuracion/acciones/indice';
import { CLAVE_CONFIGURACION } from './claves-consulta';
import { PestanaAreasTrabajo } from './pestana-areas-trabajo';
import { PestanaCuentasBancarias } from './pestana-cuentas-bancarias';
import { PestanaEmpresa } from './pestana-empresa';
import { PestanaPlantillasDoc } from './pestana-plantillas-doc';
import { PestanaTarifas } from './pestana-tarifas';
import { SincronizadorConfiguracionRealtime } from './sincronizador-configuracion-realtime';

const PESTANAS = [
  ['empresa', 'Empresa'],
  ['tarifas', 'Tarifas / TC'],
  ['areas', 'Áreas de trabajo'],
  ['cuentas', 'Cuentas bancarias'],
  ['plantillas', 'Plantillas T1'],
] as const;
type Pestana = (typeof PESTANAS)[number][0];

export function OperacionConfiguracion({ datosIniciales }: { datosIniciales: DatosConfiguracion }) {
  const clienteQuery = useQueryClient();
  const [pestana, setPestana] = useState<Pestana>('empresa');
  const establecerDatos = usarTiendaConfiguracion((estado) => estado.establecerDatos);
  const establecerError = usarTiendaConfiguracion((estado) => estado.establecerError);
  const [datos, setDatos] = useState(datosIniciales);

  useEffect(() => {
    establecerDatos(datosIniciales);
  }, [datosIniciales, establecerDatos]);

  const consulta = useQuery({
    queryKey: CLAVE_CONFIGURACION,
    queryFn: async (): Promise<DatosConfiguracion> => {
      const respuesta = await obtenerConfiguracionAccion({ soloCuentasActivas: false });
      if (!respuesta.exito || !respuesta.datos) throw new Error(respuesta.exito ? 'Configuración ausente' : respuesta.error);
      setDatos(respuesta.datos);
      establecerDatos(respuesta.datos);
      return respuesta.datos;
    },
    initialData: datosIniciales,
    staleTime: 0,
  });

  useEffect(() => {
    if (consulta.error) establecerError('No se pudo actualizar la configuración');
  }, [consulta.error, establecerError]);

  const vigente = consulta.data ?? datos;
  const actualizarConfiguracion = (configuracion: DatosConfiguracion['configuracion']): void => {
    const nuevo = { ...vigente, configuracion };
    setDatos(nuevo);
    establecerDatos(nuevo);
    clienteQuery.setQueryData(CLAVE_CONFIGURACION, nuevo);
  };
  const actualizarCuenta = (cuenta: DatosConfiguracion['cuentasBancarias'][number]): void => {
    const cuentas = vigente.cuentasBancarias.some((item) => item.id === cuenta.id)
      ? vigente.cuentasBancarias.map((item) => item.id === cuenta.id ? cuenta : item)
      : [...vigente.cuentasBancarias, cuenta];
    const nuevo = { ...vigente, cuentasBancarias: cuentas };
    setDatos(nuevo); establecerDatos(nuevo); clienteQuery.setQueryData(CLAVE_CONFIGURACION, nuevo);
  };
  const actualizarArea = (area: DatosConfiguracion['areasTrabajo'][number]): void => {
    const areas = vigente.areasTrabajo.some((item) => item.id === area.id)
      ? vigente.areasTrabajo.map((item) => item.id === area.id ? area : item)
      : [...vigente.areasTrabajo, area];
    const nuevo = { ...vigente, areasTrabajo: areas };
    setDatos(nuevo); establecerDatos(nuevo); clienteQuery.setQueryData(CLAVE_CONFIGURACION, nuevo);
  };

  return <div className="mx-auto flex max-w-7xl flex-col gap-5" data-testid="pagina-configuracion"><SincronizadorConfiguracionRealtime /><header><h1 className="text-2xl font-bold">Configuración del sistema</h1><p className="text-sm text-foreground/70">Variables maestras protegidas por permiso y sincronizadas en tiempo real.</p></header><div role="tablist" aria-label="Secciones de configuración" className="flex flex-wrap gap-2 border-b border-foreground/15 pb-2">{PESTANAS.map(([id, etiqueta]) => <button key={id} id={`tab-configuracion-${id}`} role="tab" type="button" aria-selected={pestana === id} aria-controls={`panel-configuracion-${id}`} className="rounded-base px-3 py-2 text-sm font-semibold transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primario/40" onClick={() => setPestana(id)}>{etiqueta}</button>)}</div><section id={`panel-configuracion-${pestana}`} role="tabpanel" aria-labelledby={`tab-configuracion-${pestana}`} className="rounded-base border border-foreground/15 bg-background p-4 sm:p-6">{pestana === 'empresa' ? <PestanaEmpresa key={`empresa-${vigente.configuracion.actualizadoEn}`} datos={vigente.configuracion.empresa} onGuardado={actualizarConfiguracion} /> : null}{pestana === 'tarifas' ? <PestanaTarifas key={`tarifas-${vigente.configuracion.actualizadoEn}`} configuracion={vigente.configuracion} onGuardado={actualizarConfiguracion} /> : null}{pestana === 'areas' ? <PestanaAreasTrabajo key={`areas-${vigente.areasTrabajo.map((area) => area.actualizadoEn).join('|')}`} datos={vigente.areasTrabajo} onGuardado={actualizarArea} /> : null}{pestana === 'cuentas' ? <PestanaCuentasBancarias key={`cuentas-${vigente.cuentasBancarias.map((cuenta) => cuenta.actualizadoEn).join('|')}`} datos={vigente.cuentasBancarias} onGuardado={actualizarCuenta} /> : null}{pestana === 'plantillas' ? <PestanaPlantillasDoc key={`plantillas-${vigente.configuracion.actualizadoEn}`} configuracion={vigente.configuracion} onGuardado={actualizarConfiguracion} /> : null}</section>{consulta.isError ? <p role="alert" className="text-sm text-red-700">No se pudo actualizar la configuración. Vuelve a intentarlo.</p> : null}</div>;
}
