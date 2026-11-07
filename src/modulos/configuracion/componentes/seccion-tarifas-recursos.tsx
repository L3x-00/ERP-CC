'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import {
  alternarEquipoActivoAccion,
  crearEquipoAccion,
  guardarTarifaRecursoAccion,
  listarTarifasRecursosAccion,
  type TarifaRecurso,
} from '@/modulos/catalogos/acciones/indice';
import type { AreaEquipo } from '@/modulos/catalogos/validaciones/indice';
import type { GrupoEquipoCatalogo, MonedaTarifa } from '@/modulos/catalogos/tipos/indice';

import { parsearMonto, textoMonto } from '@/compartido/utilidades/monto';

import { resumenTarifaGrupo, textoTarifa } from './seccion-tarifas-grupos';

const CLAVE_TARIFAS_RECURSOS = ['configuracion', 'tarifas-recursos'] as const;

type Borrador = { id: string; propia: boolean; tarifa: string; moneda: MonedaTarifa };

type BorradorEquipo = {
  codigo: string;
  nombre: string;
  grupoEquipoId: string;
  area: AreaEquipo;
  activo: boolean;
  propia: boolean;
  tarifa: string;
  moneda: MonedaTarifa;
};

const AREAS_EQUIPO_UI: { valor: AreaEquipo; etiqueta: string }[] = [
  { valor: 'sheet_metal', etiqueta: 'Corte y lámina' },
  { valor: 'taller', etiqueta: 'Taller' },
  { valor: 'acabados', etiqueta: 'Acabados' },
  { valor: 'ext', etiqueta: 'Proveedor externo' },
];

const EQUIPO_VACIO: BorradorEquipo = {
  codigo: '',
  nombre: '',
  grupoEquipoId: '',
  area: 'taller',
  activo: true,
  propia: false,
  tarifa: '',
  moneda: 'MXN',
};

/**
 * C3.2/DC-07: tarifa propia opcional por máquina. Sin tarifa propia la máquina
 * usa la de su Grupo de Equipo; una tarifa propia en cero es explícita y válida.
 */
export function SeccionTarifasRecursos({
  grupos,
  tarifaRespaldo,
  puedeEditar,
  onMensaje,
  onError,
}: {
  grupos: GrupoEquipoCatalogo[];
  /** T1 2026-11-06: respaldo vigente para explicar qué heredará un grupo sin tarifa. */
  tarifaRespaldo: number | null;
  puedeEditar: boolean;
  onMensaje: (mensaje: string) => void;
  onError: (mensaje: string) => void;
}) {
  const clienteQuery = useQueryClient();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [nuevo, setNuevo] = useState<BorradorEquipo | null>(null);
  const consulta = useQuery({
    queryKey: CLAVE_TARIFAS_RECURSOS,
    queryFn: async () => {
      const respuesta = await listarTarifasRecursosAccion();
      if (!respuesta.exito || !respuesta.datos) throw new Error(respuesta.exito ? 'Sin datos' : respuesta.error);
      return respuesta.datos;
    },
  });
  const grupoPorId = new Map(grupos.map((grupo) => [grupo.id, grupo]));

  function descripcion(recurso: TarifaRecurso): string {
    if (recurso.overrideActivo && recurso.tarifaHora !== null && recurso.moneda) {
      return `Tarifa propia: ${textoTarifa({ tarifaHora: recurso.tarifaHora, tarifaMoneda: recurso.moneda })}`;
    }
    const grupo = recurso.grupoEquipoId ? grupoPorId.get(recurso.grupoEquipoId) : undefined;
    if (!grupo) return 'Sin grupo de equipo ni tarifa propia: su costeo quedará bloqueado';
    const resumen = resumenTarifaGrupo(grupo);
    if (resumen === null) {
      return respaldoValido !== null
        ? `Usa la tarifa de ${grupo.nombre}: sin tarifa estándar, usará el respaldo de $${respaldoValido.toFixed(2)}/h`
        : `Usa la tarifa de ${grupo.nombre}: sin tarifa estándar, su costeo se bloqueará`;
    }
    return `Usa la tarifa de ${grupo.nombre}: ${resumen.texto} (${resumen.origen})`;
  }

  async function guardar(valor: Borrador): Promise<void> {
    const tarifa = parsearMonto(valor.tarifa) ?? Number.NaN;
    if (valor.propia && (valor.tarifa.trim() === '' || !Number.isFinite(tarifa) || tarifa < 0)) {
      onError('La tarifa propia debe ser un número mayor o igual a 0');
      return;
    }
    setGuardando(true);
    const respuesta = await guardarTarifaRecursoAccion(
      valor.propia
        ? { recursoId: valor.id, overrideActivo: true, tarifaHora: tarifa, moneda: valor.moneda }
        : { recursoId: valor.id, overrideActivo: false },
    );
    setGuardando(false);
    if (!respuesta.exito) {
      onError(respuesta.error);
      return;
    }
    setBorrador(null);
    await clienteQuery.invalidateQueries({ queryKey: CLAVE_TARIFAS_RECURSOS });
    onMensaje('Tarifa de la máquina guardada');
  }

  /** Aclaración cliente 2026-11-06: alta guiada de un equipo en un solo flujo. */
  async function crearEquipo(): Promise<void> {
    if (!nuevo) return;
    const tarifa = nuevo.propia ? parsearMonto(nuevo.tarifa) : null;
    if (nuevo.propia && (nuevo.tarifa.trim() === '' || tarifa === null || tarifa < 0)) {
      onError('La tarifa propia debe ser un monto válido, por ejemplo 850.50.');
      return;
    }
    if (nuevo.codigo.trim() === '' || nuevo.nombre.trim() === '') {
      onError('Escribe el código y el nombre del equipo.');
      return;
    }
    if (nuevo.grupoEquipoId === '') {
      onError('Elige el grupo de equipo: de él hereda la tarifa estándar.');
      return;
    }
    setGuardando(true);
    const respuesta = await crearEquipoAccion({
      codigo: nuevo.codigo,
      nombre: nuevo.nombre,
      grupoEquipoId: nuevo.grupoEquipoId,
      area: nuevo.area,
      activo: nuevo.activo,
      tarifaPropiaActiva: nuevo.propia,
      ...(nuevo.propia && tarifa !== null
        ? { tarifaHora: tarifa, tarifaMoneda: nuevo.moneda }
        : {}),
    });
    setGuardando(false);
    if (!respuesta.exito) {
      onError(respuesta.error);
      return;
    }
    setNuevo(null);
    await clienteQuery.invalidateQueries({ queryKey: CLAVE_TARIFAS_RECURSOS });
    onMensaje(`Equipo ${respuesta.datos?.nombre ?? nuevo.nombre} creado y listo para usar`);
  }

  /** Un equipo se desactiva, no se borra: conserva su historial. */
  async function alternarActivo(recurso: TarifaRecurso): Promise<void> {
    setGuardando(true);
    const respuesta = await alternarEquipoActivoAccion({
      recursoId: recurso.id,
      activo: !recurso.activo,
    });
    setGuardando(false);
    if (!respuesta.exito) {
      onError(respuesta.error);
      return;
    }
    await clienteQuery.invalidateQueries({ queryKey: CLAVE_TARIFAS_RECURSOS });
    onMensaje(`Equipo ${recurso.nombre} ${recurso.activo ? 'desactivado' : 'activado'}`);
  }

  const grupoNuevo = nuevo ? grupos.find((grupo) => grupo.id === nuevo.grupoEquipoId) : undefined;
  const resumenGrupoNuevo = grupoNuevo ? resumenTarifaGrupo(grupoNuevo) : null;
  const respaldoValido =
    typeof tarifaRespaldo === 'number' && Number.isFinite(tarifaRespaldo) && tarifaRespaldo >= 0
      ? tarifaRespaldo
      : null;

  return (
    <section className="grid min-w-0 gap-3" aria-label="Tarifas por máquina" data-testid="seccion-tarifas-recursos">
      <div>
        <h3 className="text-base font-semibold text-texto-primario">Equipos y sus tarifas</h3>
        <p className="text-sm text-texto-secundario">
          Crea el equipo con su grupo en un solo paso. Hereda la tarifa del grupo; activa una tarifa
          propia solo si esta máquina cuesta distinto.
        </p>
      </div>

      <div className="rounded-md border border-borde bg-superficie-2/60 p-3" data-testid="alta-guiada-equipo">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-texto-primario">Nuevo equipo</p>
            <p className="text-xs text-texto-secundario">
              Al guardarlo queda disponible de inmediato en Planeación.
            </p>
          </div>
          {puedeEditar ? (
            <Button
              type="button"
              variante="contorno"
              tamano="sm"
              onClick={() => setNuevo(nuevo ? null : { ...EQUIPO_VACIO })}
              data-testid="alta-guiada-equipo-nuevo"
            >
              {nuevo ? 'Cancelar' : 'Nuevo equipo'}
            </Button>
          ) : null}
        </div>

        {nuevo ? (
          <form
            className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(evento) => {
              evento.preventDefault();
              void crearEquipo();
            }}
            aria-label="Nuevo equipo"
          >
            <label className="grid gap-1 text-xs font-medium text-texto-secundario">
              Código del equipo
              <Input
                value={nuevo.codigo}
                onChange={(evento) =>
                  setNuevo({ ...nuevo, codigo: evento.target.value.toUpperCase() })
                }
                placeholder="LASER-01"
                maxLength={49}
                required
                data-testid="alta-guiada-equipo-codigo"
              />
              <span className="text-[11px] font-normal">Identifica la máquina. Ejemplo: LASER-01.</span>
            </label>
            <label className="grid gap-1 text-xs font-medium text-texto-secundario">
              Nombre
              <Input
                value={nuevo.nombre}
                onChange={(evento) => setNuevo({ ...nuevo, nombre: evento.target.value })}
                placeholder="Láser Fibra 01"
                maxLength={120}
                required
                data-testid="alta-guiada-equipo-nombre"
              />
              <span className="text-[11px] font-normal">Cómo se verá en Planeación.</span>
            </label>
            <label className="grid gap-1 text-xs font-medium text-texto-secundario">
              Grupo de equipo
              <Select
                value={nuevo.grupoEquipoId}
                onChange={(evento) => setNuevo({ ...nuevo, grupoEquipoId: evento.target.value })}
                required
                data-testid="alta-guiada-equipo-grupo"
              >
                <option value="">Elige el grupo…</option>
                {grupos
                  .filter((grupo) => grupo.activo)
                  .map((grupo) => (
                    <option key={grupo.id} value={grupo.id}>
                      {grupo.nombre}
                    </option>
                  ))}
              </Select>
              <span className="text-[11px] font-normal">De aquí hereda la tarifa estándar.</span>
            </label>
            <label className="grid gap-1 text-xs font-medium text-texto-secundario">
              Área de trabajo
              <Select
                value={nuevo.area}
                onChange={(evento) =>
                  setNuevo({ ...nuevo, area: evento.target.value as AreaEquipo })
                }
                data-testid="alta-guiada-equipo-area"
              >
                {AREAS_EQUIPO_UI.map((area) => (
                  <option key={area.valor} value={area.valor}>
                    {area.etiqueta}
                  </option>
                ))}
              </Select>
            </label>

            <div className="sm:col-span-2 lg:col-span-4" data-testid="alta-guiada-equipo-heredada">
              {nuevo.grupoEquipoId === '' ? (
                <p className="rounded-md bg-superficie px-3 py-2 text-xs text-texto-secundario">
                  Elige el grupo de equipo para ver la tarifa que heredará.
                </p>
              ) : resumenGrupoNuevo !== null ? (
                <p className="rounded-md bg-superficie px-3 py-2 text-xs text-texto-secundario">
                  Tarifa heredada: <span className="font-medium text-texto-primario">{resumenGrupoNuevo.texto}</span>{' '}
                  <span>· {resumenGrupoNuevo.origen}</span>
                </p>
              ) : respaldoValido !== null ? (
                <p className="rounded-md border border-advertencia/40 bg-advertencia-suave px-3 py-2 text-xs text-advertencia-texto">
                  Este grupo no tiene tarifa estándar. El equipo usará la tarifa de respaldo:{' '}
                  <span className="font-medium">${respaldoValido.toFixed(2)}/h</span>. Configura la
                  tarifa del grupo en la sección de arriba.
                </p>
              ) : (
                <p className="rounded-md border border-peligro/40 bg-peligro-suave px-3 py-2 text-xs text-peligro-texto">
                  Este grupo no tiene tarifa estándar y no hay tarifa de respaldo: su costeo se
                  bloqueará. Configura la tarifa del grupo antes de usarlo.
                </p>
              )}
            </div>

            <div className="grid gap-2 sm:col-span-2 lg:col-span-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-acento"
                  checked={nuevo.propia}
                  onChange={(evento) => setNuevo({ ...nuevo, propia: evento.target.checked })}
                  data-testid="alta-guiada-equipo-propia"
                />
                ¿Esta máquina tiene un costo distinto al grupo?
              </label>
              <p className="text-xs text-texto-secundario">
                Si lo dejas apagado, usa la tarifa del grupo. Si lo activas, su tarifa propia sustituye
                la del grupo solo para esta máquina.
              </p>
            </div>

            {nuevo.propia ? (
              <>
                <label className="grid gap-1 text-xs font-medium text-texto-secundario">
                  Tarifa propia por hora
                  <Input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="650.00"
                    value={nuevo.tarifa}
                    onChange={(evento) => setNuevo({ ...nuevo, tarifa: evento.target.value })}
                    required
                    data-testid="alta-guiada-equipo-tarifa"
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-texto-secundario">
                  Moneda
                  <Select
                    value={nuevo.moneda}
                    onChange={(evento) =>
                      setNuevo({
                        ...nuevo,
                        moneda: evento.target.value === 'USD' ? 'USD' : 'MXN',
                      })
                    }
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </Select>
                </label>
              </>
            ) : null}

            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 accent-acento"
                checked={nuevo.activo}
                onChange={(evento) => setNuevo({ ...nuevo, activo: evento.target.checked })}
                data-testid="alta-guiada-equipo-activo"
              />
              Activo
            </label>

            <div className="flex items-end sm:col-span-2 lg:col-span-4">
              <Button type="submit" tamano="sm" disabled={guardando} data-testid="alta-guiada-equipo-guardar">
                {guardando ? 'Creando…' : 'Crear equipo'}
              </Button>
            </div>
          </form>
        ) : null}
      </div>
      {consulta.isPending ? <p className="text-sm text-texto-secundario">Cargando máquinas…</p> : null}
      {consulta.isError ? (
        <p role="alert" className="text-sm text-peligro-texto">
          No se pudieron cargar las tarifas por máquina.
        </p>
      ) : null}
      <ul className="grid gap-2">
        {(consulta.data ?? []).map((recurso) => {
          const editando = borrador?.id === recurso.id ? borrador : null;
          return (
            <li
              key={recurso.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-borde bg-superficie px-3 py-2"
              data-testid={`tarifa-recurso-${recurso.codigo}`}
            >
              <span className="flex min-w-0 flex-col text-sm">
                <span className="flex flex-wrap items-center gap-2 font-medium text-texto-primario">
                  {recurso.nombre}
                  {!recurso.activo ? <Badge variante="neutro">Inactivo</Badge> : null}
                </span>
                <span className="text-texto-secundario">{descripcion(recurso)}</span>
              </span>
              {editando ? (
                <span className="flex min-w-0 flex-wrap items-end gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editando.propia}
                      onChange={(evento) => setBorrador({ ...editando, propia: evento.target.checked })}
                    />
                    Tarifa propia
                  </label>
                  {editando.propia ? (
                    <>
                      <Input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={editando.tarifa}
                        onChange={(evento) => setBorrador({ ...editando, tarifa: evento.target.value })}
                        aria-label={`Tarifa propia por hora de ${recurso.nombre}`}
                        className="w-32"
                      />
                      <Select
                        value={editando.moneda}
                        onChange={(evento) =>
                          setBorrador({ ...editando, moneda: evento.target.value === 'USD' ? 'USD' : 'MXN' })
                        }
                        aria-label={`Moneda de la tarifa de ${recurso.nombre}`}
                      >
                        <option value="MXN">MXN</option>
                        <option value="USD">USD</option>
                      </Select>
                    </>
                  ) : null}
                  <Button type="button" tamano="sm" disabled={guardando} onClick={() => void guardar(editando)}>
                    Guardar
                  </Button>
                  <Button type="button" variante="contorno" tamano="sm" onClick={() => setBorrador(null)}>
                    Cancelar
                  </Button>
                </span>
              ) : puedeEditar ? (
                <span className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variante="contorno"
                    tamano="sm"
                    onClick={() =>
                      setBorrador({
                        id: recurso.id,
                        propia: recurso.overrideActivo,
                        tarifa: recurso.tarifaHora === null ? '' : textoMonto(recurso.tarifaHora),
                        moneda: recurso.moneda ?? 'MXN',
                      })
                    }
                  >
                    Editar tarifa
                  </Button>
                  <Button
                    type="button"
                    variante={recurso.activo ? 'destructivo' : 'contorno'}
                    tamano="sm"
                    disabled={guardando}
                    onClick={() => void alternarActivo(recurso)}
                  >
                    {recurso.activo ? 'Desactivar' : 'Activar'}
                  </Button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
