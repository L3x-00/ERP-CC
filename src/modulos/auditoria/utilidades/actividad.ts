import type { Database } from '@/compartido/tipos/supabase';

import type {
  FiltrosActividad,
  GrupoActividad,
  RegistroActividad,
} from '../tipos/indice';
import type { FiltrosActividadInput } from '../validaciones/esquemas-actividad';

type ArgumentosActividad = Database['public']['Functions']['obtener_actividad']['Args'];

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** true si el texto es un UUID técnico (no debe mostrarse crudo en pantalla). */
export function esUuidTecnico(valor: string): boolean {
  return FORMATO_UUID.test(valor);
}

/** Opciones del filtro de módulo de la vista Actividad. */
export const MODULOS_ACTIVIDAD: readonly { valor: string; etiqueta: string }[] = [
  { valor: 'pipeline', etiqueta: 'RFQ' },
  { valor: 'clientes', etiqueta: 'Clientes' },
  { valor: 'ordenes', etiqueta: 'Órdenes' },
  { valor: 'planeacion', etiqueta: 'Planeación' },
  { valor: 'produccion', etiqueta: 'Producción' },
  { valor: 'inventario', etiqueta: 'Inventario' },
  { valor: 'cobranza', etiqueta: 'Cobranza' },
  { valor: 'gastos', etiqueta: 'Gastos' },
  { valor: 'configuracion', etiqueta: 'Configuración' },
  { valor: 'permisos', etiqueta: 'Permisos' },
  { valor: 'autenticacion', etiqueta: 'Acceso' },
  { valor: 'archivos', etiqueta: 'Archivos' },
  { valor: 'sistema', etiqueta: 'Sistema' },
] as const;

const ETIQUETAS_ACCION: Record<string, string> = {
  crear: 'Alta',
  crear_orden_manual: 'Alta manual de orden',
  actualizar: 'Actualización',
  actualizar_etapa: 'Cambio de etapa',
  cambiar_estado_rfq: 'Cambio de estado del RFQ',
  actualizar_datos_rfq: 'Datos generales del RFQ',
  crear_item_rfq: 'Alta de ítem RFQ',
  actualizar_item_rfq: 'Edición de ítem RFQ',
  cancelar_item_rfq: 'Cancelación de ítem RFQ',
  subir_archivo_rfq: 'Archivo del RFQ',
  eliminar: 'Eliminación',
  iniciar_sesion: 'Inicio de sesión',
  cerrar_sesion: 'Cierre de sesión',
  aprobar: 'Aprobación',
  cancelar: 'Cancelación',
  enviar: 'Envío',
  generar_pdf: 'Generación de PDF',
  programar: 'Programación',
  iniciar: 'Inicio',
  pausar: 'Pausa',
  cerrar: 'Cierre',
  liberar: 'Liberación',
  entregar: 'Entrega',
};

const ETIQUETAS_MODULO = new Map(MODULOS_ACTIVIDAD.map((opcion) => [opcion.valor, opcion.etiqueta]));

function humanizar(codigo: string): string {
  const texto = codigo.replace(/_/g, ' ').trim();
  return texto.length > 0 ? texto.charAt(0).toUpperCase() + texto.slice(1) : codigo;
}

/** Etiqueta legible de una acción; si no hay traducción, humaniza el código. */
export function etiquetaAccion(accion: string): string {
  return ETIQUETAS_ACCION[accion] ?? humanizar(accion);
}

/** Etiqueta legible de un módulo; si no hay traducción, humaniza el código. */
export function etiquetaModulo(modulo: string): string {
  return ETIQUETAS_MODULO.get(modulo) ?? humanizar(modulo);
}

/**
 * Texto seguro para mostrar el registro auditado: etiqueta resuelta, folio/rol
 * visible o un marcador. Nunca devuelve un UUID técnico crudo.
 */
export function textoRecurso(registro: Pick<RegistroActividad, 'recursoId' | 'recursoEtiqueta'>): string {
  if (registro.recursoEtiqueta) {
    return registro.recursoEtiqueta;
  }
  if (esUuidTecnico(registro.recursoId)) {
    return '—';
  }
  return registro.recursoId;
}

/**
 * Convierte la forma plana validada al filtro de dominio con cursor agrupado.
 */
export function construirFiltrosActividad(entrada: FiltrosActividadInput): FiltrosActividad {
  const cursor =
    entrada.cursorCreado && entrada.cursorId
      ? { creadoEn: entrada.cursorCreado, id: entrada.cursorId }
      : undefined;

  return {
    ...(entrada.usuarioId ? { usuarioId: entrada.usuarioId } : {}),
    ...(entrada.modulo ? { modulo: entrada.modulo } : {}),
    ...(entrada.accion ? { accion: entrada.accion } : {}),
    ...(entrada.actorTexto ? { actorTexto: entrada.actorTexto } : {}),
    ...(entrada.recursoId ? { recursoId: entrada.recursoId } : {}),
    ...(entrada.desde ? { desde: entrada.desde } : {}),
    ...(entrada.hasta ? { hasta: entrada.hasta } : {}),
    limite: entrada.limite,
    ...(cursor ? { cursor } : {}),
  };
}

/**
 * Construye los argumentos de la RPC omitiendo los filtros vacíos, para que
 * SQL reciba NULL en lo no especificado.
 */
export function parametrosActividadRpc(
  filtros: FiltrosActividad,
  actorId: string,
): ArgumentosActividad {
  const parametros: ArgumentosActividad = {
    p_actor_id: actorId,
    p_limite: filtros.limite,
  };

  if (filtros.usuarioId) parametros.p_usuario_id = filtros.usuarioId;
  if (filtros.modulo) parametros.p_modulo = filtros.modulo;
  if (filtros.accion) parametros.p_accion = filtros.accion;
  if (filtros.actorTexto) parametros.p_actor_texto = filtros.actorTexto;
  if (filtros.recursoId) parametros.p_recurso_id = filtros.recursoId;
  if (filtros.desde) parametros.p_desde = filtros.desde;
  if (filtros.hasta) parametros.p_hasta = filtros.hasta;
  if (filtros.cursor) {
    parametros.p_cursor_creado = filtros.cursor.creadoEn;
    parametros.p_cursor_id = filtros.cursor.id;
  }

  return parametros;
}

/**
 * Agrupa visualmente los eventos que comparten correlationId (misma acción de
 * negocio). Conserva el orden de primera aparición y agrupa aunque los eventos
 * no sean contiguos dentro de la página. Los eventos sin correlación van
 * sueltos (correlationId null).
 */
export function agruparPorCorrelacion(
  registros: readonly RegistroActividad[],
): GrupoActividad[] {
  const grupos: GrupoActividad[] = [];
  const porCorrelacion = new Map<string, GrupoActividad>();

  for (const registro of registros) {
    if (!registro.correlationId) {
      grupos.push({ correlationId: null, registros: [registro] });
      continue;
    }

    const existente = porCorrelacion.get(registro.correlationId);
    if (existente) {
      existente.registros.push(registro);
      continue;
    }

    const grupo: GrupoActividad = { correlationId: registro.correlationId, registros: [registro] };
    porCorrelacion.set(registro.correlationId, grupo);
    grupos.push(grupo);
  }

  return grupos;
}

/**
 * Título legible de un grupo correlacionado: la acción cuando todos los
 * eventos comparten una, o "Acción de negocio" cuando son eventos distintos.
 */
export function etiquetaGrupoActividad(grupo: GrupoActividad): string {
  const primera = grupo.registros[0];
  if (!primera) {
    return 'Acción de negocio';
  }
  const mismaAccion = grupo.registros.every((registro) => registro.accion === primera.accion);
  return mismaAccion ? etiquetaAccion(primera.accion) : 'Acción de negocio';
}
