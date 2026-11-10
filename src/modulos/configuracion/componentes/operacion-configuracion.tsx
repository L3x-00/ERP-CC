'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PestanasModulo } from '@/compartido/componentes/ui/pestanas';
import {
  obtenerConfiguracionAccion,
  type DatosConfiguracion,
} from '@/modulos/configuracion/acciones/indice';
import { CLAVE_CATALOGOS_COMERCIALES, CLAVE_CONFIGURACION } from './claves-consulta';
import { PestanaAreasTrabajo } from './pestana-areas-trabajo';
import { PestanaCatalogos } from './pestana-catalogos';
import { PestanaFolios } from './pestana-folios';
import { PestanaPlantillasDoc } from './pestana-plantillas-doc';
import { PestanaOperadores } from './pestana-operadores';
import { PestanaTarifas } from './pestana-tarifas';
import { SincronizadorConfiguracionRealtime } from './sincronizador-configuracion-realtime';
import { PestanaPermisos } from '@/modulos/permisos/componentes/pestana-permisos';
import { PestanaUsuarios } from '@/modulos/permisos/componentes/pestana-usuarios';
import { PestanaCatalogosBase } from './pestana-catalogos-base';
import {
  pestanaDesdeVista,
  SECCIONES_CONFIGURACION,
  SUBSECCIONES_CATALOGOS,
  SUBSECCIONES_PERSONAS,
  subseccionInicial,
  VISTA_CONFIGURACION_INICIAL,
  type SeccionConfiguracion,
  type SubseccionCatalogos,
  type SubseccionConfiguracion,
  type SubseccionPersonas,
  type VistaConfiguracion,
} from './pestanas-configuracion';
import {
  obtenerPermisosCatalogosAccion,
  type PermisosCatalogos,
} from '@/modulos/catalogos/acciones/obtener-permisos-catalogos';
import { DialogoDatosEmpresa } from './dialogo-datos-empresa';

const CLAVE_PERMISOS_CATALOGOS = ['catalogos-base', 'permisos-pestana'] as const;

function etiquetaSeccion(seccion: VistaConfiguracion['seccion']): string {
  if (seccion === 'empresa') return 'Datos de empresa';
  return (
    SECCIONES_CONFIGURACION.find((item) => item.id === seccion)?.etiqueta ?? 'Configuración'
  );
}

export function OperacionConfiguracion({
  datosIniciales,
  vistaInicial = VISTA_CONFIGURACION_INICIAL,
}: {
  datosIniciales: DatosConfiguracion;
  vistaInicial?: VistaConfiguracion;
}) {
  const clienteQuery = useQueryClient();
  const [vista, setVista] = useState<VistaConfiguracion>(vistaInicial);
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

  const consultaPermisosCatalogos = useQuery({
    queryKey: CLAVE_PERMISOS_CATALOGOS,
    queryFn: async (): Promise<PermisosCatalogos> => {
      const respuesta = await obtenerPermisosCatalogosAccion();
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'Permisos ausentes' : respuesta.error);
      }
      return respuesta.datos;
    },
    staleTime: 5 * 60_000,
  });
  const puedeVerCatalogosBase = consultaPermisosCatalogos.data?.puedeVer === true;

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

  const seccion = vista.seccion;

  function abrirSeccion(id: string): void {
    const destino = id as SeccionConfiguracion;
    const subseccion = subseccionInicial(destino);
    setVista(subseccion ? { seccion: destino, subseccion } : { seccion: destino });
    setConfirmacion(null);
  }

  function abrirSubseccion(id: string): void {
    setVista((actual) => ({ ...actual, subseccion: id as SubseccionConfiguracion }));
    setConfirmacion(null);
  }

  // Mantiene `?pestana=` sincronizado con la vista activa sin recargar. Usa los
  // identificadores históricos para que recargar o compartir la URL abra
  // exactamente la misma sección y subsección.
  useEffect(() => {
    const url = new URL(window.location.href);
    const valor = pestanaDesdeVista(vista);
    if (url.searchParams.get('pestana') !== valor) {
      url.searchParams.set('pestana', valor);
      window.history.replaceState(null, '', url.toString());
    }
  }, [vista]);

  const seccionesVisibles = SECCIONES_CONFIGURACION.filter(
    (item) => item.id !== 'personas' || vigente.esAdmin,
  );

  const subseccionCatalogos: SubseccionCatalogos =
    seccion === 'catalogos' && vista.subseccion === 'operativos' && puedeVerCatalogosBase
      ? 'operativos'
      : 'comerciales';
  const subseccionPersonas: SubseccionPersonas =
    seccion === 'personas' && (vista.subseccion === 'permisos' || vista.subseccion === 'operadores')
      ? vista.subseccion
      : 'usuarios';

  const operativosSinPermiso =
    seccion === 'catalogos' && vista.subseccion === 'operativos' && !puedeVerCatalogosBase;
  const personasSinAcceso = seccion === 'personas' && !vigente.esAdmin;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-5" data-testid="pagina-configuracion">
      <SincronizadorConfiguracionRealtime />
      <header>
        <h1 className="text-2xl font-bold text-texto-primario">Configuración del sistema</h1>
        <p className="text-sm text-texto-secundario">
          Variables maestras protegidas por permiso y sincronizadas en tiempo real.
        </p>
      </header>

      <PestanasModulo
        pestanas={seccionesVisibles}
        activa={seccion}
        onCambiar={abrirSeccion}
        etiqueta="Secciones de configuración"
      />

      <section
        role="tabpanel"
        aria-label={etiquetaSeccion(seccion)}
        className="min-w-0 rounded-lg border border-borde bg-superficie p-4 shadow-sm sm:p-6"
      >
        {seccion === 'folios' || seccion === 'empresa' ? <PestanaFolios /> : null}

        {seccion === 'tarifas' ? (
          <PestanaTarifas
            key={`tarifas-${vigente.configuracion.actualizadoEn}`}
            configuracion={vigente.configuracion}
            onGuardado={actualizarConfiguracion}
            {...(puedeVerCatalogosBase
              ? {
                  onIrACatalogosBase: () => {
                    setVista({ seccion: 'catalogos', subseccion: 'operativos' });
                    setConfirmacion(null);
                  },
                }
              : {})}
          />
        ) : null}

        {seccion === 'catalogos' ? (
          <div className="grid gap-4">
            {puedeVerCatalogosBase ? (
              <PestanasModulo
                pestanas={SUBSECCIONES_CATALOGOS}
                activa={subseccionCatalogos}
                onCambiar={abrirSubseccion}
                etiqueta="Subsecciones de Catálogos"
              />
            ) : null}
            {operativosSinPermiso ? (
              <p role="alert" className="rounded-md bg-advertencia-suave px-3 py-2 text-sm font-medium text-advertencia-texto">
                No tienes acceso a los catálogos operativos. Se muestran los catálogos comerciales.
              </p>
            ) : null}
            {subseccionCatalogos === 'comerciales' ? (
              <PestanaCatalogos
                key={`catalogos-${vigente.configuracion.actualizadoEn}`}
                configuracion={vigente.configuracion}
                onGuardado={actualizarConfiguracion}
              />
            ) : null}
            {subseccionCatalogos === 'operativos' && puedeVerCatalogosBase ? (
              <PestanaCatalogosBase />
            ) : null}
          </div>
        ) : null}

        {seccion === 'areas' ? (
          <PestanaAreasTrabajo
            key={`areas-${vigente.areasTrabajo.map((area) => area.actualizadoEn).join('|')}`}
            datos={vigente.areasTrabajo}
            operadores={vigente.operadoresAreas}
            onGuardado={actualizarArea}
            onOperadoresGuardados={actualizarOperadoresAreas}
            onIrATarifas={() => abrirSeccion('tarifas')}
          />
        ) : null}

        {seccion === 'personas' && vigente.esAdmin ? (
          <div className="grid gap-4">
            <PestanasModulo
              pestanas={SUBSECCIONES_PERSONAS}
              activa={subseccionPersonas}
              onCambiar={abrirSubseccion}
              etiqueta="Subsecciones de Personas y accesos"
            />
            {subseccionPersonas === 'usuarios' ? <PestanaUsuarios /> : null}
            {subseccionPersonas === 'permisos' ? <PestanaPermisos /> : null}
            {subseccionPersonas === 'operadores' ? (
              <PestanaOperadores
                operadores={vigente.operadoresGestion}
                onCambio={async () => {
                  await clienteQuery.invalidateQueries({ queryKey: CLAVE_CONFIGURACION });
                }}
              />
            ) : null}
          </div>
        ) : null}

        {personasSinAcceso ? (
          <div role="alert" className="grid gap-3 rounded-md border border-borde bg-superficie-2 p-4 text-sm text-texto-secundario">
            <p className="font-medium text-texto-primario">
              Personas y accesos está disponible solo para administradores activos.
            </p>
            <button
              type="button"
              onClick={() => abrirSeccion('folios')}
              className="w-fit rounded-md border border-borde bg-superficie px-3 py-1.5 text-sm font-semibold text-texto-primario transition-colors hover:bg-superficie-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
            >
              Ir a Folios
            </button>
          </div>
        ) : null}

        {seccion === 'documentos' ? (
          <PestanaPlantillasDoc
            key={`plantillas-${vigente.configuracion.actualizadoEn}`}
            configuracion={vigente.configuracion}
            onGuardado={actualizarConfiguracion}
          />
        ) : null}
      </section>

      {seccion === 'empresa' ? (
        <DialogoDatosEmpresa
          abierto
          alCambiarAbierto={(abierto) => {
            if (!abierto) abrirSeccion('folios');
          }}
        />
      ) : null}

      {confirmacion ? (
        <p role="status" data-testid="configuracion-confirmacion" className="text-sm text-exito-texto">
          {confirmacion}
        </p>
      ) : null}
      {consulta.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-peligro-texto">
          No se pudo actualizar la configuración.
          <button type="button" className="font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento" onClick={() => void consulta.refetch()}>Reintentar</button>
        </div>
      ) : null}
    </div>
  );
}
