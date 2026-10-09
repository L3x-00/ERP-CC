'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';
import {
  alternarActivoAccion,
  guardarCanalAccion,
  guardarEspesorAccion,
  guardarGrupoEquipoAccion,
  guardarGrupoPlaneadoAccion,
  guardarMaterialAccion,
  guardarProcesoAccion,
  guardarProximaAccionAccion,
  listarVersionesAccion,
  obtenerCatalogosBaseAccion,
} from '@/modulos/catalogos/acciones/indice';
import type {
  CatalogosBase,
  EntidadCatalogo,
  GrupoEquipoCatalogo,
  GrupoPlaneadoCatalogo,
  ProcesoCatalogo,
  VersionCatalogo,
} from '@/modulos/catalogos/tipos/indice';
import {
  contarRegistrosPorSeccion,
  espesoresDeMaterial,
  SECCIONES_CATALOGOS_BASE,
  soloActivos,
} from '@/modulos/catalogos/utilidades/indice';

const CLAVE_CATALOGOS_BASE = ['configuracion', 'catalogos-base'] as const;
const claveVersiones = (entidad: EntidadCatalogo, entidadId: string) =>
  ['configuracion', 'catalogos-base', 'versiones', entidad, entidadId] as const;

export interface HistorialSeleccionado {
  entidad: EntidadCatalogo;
  entidadId: string;
  etiqueta: string;
}

interface PropsSeccion {
  datos: CatalogosBase;
  puedeEditar: boolean;
  onRefrescar: () => Promise<void>;
  onMensaje: (texto: string) => void;
  onError: (texto: string) => void;
  onHistorial: (seleccion: HistorialSeleccionado) => void;
}

function etiquetaEstado(activo: boolean) {
  return activo ? <Badge variante="exito">Activo</Badge> : <Badge variante="neutro">Inactivo</Badge>;
}

function mensajeRespuesta(respuesta: { exito: boolean; error?: string }, ok: string): { ok: string; error: string } {
  return respuesta.exito ? { ok, error: '' } : { ok: '', error: respuesta.error ?? 'No se pudo guardar' };
}

export function PestanaCatalogosBase() {
  const clienteQuery = useQueryClient();
  const consulta = useQuery({
    queryKey: CLAVE_CATALOGOS_BASE,
    queryFn: async (): Promise<CatalogosBase> => {
      const respuesta = await obtenerCatalogosBaseAccion({ soloActivos: false });
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'Catálogos ausentes' : respuesta.error);
      }
      return respuesta.datos;
    },
    staleTime: 0,
  });

  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<HistorialSeleccionado | null>(null);

  const refrescar = async (): Promise<void> => {
    await clienteQuery.invalidateQueries({ queryKey: CLAVE_CATALOGOS_BASE });
  };
  const onMensaje = (texto: string): void => {
    setMensaje(texto);
    setError(null);
  };
  const onError = (texto: string): void => {
    setError(texto);
    setMensaje(null);
  };

  if (consulta.isPending) return <SkeletonTabla filas={12} columnas={4} />;

  if (consulta.isError || !consulta.data) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-peligro-texto">
        No se pudieron cargar los catálogos base.
        <Button variante="contorno" tamano="sm" onClick={() => void consulta.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const datos = consulta.data;
  const conteos = contarRegistrosPorSeccion(datos);
  const propsBase: PropsSeccion = {
    datos,
    puedeEditar: datos.puedeEditar,
    onRefrescar: refrescar,
    onMensaje,
    onError,
    onHistorial: setHistorial,
  };

  return (
    <div
      className="scroll-sutil grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8 overflow-x-auto"
      data-testid="pagina-catalogos-base"
    >
      <header>
        <h2 className="text-lg font-semibold text-texto-primario">Catálogos base</h2>
        <p className="text-sm text-texto-secundario">
          Configurables, activos/inactivos y versionados. Los códigos inactivos no se ofrecen en
          registros nuevos, pero permanecen visibles en el historial. Nada se elimina.
        </p>
        {!datos.puedeEditar ? (
          <p className="mt-1 text-sm text-advertencia-texto" data-testid="catalogos-solo-lectura">
            Tienes permiso de lectura; solicita <span className="font-mono">catalogo_editar</span> para
            modificar.
          </p>
        ) : null}
      </header>

      <SeccionMateriales {...propsBase} />
      <SeccionEspesores {...propsBase} />
      <SeccionProcesos {...propsBase} />
      <SeccionGruposEquipo {...propsBase} />
      <SeccionGruposPlaneados {...propsBase} />
      <SeccionProximasAcciones {...propsBase} />
      <SeccionCanales {...propsBase} />

      <p className="text-xs text-texto-terciario" data-testid="catalogos-conteos">
        {SECCIONES_CATALOGOS_BASE.map(
          (seccion) =>
            `${seccion.titulo}: ${conteos[seccion.id].activos} activos / ${conteos[seccion.id].total} totales`,
        ).join(' · ')}
      </p>

      {historial ? (
        <PanelVersiones seleccion={historial} onCerrar={() => setHistorial(null)} />
      ) : null}

      {mensaje ? (
        <p role="status" className="text-sm text-exito-texto" data-testid="catalogos-confirmacion">
          {mensaje}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-peligro-texto" data-testid="catalogos-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function BotonHistorial({
  onClick,
  etiqueta,
  testid,
}: {
  onClick: () => void;
  etiqueta: string;
  testid: string;
}) {
  return (
    <Button
      variante="fantasma"
      tamano="sm"
      onClick={onClick}
      aria-label={`Historial de ${etiqueta}`}
      data-testid={testid}
    >
      Historial
    </Button>
  );
}

function BotonActivo({
  activo,
  puedeEditar,
  onClick,
  testid,
}: {
  activo: boolean;
  puedeEditar: boolean;
  onClick: () => void;
  testid: string;
}) {
  return (
    <Button
      variante={activo ? 'destructivo' : 'contorno'}
      tamano="sm"
      disabled={!puedeEditar}
      onClick={onClick}
      data-testid={testid}
    >
      {activo ? 'Desactivar' : 'Activar'}
    </Button>
  );
}

async function alternar(
  entidad: EntidadCatalogo,
  id: string,
  activo: boolean,
  props: Pick<PropsSeccion, 'onRefrescar' | 'onMensaje' | 'onError'>,
  etiqueta: string,
): Promise<void> {
  const respuesta = await alternarActivoAccion({ entidad, id, activo });
  if (!respuesta.exito) {
    props.onError(respuesta.error);
    return;
  }
  await props.onRefrescar();
  props.onMensaje(`${etiqueta} ${activo ? 'activado' : 'desactivado'}`);
}

function CabeceraSeccion({
  titulo,
  descripcion,
  puedeEditar,
  onNuevo,
  testid,
  etiquetaNuevo,
}: {
  titulo: string;
  descripcion: string;
  puedeEditar: boolean;
  onNuevo: () => void;
  testid: string;
  etiquetaNuevo: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-base font-semibold text-texto-primario">{titulo}</h3>
        <p className="text-xs text-texto-secundario">{descripcion}</p>
      </div>
      <Button variante="secundario" tamano="sm" disabled={!puedeEditar} onClick={onNuevo} data-testid={testid}>
        {etiquetaNuevo}
      </Button>
    </div>
  );
}

interface FormularioCatalogo {
  id?: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  orden: string;
}

const FORMULARIO_VACIO: FormularioCatalogo = { codigo: '', nombre: '', activo: true, orden: '0' };

function FormularioSimple({
  titulo,
  item,
  puedeEditar,
  guardando,
  onGuardar,
  onCancelar,
  testidPrefijo,
}: {
  titulo: string;
  item: FormularioCatalogo | null;
  puedeEditar: boolean;
  guardando: boolean;
  onGuardar: (item: FormularioCatalogo) => void;
  onCancelar: () => void;
  testidPrefijo: string;
}) {
  const [borrador, setBorrador] = useState<FormularioCatalogo>(item ?? FORMULARIO_VACIO);
  const clave = item?.id ?? 'nuevo';
  const [claveActual, setClaveActual] = useState(clave);
  if (claveActual !== clave) {
    setClaveActual(clave);
    setBorrador(item ?? FORMULARIO_VACIO);
  }

  if (!item) return null;

  return (
    <form
      className="grid gap-3 rounded-lg border border-borde bg-superficie-2/60 p-3 sm:grid-cols-2"
      onSubmit={(evento) => {
        evento.preventDefault();
        onGuardar(borrador);
      }}
      aria-label={titulo}
      data-testid={testidPrefijo}
    >
      <p className="text-sm font-semibold text-texto-primario sm:col-span-2">{titulo}</p>
      <label className="grid gap-1 text-xs font-medium text-texto-secundario">
        Código
        <Input
          value={borrador.codigo}
          onChange={(evento) =>
            setBorrador((actual) => ({ ...actual, codigo: evento.target.value.toUpperCase() }))
          }
          disabled={!puedeEditar}
          maxLength={49}
          required
          data-testid={`${testidPrefijo}-codigo`}
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-texto-secundario">
        Nombre
        <Input
          value={borrador.nombre}
          onChange={(evento) => setBorrador((actual) => ({ ...actual, nombre: evento.target.value }))}
          disabled={!puedeEditar}
          maxLength={120}
          required
          data-testid={`${testidPrefijo}-nombre`}
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-texto-secundario">
        Orden
        <Input
          type="number"
          min="0"
          step="1"
          value={borrador.orden}
          onChange={(evento) => setBorrador((actual) => ({ ...actual, orden: evento.target.value }))}
          disabled={!puedeEditar}
          data-testid={`${testidPrefijo}-orden`}
        />
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-texto-secundario">
        <input
          type="checkbox"
          className="h-4 w-4 accent-acento"
          checked={borrador.activo}
          onChange={(evento) => setBorrador((actual) => ({ ...actual, activo: evento.target.checked }))}
          disabled={!puedeEditar}
          data-testid={`${testidPrefijo}-activo`}
        />
        Activo
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" tamano="sm" disabled={!puedeEditar || guardando} data-testid={`${testidPrefijo}-guardar`}>
          {guardando ? 'Guardando…' : item.id ? 'Guardar cambios' : 'Crear'}
        </Button>
        <Button variante="contorno" tamano="sm" onClick={onCancelar} data-testid={`${testidPrefijo}-cancelar`}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function SeccionMateriales(props: PropsSeccion) {
  const { datos, puedeEditar, onRefrescar, onMensaje, onError, onHistorial } = props;
  const [editando, setEditando] = useState<FormularioCatalogo | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(borrador: FormularioCatalogo): Promise<void> {
    setGuardando(true);
    const respuesta = await guardarMaterialAccion({
      id: borrador.id,
      codigo: borrador.codigo,
      nombre: borrador.nombre,
      activo: borrador.activo,
      orden: Number(borrador.orden) || 0,
    });
    setGuardando(false);
    const resultado = mensajeRespuesta(respuesta, 'Material guardado');
    if (resultado.error) {
      onError(resultado.error);
      return;
    }
    setEditando(null);
    await onRefrescar();
    onMensaje(resultado.ok);
  }

  return (
    <section className="grid gap-3" aria-labelledby="catalogos-materiales">
      <CabeceraSeccion
        titulo="Materiales"
        descripcion={SECCIONES_CATALOGOS_BASE[0].descripcion}
        puedeEditar={puedeEditar}
        onNuevo={() => setEditando({ ...FORMULARIO_VACIO })}
        testid="catalogo-material-nuevo"
        etiquetaNuevo="Nuevo material"
      />
      <FormularioSimple
        titulo={editando?.id ? 'Editar material' : 'Nuevo material'}
        item={editando}
        puedeEditar={puedeEditar}
        guardando={guardando}
        onGuardar={(borrador) => void guardar(borrador)}
        onCancelar={() => setEditando(null)}
        testidPrefijo="catalogo-material"
      />
      {datos.materiales.length === 0 ? (
        <EstadoVacio titulo="Sin materiales" descripcion="Crea el primer material del catálogo." />
      ) : (
        <ul className="grid gap-2" data-testid="lista-materiales">
          {datos.materiales.map((material) => (
            <li
              key={material.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-borde bg-superficie px-3 py-2"
              data-testid={`fila-material-${material.codigo}`}
            >
              <span className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs text-texto-secundario">{material.codigo}</span>
                <span className="font-medium text-texto-primario">{material.nombre}</span>
                {etiquetaEstado(material.activo)}
              </span>
              <span className="flex gap-2">
                <BotonHistorial
                  etiqueta={material.nombre}
                  onClick={() =>
                    onHistorial({
                      entidad: 'catalogo_materiales',
                      entidadId: material.id,
                      etiqueta: material.nombre,
                    })
                  }
                  testid={`historial-material-${material.codigo}`}
                />
                <Button
                  variante="contorno"
                  tamano="sm"
                  disabled={!puedeEditar}
                  onClick={() =>
                    setEditando({
                      id: material.id,
                      codigo: material.codigo,
                      nombre: material.nombre,
                      activo: material.activo,
                      orden: String(material.orden),
                    })
                  }
                  data-testid={`editar-material-${material.codigo}`}
                >
                  Editar
                </Button>
                <BotonActivo
                  activo={material.activo}
                  puedeEditar={puedeEditar}
                  onClick={() =>
                    void alternar('catalogo_materiales', material.id, !material.activo, props, `Material ${material.codigo}`)
                  }
                  testid={`alternar-material-${material.codigo}`}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SeccionEspesores(props: PropsSeccion) {
  const { datos, puedeEditar, onRefrescar, onMensaje, onError, onHistorial } = props;
  const materialesActivos = soloActivos(datos.materiales);
  const [materialId, setMaterialId] = useState<string>(materialesActivos[0]?.id ?? datos.materiales[0]?.id ?? '');
  const [editando, setEditando] = useState<{
    id?: string;
    etiqueta: string;
    espesorMm: string;
    activo: boolean;
    orden: string;
  } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const materialSeleccionado = datos.materiales.find((material) => material.id === materialId) ?? null;
  const espesores = useMemo(
    () => (materialId ? espesoresDeMaterial(datos.espesores, materialId, true) : []),
    [datos.espesores, materialId],
  );

  async function guardar(borrador: NonNullable<typeof editando>): Promise<void> {
    if (!materialId) {
      onError('Selecciona un material para el espesor');
      return;
    }
    setGuardando(true);
    const respuesta = await guardarEspesorAccion({
      id: borrador.id,
      materialId,
      etiqueta: borrador.etiqueta,
      espesorMm: Number(borrador.espesorMm),
      activo: borrador.activo,
      orden: Number(borrador.orden) || 0,
    });
    setGuardando(false);
    const resultado = mensajeRespuesta(respuesta, 'Espesor guardado');
    if (resultado.error) {
      onError(resultado.error);
      return;
    }
    setEditando(null);
    await onRefrescar();
    onMensaje(resultado.ok);
  }

  return (
    <section className="grid gap-3" aria-labelledby="catalogos-espesores">
      <CabeceraSeccion
        titulo="Espesores por material"
        descripcion={SECCIONES_CATALOGOS_BASE[1].descripcion}
        puedeEditar={puedeEditar}
        onNuevo={() => setEditando({ etiqueta: '', espesorMm: '', activo: true, orden: '0' })}
        testid="catalogo-espesor-nuevo"
        etiquetaNuevo="Nuevo espesor"
      />
      <label className="grid max-w-sm gap-1 text-xs font-medium text-texto-secundario">
        Material
        <Select
          value={materialId}
          onChange={(evento) => {
            setMaterialId(evento.target.value);
            setEditando(null);
          }}
          data-testid="catalogo-espesor-material"
        >
          {datos.materiales.map((material) => (
            <option key={material.id} value={material.id}>
              {material.nombre}
              {material.activo ? '' : ' (inactivo)'}
            </option>
          ))}
        </Select>
      </label>

      {editando && materialSeleccionado ? (
        <form
          className="grid gap-3 rounded-lg border border-borde bg-superficie-2/60 p-3 sm:grid-cols-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            void guardar(editando);
          }}
          aria-label="Espesor"
          data-testid="catalogo-espesor-formulario"
        >
          <p className="text-sm font-semibold text-texto-primario sm:col-span-3">
            {editando.id ? 'Editar espesor' : `Nuevo espesor para ${materialSeleccionado.nombre}`}
          </p>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Etiqueta
            <Input
              value={editando.etiqueta}
              onChange={(evento) => setEditando((actual) => (actual ? { ...actual, etiqueta: evento.target.value } : actual))}
              placeholder='p. ej. 3 mm o 1/8"'
              disabled={!puedeEditar}
              maxLength={40}
              required
              data-testid="catalogo-espesor-etiqueta"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Espesor (mm)
            <Input
              type="number"
              min="0.001"
              step="0.001"
              value={editando.espesorMm}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, espesorMm: evento.target.value } : actual))
              }
              disabled={!puedeEditar}
              required
              data-testid="catalogo-espesor-mm"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Orden
            <Input
              type="number"
              min="0"
              step="1"
              value={editando.orden}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, orden: evento.target.value } : actual))
              }
              disabled={!puedeEditar}
              data-testid="catalogo-espesor-orden"
            />
          </label>
          <div className="flex items-center gap-2 sm:col-span-3">
            <Button type="submit" tamano="sm" disabled={!puedeEditar || guardando} data-testid="catalogo-espesor-guardar">
              {guardando ? 'Guardando…' : editando.id ? 'Guardar cambios' : 'Crear'}
            </Button>
            <Button variante="contorno" tamano="sm" onClick={() => setEditando(null)} data-testid="catalogo-espesor-cancelar">
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {espesores.length === 0 ? (
        <EstadoVacio
          titulo="Sin espesores"
          descripcion="Agrega el primer espesor para el material seleccionado."
        />
      ) : (
        <ul className="grid gap-2" data-testid="lista-espesores">
          {espesores.map((espesor) => (
            <li
              key={espesor.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-borde bg-superficie px-3 py-2"
              data-testid={`fila-espesor-${espesor.id}`}
            >
              <span className="flex items-center gap-2 text-sm">
                <span className="font-medium text-texto-primario">{espesor.etiqueta}</span>
                <span className="font-mono text-xs text-texto-secundario">{espesor.espesorMm} mm</span>
                {etiquetaEstado(espesor.activo)}
              </span>
              <span className="flex gap-2">
                <BotonHistorial
                  etiqueta={espesor.etiqueta}
                  onClick={() =>
                    onHistorial({
                      entidad: 'catalogo_espesores',
                      entidadId: espesor.id,
                      etiqueta: espesor.etiqueta,
                    })
                  }
                  testid={`historial-espesor-${espesor.id}`}
                />
                <Button
                  variante="contorno"
                  tamano="sm"
                  disabled={!puedeEditar}
                  onClick={() =>
                    setEditando({
                      id: espesor.id,
                      etiqueta: espesor.etiqueta,
                      espesorMm: String(espesor.espesorMm),
                      activo: espesor.activo,
                      orden: String(espesor.orden),
                    })
                  }
                  data-testid={`editar-espesor-${espesor.id}`}
                >
                  Editar
                </Button>
                <BotonActivo
                  activo={espesor.activo}
                  puedeEditar={puedeEditar}
                  onClick={() =>
                    void alternar(
                      'catalogo_espesores',
                      espesor.id,
                      !espesor.activo,
                      props,
                      `Espesor ${espesor.etiqueta}`,
                    )
                  }
                  testid={`alternar-espesor-${espesor.id}`}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SeccionProcesos(props: PropsSeccion) {
  const { datos, puedeEditar, onRefrescar, onMensaje, onError, onHistorial } = props;
  const [editando, setEditando] = useState<{
    id?: string;
    codigo: string;
    nombre: string;
    prefijoCorrida: string;
    grupoPlaneadoId: string;
    areaTrabajoCodigo: string;
    requiereArchivoTecnico: boolean;
    requierePrimeraPieza: boolean;
    intervaloInspeccionLote: string;
    activo: boolean;
    orden: string;
  } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const gruposActivos = soloActivos(datos.gruposPlaneados);
  const areasActivas = datos.areasTrabajo.filter((area) => area.activo);

  function nuevo(): void {
    setEditando({
      codigo: '',
      nombre: '',
      prefijoCorrida: '',
      grupoPlaneadoId: '',
      areaTrabajoCodigo: '',
      requiereArchivoTecnico: true,
      requierePrimeraPieza: false,
      intervaloInspeccionLote: '10',
      activo: true,
      orden: '0',
    });
  }

  async function guardar(borrador: NonNullable<typeof editando>): Promise<void> {
    setGuardando(true);
    const respuesta = await guardarProcesoAccion({
      id: borrador.id,
      codigo: borrador.codigo,
      nombre: borrador.nombre,
      prefijoCorrida: borrador.prefijoCorrida,
      grupoPlaneadoId: borrador.grupoPlaneadoId || null,
      areaTrabajoCodigo: borrador.areaTrabajoCodigo || null,
      requiereArchivoTecnico: borrador.requiereArchivoTecnico,
      requierePrimeraPieza: borrador.requierePrimeraPieza,
      intervaloInspeccionLote:
        borrador.intervaloInspeccionLote === '' ? null : Number(borrador.intervaloInspeccionLote),
      activo: borrador.activo,
      orden: Number(borrador.orden) || 0,
    });
    setGuardando(false);
    const resultado = mensajeRespuesta(respuesta, 'Proceso guardado');
    if (resultado.error) {
      onError(resultado.error);
      return;
    }
    setEditando(null);
    await onRefrescar();
    onMensaje(resultado.ok);
  }

  function etiquetaGrupo(proceso: ProcesoCatalogo): string {
    const grupo = datos.gruposPlaneados.find((item) => item.id === proceso.grupoPlaneadoId);
    return grupo ? grupo.nombre : '—';
  }

  return (
    <section className="grid gap-3" aria-labelledby="catalogos-procesos">
      <CabeceraSeccion
        titulo="Procesos"
        descripcion={SECCIONES_CATALOGOS_BASE[2].descripcion}
        puedeEditar={puedeEditar}
        onNuevo={nuevo}
        testid="catalogo-proceso-nuevo"
        etiquetaNuevo="Nuevo proceso"
      />
      {editando ? (
        <form
          className="grid gap-3 rounded-lg border border-borde bg-superficie-2/60 p-3 sm:grid-cols-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            void guardar(editando);
          }}
          aria-label="Proceso"
          data-testid="catalogo-proceso-formulario"
        >
          <p className="text-sm font-semibold text-texto-primario sm:col-span-3">
            {editando.id ? 'Editar proceso' : 'Nuevo proceso'}
          </p>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Código
            <Input
              value={editando.codigo}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, codigo: evento.target.value.toUpperCase() } : actual))
              }
              disabled={!puedeEditar}
              maxLength={49}
              required
              data-testid="catalogo-proceso-codigo"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Nombre
            <Input
              value={editando.nombre}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, nombre: evento.target.value } : actual))
              }
              disabled={!puedeEditar}
              maxLength={120}
              required
              data-testid="catalogo-proceso-nombre"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Prefijo de corrida
            <Input
              value={editando.prefijoCorrida}
              onChange={(evento) =>
                setEditando((actual) =>
                  actual ? { ...actual, prefijoCorrida: evento.target.value.toUpperCase() } : actual,
                )
              }
              placeholder="LAS, DOB…"
              disabled={!puedeEditar}
              maxLength={4}
              required
              data-testid="catalogo-proceso-prefijo"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Grupo planeado
            <Select
              value={editando.grupoPlaneadoId}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, grupoPlaneadoId: evento.target.value } : actual))
              }
              disabled={!puedeEditar}
              data-testid="catalogo-proceso-grupo"
            >
              <option value="">Sin grupo</option>
              {gruposActivos.map((grupo) => (
                <option key={grupo.id} value={grupo.id}>
                  {grupo.nombre}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Área de trabajo
            <Select
              value={editando.areaTrabajoCodigo}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, areaTrabajoCodigo: evento.target.value } : actual))
              }
              disabled={!puedeEditar}
              data-testid="catalogo-proceso-area"
            >
              <option value="">Sin área</option>
              {areasActivas.map((area) => (
                <option key={area.codigo} value={area.codigo}>
                  {area.nombre}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Inspección de lote
            <Select
              value={editando.intervaloInspeccionLote}
              onChange={(evento) =>
                setEditando((actual) =>
                  actual ? { ...actual, intervaloInspeccionLote: evento.target.value } : actual,
                )
              }
              disabled={!puedeEditar}
              data-testid="catalogo-proceso-lote"
            >
              <option value="10">Cada 10 piezas</option>
              <option value="20">Cada 20 piezas</option>
              <option value="">No configurada</option>
            </Select>
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-texto-secundario">
            <input
              type="checkbox"
              className="h-4 w-4 accent-acento"
              checked={editando.requiereArchivoTecnico}
              onChange={(evento) =>
                setEditando((actual) =>
                  actual ? { ...actual, requiereArchivoTecnico: evento.target.checked } : actual,
                )
              }
              disabled={!puedeEditar}
              data-testid="catalogo-proceso-archivo-tecnico"
            />
            Exige archivo técnico (LISTO)
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-texto-secundario">
            <input
              type="checkbox"
              className="h-4 w-4 accent-acento"
              checked={editando.requierePrimeraPieza}
              onChange={(evento) =>
                setEditando((actual) =>
                  actual ? { ...actual, requierePrimeraPieza: evento.target.checked } : actual,
                )
              }
              disabled={!puedeEditar}
              data-testid="catalogo-proceso-primera-pieza"
            />
            Exige primera pieza
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-texto-secundario">
            <input
              type="checkbox"
              className="h-4 w-4 accent-acento"
              checked={editando.activo}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, activo: evento.target.checked } : actual))
              }
              disabled={!puedeEditar}
              data-testid="catalogo-proceso-activo"
            />
            Activo
          </label>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Orden
            <Input
              type="number"
              min="0"
              step="1"
              value={editando.orden}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, orden: evento.target.value } : actual))
              }
              disabled={!puedeEditar}
              data-testid="catalogo-proceso-orden"
            />
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <Button type="submit" tamano="sm" disabled={!puedeEditar || guardando} data-testid="catalogo-proceso-guardar">
              {guardando ? 'Guardando…' : editando.id ? 'Guardar cambios' : 'Crear'}
            </Button>
            <Button variante="contorno" tamano="sm" onClick={() => setEditando(null)} data-testid="catalogo-proceso-cancelar">
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-borde">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="bg-superficie-2 text-left text-texto-secundario">
              <th scope="col" className="px-3 py-2 font-semibold">Proceso</th>
              <th scope="col" className="px-3 py-2 font-semibold">Corrida</th>
              <th scope="col" className="px-3 py-2 font-semibold">Grupo</th>
              <th scope="col" className="px-3 py-2 font-semibold">Archivo técnico</th>
              <th scope="col" className="px-3 py-2 font-semibold">Primera pieza</th>
              <th scope="col" className="px-3 py-2 font-semibold">Lote</th>
              <th scope="col" className="px-3 py-2 font-semibold">Estado</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {datos.procesos.map((proceso) => (
              <tr key={proceso.id} className="border-t border-borde" data-testid={`fila-proceso-${proceso.codigo}`}>
                <td className="px-3 py-2">
                  <span className="block font-medium text-texto-primario">{proceso.nombre}</span>
                  <span className="font-mono text-xs text-texto-secundario">{proceso.codigo}</span>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{proceso.prefijoCorrida}</td>
                <td className="px-3 py-2">{etiquetaGrupo(proceso)}</td>
                <td className="px-3 py-2">{proceso.requiereArchivoTecnico ? 'Sí' : 'No'}</td>
                <td className="px-3 py-2">{proceso.requierePrimeraPieza ? 'Sí' : 'No'}</td>
                <td className="px-3 py-2">
                  {proceso.intervaloInspeccionLote ? `Cada ${proceso.intervaloInspeccionLote}` : '—'}
                </td>
                <td className="px-3 py-2">{etiquetaEstado(proceso.activo)}</td>
                <td className="px-3 py-2 text-right">
                  <span className="inline-flex gap-2">
                    <BotonHistorial
                      etiqueta={proceso.nombre}
                      onClick={() =>
                        onHistorial({
                          entidad: 'catalogo_procesos',
                          entidadId: proceso.id,
                          etiqueta: proceso.nombre,
                        })
                      }
                      testid={`historial-proceso-${proceso.codigo}`}
                    />
                    <Button
                      variante="contorno"
                      tamano="sm"
                      disabled={!puedeEditar}
                      onClick={() =>
                        setEditando({
                          id: proceso.id,
                          codigo: proceso.codigo,
                          nombre: proceso.nombre,
                          prefijoCorrida: proceso.prefijoCorrida,
                          grupoPlaneadoId: proceso.grupoPlaneadoId ?? '',
                          areaTrabajoCodigo: proceso.areaTrabajoCodigo ?? '',
                          requiereArchivoTecnico: proceso.requiereArchivoTecnico,
                          requierePrimeraPieza: proceso.requierePrimeraPieza,
                          intervaloInspeccionLote:
                            proceso.intervaloInspeccionLote === null
                              ? ''
                              : String(proceso.intervaloInspeccionLote),
                          activo: proceso.activo,
                          orden: String(proceso.orden),
                        })
                      }
                      data-testid={`editar-proceso-${proceso.codigo}`}
                    >
                      Editar
                    </Button>
                    <BotonActivo
                      activo={proceso.activo}
                      puedeEditar={puedeEditar}
                      onClick={() =>
                        void alternar(
                          'catalogo_procesos',
                          proceso.id,
                          !proceso.activo,
                          props,
                          `Proceso ${proceso.codigo}`,
                        )
                      }
                      testid={`alternar-proceso-${proceso.codigo}`}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ListaSimple({
  item,
  entidad,
  puedeEditar,
  props,
  testidFila,
}: {
  item: GrupoEquipoCatalogo | GrupoPlaneadoCatalogo;
  entidad: EntidadCatalogo;
  puedeEditar: boolean;
  props: PropsSeccion;
  testidFila: string;
}) {
  return (
    <li
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-borde bg-superficie px-3 py-2"
      data-testid={`${testidFila}-${item.codigo}`}
    >
      <span className="flex items-center gap-2 text-sm">
        <span className="font-mono text-xs text-texto-secundario">{item.codigo}</span>
        <span className="font-medium text-texto-primario">{item.nombre}</span>
        {etiquetaEstado(item.activo)}
      </span>
      <span className="flex gap-2">
        <BotonHistorial
          etiqueta={item.nombre}
          onClick={() => props.onHistorial({ entidad, entidadId: item.id, etiqueta: item.nombre })}
          testid={`historial-${testidFila}-${item.codigo}`}
        />
        <BotonActivo
          activo={item.activo}
          puedeEditar={puedeEditar}
          onClick={() => void alternar(entidad, item.id, !item.activo, props, item.nombre)}
          testid={`alternar-${testidFila}-${item.codigo}`}
        />
      </span>
    </li>
  );
}

function SeccionGruposEquipo(props: PropsSeccion) {
  return (
    <SeccionGrupo
      {...props}
      titulo="Grupos de equipo"
      descripcion={SECCIONES_CATALOGOS_BASE[3].descripcion}
      entidad="grupos_equipo"
      items={props.datos.gruposEquipo}
      guardar={(borrador) => guardarGrupoEquipoAccion(borrador)}
      testidPrefijo="catalogo-grupo-equipo"
      testidFila="fila-grupo-equipo"
    />
  );
}

function SeccionGruposPlaneados(props: PropsSeccion) {
  return (
    <SeccionGrupo
      {...props}
      titulo="Grupos planeados"
      descripcion={SECCIONES_CATALOGOS_BASE[4].descripcion}
      entidad="grupos_planeados"
      items={props.datos.gruposPlaneados}
      guardar={(borrador) => guardarGrupoPlaneadoAccion(borrador)}
      testidPrefijo="catalogo-grupo-planeado"
      testidFila="fila-grupo-planeado"
    />
  );
}

function SeccionGrupo(
  props: PropsSeccion & {
    titulo: string;
    descripcion: string;
    entidad: EntidadCatalogo;
    items: Array<GrupoEquipoCatalogo | GrupoPlaneadoCatalogo>;
    guardar: (borrador: {
      id?: string;
      codigo: string;
      nombre: string;
      activo: boolean;
      orden: number;
    }) => Promise<{ exito: boolean; error?: string }>;
    testidPrefijo: string;
    testidFila: string;
  },
) {
  const { titulo, descripcion, items, guardar, onRefrescar, onMensaje, onError, testidPrefijo, testidFila } = props;
  const [editando, setEditando] = useState<FormularioCatalogo | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function enviar(borrador: FormularioCatalogo): Promise<void> {
    setGuardando(true);
    const respuesta = await guardar({
      id: borrador.id,
      codigo: borrador.codigo,
      nombre: borrador.nombre,
      activo: borrador.activo,
      orden: Number(borrador.orden) || 0,
    });
    setGuardando(false);
    const resultado = mensajeRespuesta(respuesta, `${titulo} guardado`);
    if (resultado.error) {
      onError(resultado.error);
      return;
    }
    setEditando(null);
    await onRefrescar();
    onMensaje(resultado.ok);
  }

  return (
    <section className="grid gap-3" aria-label={titulo}>
      <CabeceraSeccion
        titulo={titulo}
        descripcion={descripcion}
        puedeEditar={props.puedeEditar}
        onNuevo={() => setEditando({ ...FORMULARIO_VACIO })}
        testid={`${testidPrefijo}-nuevo`}
        etiquetaNuevo={`Nuevo (${titulo.toLowerCase()})`}
      />
      <FormularioSimple
        titulo={editando?.id ? `Editar ${titulo.toLowerCase()}` : `Nuevo ${titulo.toLowerCase()}`}
        item={editando}
        puedeEditar={props.puedeEditar}
        guardando={guardando}
        onGuardar={(borrador) => void enviar(borrador)}
        onCancelar={() => setEditando(null)}
        testidPrefijo={testidPrefijo}
      />
      <ul className="grid gap-2" data-testid={`lista-${testidFila}`}>
        {items.map((item) => (
          <ListaSimple
            key={item.id}
            item={item}
            entidad={props.entidad}
            puedeEditar={props.puedeEditar}
            props={props}
            testidFila={testidFila}
          />
        ))}
      </ul>
    </section>
  );
}

function SeccionProximasAcciones(props: PropsSeccion) {
  const { datos, puedeEditar, onRefrescar, onMensaje, onError, onHistorial } = props;
  const [editando, setEditando] = useState<{
    id?: string;
    codigo: string;
    nombre: string;
    esOtro: boolean;
    activo: boolean;
    orden: string;
  } | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(borrador: NonNullable<typeof editando>): Promise<void> {
    setGuardando(true);
    const respuesta = await guardarProximaAccionAccion({
      id: borrador.id,
      codigo: borrador.codigo,
      nombre: borrador.nombre,
      esOtro: borrador.esOtro,
      activo: borrador.activo,
      orden: Number(borrador.orden) || 0,
    });
    setGuardando(false);
    const resultado = mensajeRespuesta(respuesta, 'Próxima acción guardada');
    if (resultado.error) {
      onError(resultado.error);
      return;
    }
    setEditando(null);
    await onRefrescar();
    onMensaje(resultado.ok);
  }

  return (
    <section className="grid gap-3" aria-labelledby="catalogos-proximas-acciones">
      <CabeceraSeccion
        titulo="Próximas acciones"
        descripcion={SECCIONES_CATALOGOS_BASE[5].descripcion}
        puedeEditar={puedeEditar}
        onNuevo={() =>
          setEditando({ codigo: '', nombre: '', esOtro: false, activo: true, orden: '0' })
        }
        testid="catalogo-accion-nuevo"
        etiquetaNuevo="Nueva próxima acción"
      />
      {editando ? (
        <form
          className="grid gap-3 rounded-lg border border-borde bg-superficie-2/60 p-3 sm:grid-cols-2"
          onSubmit={(evento) => {
            evento.preventDefault();
            void guardar(editando);
          }}
          aria-label="Próxima acción"
          data-testid="catalogo-accion-formulario"
        >
          <p className="text-sm font-semibold text-texto-primario sm:col-span-2">
            {editando.id ? 'Editar próxima acción' : 'Nueva próxima acción'}
          </p>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Código
            <Input
              value={editando.codigo}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, codigo: evento.target.value.toUpperCase() } : actual))
              }
              disabled={!puedeEditar}
              maxLength={49}
              required
              data-testid="catalogo-accion-codigo"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Nombre
            <Input
              value={editando.nombre}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, nombre: evento.target.value } : actual))
              }
              disabled={!puedeEditar}
              maxLength={120}
              required
              data-testid="catalogo-accion-nombre"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-texto-secundario">
            <input
              type="checkbox"
              className="h-4 w-4 accent-acento"
              checked={editando.esOtro}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, esOtro: evento.target.checked } : actual))
              }
              disabled={!puedeEditar}
              data-testid="catalogo-accion-es-otro"
            />
            Habilita texto libre (&quot;Otro&quot;)
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-texto-secundario">
            <input
              type="checkbox"
              className="h-4 w-4 accent-acento"
              checked={editando.activo}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, activo: evento.target.checked } : actual))
              }
              disabled={!puedeEditar}
              data-testid="catalogo-accion-activo"
            />
            Activo
          </label>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Orden
            <Input
              type="number"
              min="0"
              step="1"
              value={editando.orden}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, orden: evento.target.value } : actual))
              }
              disabled={!puedeEditar}
              data-testid="catalogo-accion-orden"
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" tamano="sm" disabled={!puedeEditar || guardando} data-testid="catalogo-accion-guardar">
              {guardando ? 'Guardando…' : editando.id ? 'Guardar cambios' : 'Crear'}
            </Button>
            <Button variante="contorno" tamano="sm" onClick={() => setEditando(null)} data-testid="catalogo-accion-cancelar">
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}
      <ul className="grid gap-2" data-testid="lista-proximas-acciones">
        {datos.proximasAcciones.map((accion) => (
          <li
            key={accion.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-borde bg-superficie px-3 py-2"
            data-testid={`fila-accion-${accion.codigo}`}
          >
            <span className="flex items-center gap-2 text-sm">
              <span className="font-mono text-xs text-texto-secundario">{accion.codigo}</span>
              <span className="font-medium text-texto-primario">{accion.nombre}</span>
              {accion.esOtro ? <Badge variante="info">Texto libre</Badge> : null}
              {etiquetaEstado(accion.activo)}
            </span>
            <span className="flex gap-2">
              <BotonHistorial
                etiqueta={accion.nombre}
                onClick={() =>
                  onHistorial({
                    entidad: 'catalogo_proximas_acciones',
                    entidadId: accion.id,
                    etiqueta: accion.nombre,
                  })
                }
                testid={`historial-accion-${accion.codigo}`}
              />
              <Button
                variante="contorno"
                tamano="sm"
                disabled={!puedeEditar}
                onClick={() =>
                  setEditando({
                    id: accion.id,
                    codigo: accion.codigo,
                    nombre: accion.nombre,
                    esOtro: accion.esOtro,
                    activo: accion.activo,
                    orden: String(accion.orden),
                  })
                }
                data-testid={`editar-accion-${accion.codigo}`}
              >
                Editar
              </Button>
              <BotonActivo
                activo={accion.activo}
                puedeEditar={puedeEditar}
                onClick={() =>
                  void alternar(
                    'catalogo_proximas_acciones',
                    accion.id,
                    !accion.activo,
                    props,
                    `Próxima acción ${accion.codigo}`,
                  )
                }
                testid={`alternar-accion-${accion.codigo}`}
              />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SeccionCanales(props: PropsSeccion) {
  const { datos, puedeEditar, onRefrescar, onMensaje, onError, onHistorial } = props;
  const [editando, setEditando] = useState<{
    id?: string;
    codigo: string;
    nombre: string;
    esOtro: boolean;
    activo: boolean;
    orden: string;
  } | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(borrador: NonNullable<typeof editando>): Promise<void> {
    setGuardando(true);
    const respuesta = await guardarCanalAccion({
      id: borrador.id,
      codigo: borrador.codigo,
      nombre: borrador.nombre,
      esOtro: borrador.esOtro,
      activo: borrador.activo,
      orden: Number(borrador.orden) || 0,
    });
    setGuardando(false);
    const resultado = mensajeRespuesta(respuesta, 'Canal guardado');
    if (resultado.error) {
      onError(resultado.error);
      return;
    }
    setEditando(null);
    await onRefrescar();
    onMensaje(resultado.ok);
  }

  return (
    <section className="grid min-w-0 gap-3" aria-label="Canales RFQ">
      <CabeceraSeccion
        titulo="Canales RFQ"
        descripcion={SECCIONES_CATALOGOS_BASE[6].descripcion}
        puedeEditar={puedeEditar}
        onNuevo={() => setEditando({ codigo: '', nombre: '', esOtro: false, activo: true, orden: '0' })}
        testid="catalogo-canal-nuevo"
        etiquetaNuevo="Nuevo canal"
      />
      {editando ? (
        <form
          className="grid gap-3 rounded-lg border border-borde bg-superficie-2/60 p-3 sm:grid-cols-2"
          onSubmit={(evento) => {
            evento.preventDefault();
            void guardar(editando);
          }}
          aria-label="Canal RFQ"
          data-testid="catalogo-canal-formulario"
        >
          <p className="text-sm font-semibold text-texto-primario sm:col-span-2">
            {editando.id ? 'Editar canal' : 'Nuevo canal'}
          </p>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Código
            <Input
              value={editando.codigo}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, codigo: evento.target.value.toUpperCase() } : actual))
              }
              disabled={!puedeEditar || Boolean(editando.id)}
              maxLength={49}
              required
              data-testid="catalogo-canal-codigo"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Nombre
            <Input
              value={editando.nombre}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, nombre: evento.target.value } : actual))
              }
              disabled={!puedeEditar}
              maxLength={120}
              required
              data-testid="catalogo-canal-nombre"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-texto-secundario">
            <input
              type="checkbox"
              className="h-4 w-4 accent-acento"
              checked={editando.esOtro}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, esOtro: evento.target.checked } : actual))
              }
              disabled={!puedeEditar}
              data-testid="catalogo-canal-es-otro"
            />
            Exige detalle libre (&quot;Otro&quot;)
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-texto-secundario">
            <input
              type="checkbox"
              className="h-4 w-4 accent-acento"
              checked={editando.activo}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, activo: evento.target.checked } : actual))
              }
              disabled={!puedeEditar}
              data-testid="catalogo-canal-activo"
            />
            Activo
          </label>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Orden
            <Input
              type="number"
              min="0"
              step="1"
              value={editando.orden}
              onChange={(evento) =>
                setEditando((actual) => (actual ? { ...actual, orden: evento.target.value } : actual))
              }
              disabled={!puedeEditar}
              data-testid="catalogo-canal-orden"
            />
          </label>
          <p className="text-xs text-texto-terciario sm:col-span-2">
            Solo un canal puede exigir detalle libre; los canales retirados se desactivan y siguen
            visibles en el historial.
          </p>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" tamano="sm" disabled={!puedeEditar || guardando} data-testid="catalogo-canal-guardar">
              {guardando ? 'Guardando…' : editando.id ? 'Guardar cambios' : 'Crear'}
            </Button>
            <Button
              type="button"
              variante="contorno"
              tamano="sm"
              onClick={() => setEditando(null)}
              data-testid="catalogo-canal-cancelar"
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}
      {datos.canales.length === 0 ? (
        <EstadoVacio titulo="Sin canales" descripcion="Crea el primer canal de origen del RFQ." />
      ) : (
        <ul className="grid min-w-0 gap-2" data-testid="lista-canales">
          {datos.canales.map((canal) => (
            <li
              key={canal.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-borde bg-superficie px-3 py-2"
              data-testid={`fila-canal-${canal.codigo}`}
            >
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs text-texto-secundario">{canal.codigo}</span>
                <span className="font-medium text-texto-primario">{canal.nombre}</span>
                {canal.esOtro ? <Badge variante="info">Texto libre</Badge> : null}
                {etiquetaEstado(canal.activo)}
                <span className="text-xs text-texto-terciario">Orden {canal.orden}</span>
              </span>
              <span className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                <BotonHistorial
                  etiqueta={canal.nombre}
                  onClick={() =>
                    onHistorial({
                      entidad: 'catalogo_canales',
                      entidadId: canal.id,
                      etiqueta: canal.nombre,
                    })
                  }
                  testid={`historial-canal-${canal.codigo}`}
                />
                <Button
                  variante="contorno"
                  tamano="sm"
                  disabled={!puedeEditar}
                  onClick={() =>
                    setEditando({
                      id: canal.id,
                      codigo: canal.codigo,
                      nombre: canal.nombre,
                      esOtro: canal.esOtro,
                      activo: canal.activo,
                      orden: String(canal.orden),
                    })
                  }
                  data-testid={`editar-canal-${canal.codigo}`}
                >
                  Editar
                </Button>
                <BotonActivo
                  activo={canal.activo}
                  puedeEditar={puedeEditar}
                  onClick={() =>
                    void alternar('catalogo_canales', canal.id, !canal.activo, props, `Canal ${canal.codigo}`)
                  }
                  testid={`alternar-canal-${canal.codigo}`}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function entradasSnapshot(datos: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(datos)
    .filter(([, valor]) => valor !== null && valor !== undefined && valor !== '')
    .slice(0, 12)
    .map(([clave, valor]) => [
      clave,
      typeof valor === 'object' ? JSON.stringify(valor) : String(valor),
    ]);
}

function PanelVersiones({
  seleccion,
  onCerrar,
}: {
  seleccion: HistorialSeleccionado;
  onCerrar: () => void;
}) {
  const consulta = useQuery({
    queryKey: claveVersiones(seleccion.entidad, seleccion.entidadId),
    queryFn: async (): Promise<VersionCatalogo[]> => {
      const respuesta = await listarVersionesAccion({
        entidad: seleccion.entidad,
        entidadId: seleccion.entidadId,
      });
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'Historial ausente' : respuesta.error);
      }
      return respuesta.datos;
    },
    staleTime: 0,
  });

  return (
    <section
      className="rounded-lg border border-borde bg-superficie p-4"
      aria-label={`Historial de ${seleccion.etiqueta}`}
      data-testid="catalogos-historial"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-texto-primario">
            Historial de versiones · {seleccion.etiqueta}
          </h3>
          <p className="text-xs text-texto-secundario">
            Cada mutación guarda un snapshot completo; los valores inactivos permanecen visibles.
          </p>
        </div>
        <Button variante="fantasma" tamano="sm" onClick={onCerrar} data-testid="catalogos-historial-cerrar">
          Cerrar
        </Button>
      </div>
      {consulta.isPending ? (
        <p className="mt-3 text-sm text-texto-secundario">Cargando historial…</p>
      ) : null}
      {consulta.isError ? (
        <p role="alert" className="mt-3 text-sm text-peligro-texto">
          No se pudo cargar el historial.
        </p>
      ) : null}
      {consulta.data && consulta.data.length === 0 ? (
        <p className="mt-3 text-sm text-texto-secundario">Sin versiones registradas.</p>
      ) : null}
      {consulta.data && consulta.data.length > 0 ? (
        <ol className="mt-3 grid gap-3" data-testid="catalogos-historial-lista">
          {consulta.data.map((version) => (
            <li key={version.id} className="rounded-md border border-borde bg-superficie-2/50 p-3">
              <p className="text-xs font-semibold text-texto-primario">
                Versión {version.version} · {new Date(version.creadoEn).toLocaleString('es-MX')} ·{' '}
                {version.actorId ? `Actor ${version.actorId.slice(0, 8)}` : 'Sistema'}
              </p>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-texto-secundario sm:grid-cols-2">
                {entradasSnapshot(version.datos).map(([clave, valor]) => (
                  <div key={clave} className="flex gap-2">
                    <dt className="font-mono">{clave}:</dt>
                    <dd className="truncate">{valor}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
