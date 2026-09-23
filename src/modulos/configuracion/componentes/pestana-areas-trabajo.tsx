'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
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
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import {
  actualizarAreasOperadorAccion,
  guardarAreaTrabajoAccion,
} from '@/modulos/configuracion/acciones/indice';
import {
  AREAS_PLANEACION_CATALOGO,
  TIPOS_AREA_TRABAJO,
  type AreaPlaneacionCatalogo,
  type AreaTrabajoConfig,
  type TipoAreaTrabajo,
} from '@/modulos/configuracion/tipos/indice';
import type { OperadorAreaConfig } from '@/modulos/configuracion/servicios/indice';

const ETIQUETA_TIPO: Record<TipoAreaTrabajo, string> = {
  area: 'Área',
  subarea: 'Subárea',
  proceso: 'Proceso',
};

const ETIQUETA_AREA_PLANEACION: Record<AreaPlaneacionCatalogo, string> = {
  sheet_metal: 'Sheet metal',
  taller: 'Taller',
  acabados: 'Acabados',
  ext: 'Externo',
};

const FORMULARIO_VACIO = {
  codigo: '',
  nombre: '',
  colorHex: '#3B82F6',
  costoHoraInterno: '0',
  tarifaHoraVenta: '0',
  esExterno: false,
  activo: true,
  orden: '0',
  tipo: 'area' as TipoAreaTrabajo,
  padreCodigo: '',
  areaPlaneacion: '',
};

/** Raíces primero y cada hijo debajo de su padre para leer la jerarquía. */
function ordenarJerarquia(areas: readonly AreaTrabajoConfig[]): AreaTrabajoConfig[] {
  const codigos = new Set(areas.map((area) => area.codigo));
  const raices = areas
    .filter((area) => !area.padreCodigo || !codigos.has(area.padreCodigo))
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
  const hijos = (codigo: string): AreaTrabajoConfig[] =>
    areas
      .filter((area) => area.padreCodigo === codigo)
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
      .flatMap((area) => [area, ...hijos(area.codigo)]);
  const ordenadas = raices.flatMap((raiz) => [raiz, ...hijos(raiz.codigo)]);
  const incluidas = new Set(ordenadas.map((area) => area.id));
  return [...ordenadas, ...areas.filter((area) => !incluidas.has(area.id))];
}

function mapaInicial(operadores: readonly OperadorAreaConfig[]): Record<string, string[]> {
  return Object.fromEntries(operadores.map((operador) => [operador.id, [...operador.areas]]));
}

export function PestanaAreasTrabajo({
  datos,
  operadores,
  onGuardado,
  onOperadoresGuardados,
}: {
  datos: readonly AreaTrabajoConfig[];
  operadores: readonly OperadorAreaConfig[];
  onGuardado: (area: AreaTrabajoConfig) => void;
  onOperadoresGuardados: (operadores: OperadorAreaConfig[]) => void;
}) {
  const [seleccionada, setSeleccionada] = useState<AreaTrabajoConfig | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [formulario, setFormulario] = useState(FORMULARIO_VACIO);
  const [seleccionAreas, setSeleccionAreas] = useState<Record<string, string[]>>(() =>
    mapaInicial(operadores),
  );
  const [operadorGuardando, setOperadorGuardando] = useState<string | null>(null);
  const [mensajeOperador, setMensajeOperador] = useState<string | null>(null);

  const areasOrdenadas = useMemo(() => ordenarJerarquia(datos), [datos]);
  const opcionesPadre = useMemo(
    () =>
      datos.filter(
        (area) =>
          area.tipo !== 'proceso'
          && area.codigo !== formulario.codigo
          && area.activo,
      ),
    [datos, formulario.codigo],
  );
  const nombrePorCodigo = useMemo(
    () => new Map(datos.map((area) => [area.codigo, area.nombre])),
    [datos],
  );
  const areasSeleccionables = useMemo(
    () => datos.filter((area) => area.activo).map((area) => area.codigo),
    [datos],
  );

  function cargarFormulario(area: AreaTrabajoConfig): void {
    setFormulario({
      codigo: area.codigo,
      nombre: area.nombre,
      colorHex: area.colorHex,
      costoHoraInterno: String(area.costoHoraInterno),
      tarifaHoraVenta: String(area.tarifaHoraVenta),
      esExterno: area.esExterno,
      activo: area.activo,
      orden: String(area.orden),
      tipo: area.tipo,
      padreCodigo: area.padreCodigo ?? '',
      areaPlaneacion: area.areaPlaneacion ?? '',
    });
  }

  function nuevo(): void {
    setSeleccionada(null);
    setFormulario(FORMULARIO_VACIO);
    setMensaje(null);
  }

  async function guardar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const respuesta = await guardarAreaTrabajoAccion({
        id: seleccionada?.id,
        codigo: formulario.codigo,
        nombre: formulario.nombre,
        colorHex: formulario.colorHex,
        costoHoraInterno: Number(formulario.costoHoraInterno),
        tarifaHoraVenta: Number(formulario.tarifaHoraVenta),
        esExterno: formulario.esExterno,
        activo: formulario.activo,
        orden: Number(formulario.orden),
        tipo: formulario.tipo,
        ...(formulario.padreCodigo === '' ? {} : { padreCodigo: formulario.padreCodigo }),
        ...(formulario.areaPlaneacion === ''
          ? {}
          : { areaPlaneacion: formulario.areaPlaneacion as AreaPlaneacionCatalogo }),
      });
      if (!respuesta.exito || !respuesta.datos) setMensaje(respuesta.exito ? 'No se recibió el área actualizada' : respuesta.error);
      else { onGuardado(respuesta.datos); setMensaje('Área guardada'); }
    } catch {
      setMensaje('No se pudo guardar el área');
    } finally {
      setGuardando(false);
    }
  }

  function alternarAreaOperador(operadorId: string, codigo: string): void {
    setSeleccionAreas((previo) => {
      const actuales = previo[operadorId] ?? [];
      return {
        ...previo,
        [operadorId]: actuales.includes(codigo)
          ? actuales.filter((area) => area !== codigo)
          : [...actuales, codigo],
      };
    });
    setMensajeOperador(null);
  }

  async function guardarOperador(operador: OperadorAreaConfig): Promise<void> {
    setOperadorGuardando(operador.id);
    setMensajeOperador(null);
    try {
      const areas = seleccionAreas[operador.id] ?? [];
      const respuesta = await actualizarAreasOperadorAccion({
        operadorId: operador.id,
        areas,
      });
      if (!respuesta.exito) {
        setMensajeOperador(respuesta.error);
        return;
      }
      setMensajeOperador(`Áreas de ${operador.nombre} guardadas`);
      onOperadoresGuardados(
        operadores.map((actual) =>
          actual.id === operador.id ? { ...actual, areas: [...areas].sort() } : actual,
        ),
      );
    } catch {
      setMensajeOperador('No se pudieron guardar las áreas del operador');
    } finally {
      setOperadorGuardando(null);
    }
  }

  return (
    <div className="flex flex-col gap-6" data-testid="configuracion-areas">
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="titulo-areas-config" className="grid gap-3">
          <div className="flex items-center justify-between gap-2"><h2 id="titulo-areas-config" className="text-lg font-semibold text-texto-primario">Áreas configuradas</h2><Button tamano="sm" variante="contorno" onClick={nuevo}>Nueva área</Button></div>
          {datos.length === 0 ? (
            <EstadoVacio
              titulo="Sin áreas configuradas"
              descripcion="Crea la primera área de trabajo para definir tarifas internas y de venta."
            />
          ) : (
            <TablaContenedor>
              <Tabla className="min-w-[720px]">
                <caption className="sr-only">Catálogo de áreas, subáreas y procesos</caption>
                <TablaEncabezado>
                  <tr>
                    <TablaEncabezadoCelda>Código</TablaEncabezadoCelda>
                    <TablaEncabezadoCelda>Área / subárea / proceso</TablaEncabezadoCelda>
                    <TablaEncabezadoCelda>Planeación</TablaEncabezadoCelda>
                    <TablaEncabezadoCelda>Interno/h</TablaEncabezadoCelda>
                    <TablaEncabezadoCelda>Venta/h</TablaEncabezadoCelda>
                    <TablaEncabezadoCelda>Estado</TablaEncabezadoCelda>
                    <TablaEncabezadoCelda><span className="sr-only">Acción</span></TablaEncabezadoCelda>
                  </tr>
                </TablaEncabezado>
                <TablaCuerpo>
                  {areasOrdenadas.map((area) => {
                    const esHija = area.padreCodigo !== null;
                    return (
                      <TablaFila key={area.id} className="h-12" data-testid={`area-fila-${area.codigo}`}>
                        <TablaCelda className="font-mono">{area.codigo}</TablaCelda>
                        <TablaCelda>
                          <span className={esHija ? 'flex items-center gap-2 pl-4' : 'flex items-center gap-2'}>
                            <span
                              aria-hidden="true"
                              className="h-3 w-3 shrink-0 rounded-full border border-borde"
                              style={{ backgroundColor: area.colorHex }}
                            />
                            {area.nombre}
                            <span className="text-xs text-texto-secundario">
                              {ETIQUETA_TIPO[area.tipo]}
                              {area.padreCodigo ? ` · de ${area.padreCodigo}` : ''}
                            </span>
                          </span>
                        </TablaCelda>
                        <TablaCelda className="text-xs text-texto-secundario">
                          {area.areaPlaneacion ? ETIQUETA_AREA_PLANEACION[area.areaPlaneacion] : 'Hereda'}
                        </TablaCelda>
                        <TablaCelda className="tabular-nums">{area.costoHoraInterno.toFixed(2)}</TablaCelda>
                        <TablaCelda className="tabular-nums">{area.tarifaHoraVenta.toFixed(2)}</TablaCelda>
                        <TablaCelda><BadgeEstado estado={area.activo ? 'activo' : 'inactivo'} /></TablaCelda>
                        <TablaCelda>
                          <Button tamano="sm" variante="fantasma" onClick={() => { setSeleccionada(area); cargarFormulario(area); }}>Editar</Button>
                        </TablaCelda>
                      </TablaFila>
                    );
                  })}
                </TablaCuerpo>
              </Tabla>
            </TablaContenedor>
          )}
        </section>
        <form className="grid content-start gap-3 rounded-lg border border-borde bg-superficie p-4" onSubmit={guardar} aria-label="Editor de área de trabajo">
          <h2 className="text-lg font-semibold">{seleccionada ? `Editar ${seleccionada.codigo}` : 'Nueva área'}</h2>
          <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-area-codigo">Código<Input id="configuracion-area-codigo" value={formulario.codigo} onChange={(e) => setFormulario((v) => ({ ...v, codigo: e.target.value.toUpperCase() }))} required maxLength={49} /></label>
          <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-area-nombre">Nombre<Input id="configuracion-area-nombre" value={formulario.nombre} onChange={(e) => setFormulario((v) => ({ ...v, nombre: e.target.value }))} required maxLength={120} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-area-tipo">Clasificación
              <Select id="configuracion-area-tipo" data-testid="configuracion-area-tipo" value={formulario.tipo} onChange={(e) => setFormulario((v) => ({ ...v, tipo: e.target.value as TipoAreaTrabajo }))}>
                {TIPOS_AREA_TRABAJO.map((tipo) => (
                  <option key={tipo} value={tipo}>{ETIQUETA_TIPO[tipo]}</option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-area-padre">Dentro de (opcional)
              <Select id="configuracion-area-padre" data-testid="configuracion-area-padre" value={formulario.padreCodigo} onChange={(e) => setFormulario((v) => ({ ...v, padreCodigo: e.target.value }))}>
                <option value="">Sin padre (raíz)</option>
                {opcionesPadre.map((area) => (
                  <option key={area.codigo} value={area.codigo}>{area.nombre}</option>
                ))}
              </Select>
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-area-planeacion">Área de Planeación (opcional)
            <Select id="configuracion-area-planeacion" data-testid="configuracion-area-planeacion" value={formulario.areaPlaneacion} onChange={(e) => setFormulario((v) => ({ ...v, areaPlaneacion: e.target.value }))}>
              <option value="">Heredar del padre</option>
              {AREAS_PLANEACION_CATALOGO.map((area) => (
                <option key={area} value={area}>{ETIQUETA_AREA_PLANEACION[area]}</option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-area-color">Color hexadecimal<Input id="configuracion-area-color" type="color" value={formulario.colorHex} onChange={(e) => setFormulario((v) => ({ ...v, colorHex: e.target.value }))} /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-area-costo">Costo interno/h<Input id="configuracion-area-costo" type="number" min="0" step="0.01" value={formulario.costoHoraInterno} onChange={(e) => setFormulario((v) => ({ ...v, costoHoraInterno: e.target.value }))} required /></label><label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-area-venta">Tarifa venta/h<Input id="configuracion-area-venta" type="number" min="0" step="0.01" value={formulario.tarifaHoraVenta} onChange={(e) => setFormulario((v) => ({ ...v, tarifaHoraVenta: e.target.value }))} required /></label></div>
          <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-area-orden">Orden<Input id="configuracion-area-orden" type="number" min="0" step="1" value={formulario.orden} onChange={(e) => setFormulario((v) => ({ ...v, orden: e.target.value }))} required /></label>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={formulario.esExterno} onChange={(e) => setFormulario((v) => ({ ...v, esExterno: e.target.checked }))} /> Capacidad externa</label>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={formulario.activo} onChange={(e) => setFormulario((v) => ({ ...v, activo: e.target.checked }))} /> Área activa</label>
          <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={guardando} data-testid="guardar-area-trabajo">{guardando ? 'Guardando…' : 'Guardar área'}</Button>{mensaje ? <p role="status" className="text-sm text-texto-secundario">{mensaje}</p> : null}</div>
        </form>
      </div>

      {/* OBS-09/PRD-11: qué áreas puede atender cada operador. */}
      <section aria-labelledby="titulo-operadores-areas" className="grid gap-3" data-testid="areas-operadores">
        <div className="flex flex-col gap-1">
          <h2 id="titulo-operadores-areas" className="text-lg font-semibold text-texto-primario">Operadores por área</h2>
          <p className="text-sm text-texto-secundario">
            Marca las áreas, subáreas o procesos que cada operador puede atender. Un operador sin marcas
            no queda restringido; con marcas, no puede tomar trabajo de otra área macro.
          </p>
        </div>
        {operadores.length === 0 ? (
          <EstadoVacio
            titulo="Sin operadores activos"
            descripcion="Da de alta operadores para habilitar sus áreas de trabajo."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {operadores.map((operador) => {
              const seleccionadas = seleccionAreas[operador.id] ?? [];
              // Las áreas asignadas que luego se desactivaron deben seguir
              // visibles: la RPC rechaza guardarlas y el administrador necesita
              // poder quitarlas expresamente antes de confirmar otro cambio.
              const noDisponibles = seleccionadas.filter(
                (codigo) => !areasSeleccionables.includes(codigo),
              );
              const opciones = [
                ...areasSeleccionables,
                ...operador.areas.filter((codigo) => !areasSeleccionables.includes(codigo)),
              ];
              return (
                <li key={operador.id} className="rounded-lg border border-borde bg-superficie p-3" data-testid={`areas-operador-fila-${operador.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-texto-primario">{operador.nombre}</span>
                    <Button
                      tamano="sm"
                      variante="contorno"
                      disabled={operadorGuardando === operador.id}
                      onClick={() => void guardarOperador(operador)}
                      data-testid={`guardar-areas-operador-${operador.id}`}
                    >
                      {operadorGuardando === operador.id ? 'Guardando…' : 'Guardar áreas'}
                    </Button>
                  </div>
                  {noDisponibles.length > 0 ? (
                    <p className="mt-2 text-sm text-advertencia-texto" role="status">
                      Desmarca las áreas inactivas o no disponibles antes de guardar.
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                    {opciones.map((codigo) => (
                      <label key={codigo} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={seleccionadas.includes(codigo)}
                          disabled={!areasSeleccionables.includes(codigo) && !seleccionadas.includes(codigo)}
                          onChange={() => alternarAreaOperador(operador.id, codigo)}
                          data-testid={`areas-operador-check-${operador.id}-${codigo}`}
                        />
                        <span className="font-mono text-xs">{codigo}</span>
                        <span className="text-texto-secundario">
                          {nombrePorCodigo.get(codigo) ?? ''}
                        </span>
                        {noDisponibles.includes(codigo) ? (
                          <span className="text-advertencia-texto">Inactiva o no disponible</span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {mensajeOperador ? (
          <p role="status" data-testid="areas-operador-mensaje" className="text-sm text-texto-secundario">
            {mensajeOperador}
          </p>
        ) : null}
      </section>
    </div>
  );
}
