'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/compartido/utilidades/cn';
import {
  obtenerConfiguracionAccion,
  type DatosConfiguracion,
} from '@/modulos/configuracion/acciones/indice';
import { CLAVE_CATALOGOS_COMERCIALES, CLAVE_CONFIGURACION } from './claves-consulta';
import { PestanaAreasTrabajo } from './pestana-areas-trabajo';
import { PestanaCatalogos } from './pestana-catalogos';
import { PestanaCuentasBancarias } from './pestana-cuentas-bancarias';
import { PestanaEmpresa } from './pestana-empresa';
import { PestanaPlantillasDoc } from './pestana-plantillas-doc';
import { PestanaTarifas } from './pestana-tarifas';
import { SincronizadorConfiguracionRealtime } from './sincronizador-configuracion-realtime';

const PESTANAS = [
  ['empresa', 'Empresa'],
  ['tarifas', 'Tarifas / TC'],
  ['catalogos', 'Catálogos'],
  ['areas', 'Áreas de trabajo'],
  ['cuentas', 'Cuentas bancarias'],
  ['plantillas', 'Plantillas T1'],
] as const;
type Pestana = (typeof PESTANAS)[number][0];

export function OperacionConfiguracion({ datosIniciales }: { datosIniciales: DatosConfiguracion }) {
  const clienteQuery = useQueryClient();
  const [pestana, setPestana] = useState<Pestana>('empresa');
  // Confirmación a nivel de página: las pestañas se remontan (key por
  // `actualizadoEn`) cuando su sección cambia, así que un mensaje local se
  // perdería justo al guardar. Aquí sobrevive al remontaje y es el feedback
  // que ve el usuario.
  const [confirmacion, setConfirmacion] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: CLAVE_CONFIGURACION,
    queryFn: async (): Promise<DatosConfiguracion> => {
      const respuesta = await obtenerConfiguracionAccion({ soloCuentasActivas: false });
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'Configuración ausente' : respuesta.error);
      }
      return respuesta.datos;
    },
    initialData: datosIniciales,
    staleTime: 0,
  });

  // Única fuente de datos: la caché de TanStack Query. Los `onGuardado` de las
  // pestañas reciben la sección confirmada por el servidor y actualizan la
  // caché; no hay copia en Zustand ni en estado local.
  const vigente = consulta.data;
  const actualizarConfiguracion = (configuracion: DatosConfiguracion['configuracion']): void => {
    clienteQuery.setQueryData<DatosConfiguracion>(CLAVE_CONFIGURACION, (actual) =>
      actual ? { ...actual, configuracion } : actual,
    );
    clienteQuery.setQueryData(CLAVE_CATALOGOS_COMERCIALES, {
      tiers: configuracion.tiers,
      categoriasGasto: configuracion.categoriasGasto,
    });
    setConfirmacion('Cambios guardados');
  };
  const actualizarCuenta = (cuenta: DatosConfiguracion['cuentasBancarias'][number]): void => {
    clienteQuery.setQueryData<DatosConfiguracion>(CLAVE_CONFIGURACION, (actual) => {
      if (!actual) return actual;
      const cuentas = actual.cuentasBancarias.some((item) => item.id === cuenta.id)
        ? actual.cuentasBancarias.map((item) => (item.id === cuenta.id ? cuenta : item))
        : [...actual.cuentasBancarias, cuenta];
      return { ...actual, cuentasBancarias: cuentas };
    });
    setConfirmacion('Cuenta guardada');
  };
  const actualizarArea = (area: DatosConfiguracion['areasTrabajo'][number]): void => {
    clienteQuery.setQueryData<DatosConfiguracion>(CLAVE_CONFIGURACION, (actual) => {
      if (!actual) return actual;
      const areas = actual.areasTrabajo.some((item) => item.id === area.id)
        ? actual.areasTrabajo.map((item) => (item.id === area.id ? area : item))
        : [...actual.areasTrabajo, area];
      return { ...actual, areasTrabajo: areas };
    });
    setConfirmacion('Área guardada');
  };
  const actualizarOperadoresAreas = (
    operadoresAreas: DatosConfiguracion['operadoresAreas'],
  ): void => {
    clienteQuery.setQueryData<DatosConfiguracion>(CLAVE_CONFIGURACION, (actual) =>
      actual ? { ...actual, operadoresAreas } : actual,
    );
    setConfirmacion('Áreas del operador guardadas');
  };

  function cambiarPestana(id: Pestana): void {
    setPestana(id);
    setConfirmacion(null);
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5" data-testid="pagina-configuracion">
      <SincronizadorConfiguracionRealtime />
      <header>
        <h1 className="text-2xl font-bold text-texto-primario">Configuración del sistema</h1>
        <p className="text-sm text-texto-secundario">
          Variables maestras protegidas por permiso y sincronizadas en tiempo real.
        </p>
      </header>
      <div role="tablist" aria-label="Secciones de configuración" className="flex flex-wrap gap-1 border-b border-borde">
        {PESTANAS.map(([id, etiqueta]) => (
          <button
            key={id}
            id={`tab-configuracion-${id}`}
            role="tab"
            type="button"
            aria-selected={pestana === id}
            aria-controls={`panel-configuracion-${id}`}
            className={cn(
              '-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40',
              pestana === id
                ? 'border-acento bg-acento-suave text-acento'
                : 'border-transparent text-texto-secundario hover:bg-superficie-2 hover:text-texto-primario',
            )}
            onClick={() => cambiarPestana(id)}
          >
            {etiqueta}
          </button>
        ))}
      </div>
      <section
        id={`panel-configuracion-${pestana}`}
        role="tabpanel"
        aria-labelledby={`tab-configuracion-${pestana}`}
        className="rounded-lg border border-borde bg-superficie p-4 shadow-sm sm:p-6"
      >
        {pestana === 'empresa' ? (
          <PestanaEmpresa
            key={`empresa-${vigente.configuracion.actualizadoEn}`}
            datos={vigente.configuracion.empresa}
            onGuardado={actualizarConfiguracion}
          />
        ) : null}
        {pestana === 'tarifas' ? (
          <PestanaTarifas
            key={`tarifas-${vigente.configuracion.actualizadoEn}`}
            configuracion={vigente.configuracion}
            onGuardado={actualizarConfiguracion}
          />
        ) : null}
        {pestana === 'catalogos' ? (
          <PestanaCatalogos
            key={`catalogos-${vigente.configuracion.actualizadoEn}`}
            configuracion={vigente.configuracion}
            onGuardado={actualizarConfiguracion}
          />
        ) : null}
        {pestana === 'areas' ? (
          <PestanaAreasTrabajo
            key={`areas-${vigente.areasTrabajo.map((area) => area.actualizadoEn).join('|')}`}
            datos={vigente.areasTrabajo}
            operadores={vigente.operadoresAreas}
            onGuardado={actualizarArea}
            onOperadoresGuardados={actualizarOperadoresAreas}
          />
        ) : null}
        {pestana === 'cuentas' ? (
          <PestanaCuentasBancarias
            key={`cuentas-${vigente.cuentasBancarias.map((cuenta) => cuenta.actualizadoEn).join('|')}`}
            datos={vigente.cuentasBancarias}
            onGuardado={actualizarCuenta}
          />
        ) : null}
        {pestana === 'plantillas' ? (
          <PestanaPlantillasDoc
            key={`plantillas-${vigente.configuracion.actualizadoEn}`}
            configuracion={vigente.configuracion}
            onGuardado={actualizarConfiguracion}
          />
        ) : null}
      </section>
      {confirmacion ? (
        <p role="status" data-testid="configuracion-confirmacion" className="text-sm text-exito-texto">
          {confirmacion}
        </p>
      ) : null}
      {consulta.isError ? (
        <p role="alert" className="text-sm text-peligro-texto">
          No se pudo actualizar la configuración. Vuelve a intentarlo.
        </p>
      ) : null}
    </div>
  );
}
