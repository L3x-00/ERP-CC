/**
 * C31/A11: traducción de errores de Producción a lenguaje de piso.
 *
 * Ningún mensaje muestra códigos técnicos. Cada entrada dice qué está mal y
 * qué debe revisar el operador. La acción se usa para llevarlo al campo exacto.
 */
export interface DescripcionError {
  mensaje: string;
  campo?: string;
  accion: string;
}

const PALABRAS: Readonly<Record<string, string>> = {
  cantidad: 'La cantidad capturada no es válida',
  consumo: 'El consumo registrado no es válido',
  material: 'El material seleccionado no es válido',
  hora: 'La hora capturada no es válida',
  fecha: 'La fecha capturada no es válida',
  sesion: 'La sesión ya no está disponible para esta operación',
  piezas: 'La cantidad de piezas no es válida',
  primera: 'Falta liberar la primera pieza antes de producir',
  extras: 'La jornada del día ya se completó',
  autorizacion: 'Esta operación necesita autorización',
  permiso: 'No tienes permiso para esta acción',
  vecina: 'Otro operador tiene este recurso ocupado',
  corrida: 'La corrida seleccionada no es válida',
  orden: 'La orden ya no permite esta operación',
};

export const MENSAJES_ERROR_PRODUCCION: Readonly<Record<string, DescripcionError>> = {
  // Cierre y consumo
  cierre_sesion_invalido: { mensaje: 'Faltan datos para cerrar la sesión. Revisa las piezas y el consumo antes de intentarlo.', campo: 'piezas-cierre', accion: 'Revisar piezas' },
  cierre_consumo_invalido: { mensaje: 'El consumo capturado no es válido para este cierre. Revisa el material y las cantidades.', campo: 'material-cierre', accion: 'Revisar material' },
  motivo_exceso_invalido: { mensaje: 'El motivo de la demora no es válido. Elige una opción y escribe el detalle antes de cerrar.', accion: 'Revisar demora' },
  consumo_material_requerido: { mensaje: 'Este proceso necesita registrar el consumo de material antes de finalizar. Captura el material usado y la merma.', campo: 'material-cierre', accion: 'Registrar consumo' },
  consumo_piezas_invalido: { mensaje: 'Captura cuántas piezas usaste del proceso anterior, cuántas salieron mal y el motivo.', campo: 'usado-cierre', accion: 'Revisar consumo de piezas' },
  consumo_piezas_menor_produccion: { mensaje: 'Las piezas usadas del proceso anterior deben ser al menos las que produciste. Ajusta «Usado» o la merma.', campo: 'usado-cierre', accion: 'Corregir usado' },
  cantidad_consumo_invalida: { mensaje: 'La cantidad usada o la merma no son válidas. Deben ser números mayores o iguales a cero y al menos una mayor a cero.', campo: 'usado-cierre', accion: 'Revisar cantidades' },
  motivo_consumo_requerido: { mensaje: 'Falta el motivo del consumo de material. Escríbelo para poder cerrar.', campo: 'motivo-consumo', accion: 'Escribir motivo' },
  material_no_corresponde_partida: { mensaje: 'El material elegido no corresponde a esta partida. Selecciona el material del ítem que aparece preseleccionado.', campo: 'material-cierre', accion: 'Cambiar material' },
  material_no_corresponde_corrida: { mensaje: 'El material elegido no pertenece a la corrida de esta orden. Selecciona el material del ítem.', campo: 'material-cierre', accion: 'Cambiar material' },
  material_inexistente_o_inactivo: { mensaje: 'El material seleccionado ya no está disponible. Elige otro material activo.', campo: 'material-cierre', accion: 'Cambiar material' },
  costo_material_no_configurado: { mensaje: 'El material no tiene costo confirmado. Pide a administración que lo configure antes de cerrar.', accion: 'Avisar a administración' },
  tipo_cambio_no_configurado: { mensaje: 'Falta configurar el tipo de cambio. Pide a administración que lo registre antes de cerrar.', accion: 'Avisar a administración' },
  primera_pieza_pendiente: { mensaje: 'Falta liberar la primera pieza antes de declarar producción. Registra la inspección de la primera pieza.', accion: 'Liberar primera pieza' },
  primera_pieza_rechazada: { mensaje: 'La primera pieza fue rechazada. Corrige el problema y vuelve a liberarla antes de producir.', accion: 'Revisar primera pieza' },
  cantidad_excede_meta_proceso: { mensaje: 'Las piezas declaradas superan lo que falta en esta operación. Baja la cantidad y vuelve a intentarlo.', campo: 'piezas-cierre', accion: 'Corregir piezas' },
  cantidad_excede_disponible_proceso: { mensaje: 'No hay suficientes piezas terminadas por el proceso anterior. Declara solo las piezas que tienes disponibles.', campo: 'piezas-cierre', accion: 'Corregir piezas' },
  cantidad_producida_excede_solicitada: { mensaje: 'La producción superaría la cantidad solicitada de la orden. Baja la cantidad declarada.', campo: 'piezas-cierre', accion: 'Corregir piezas' },
  produccion_solo_ultima_secuencia: { mensaje: 'Este proceso no puede declarar piezas hasta que termine la operación anterior.', accion: 'Esperar proceso anterior' },
  proceso_previo_sin_piezas: { mensaje: 'El proceso anterior aún no ha terminado piezas. Espera a que libere piezas antes de continuar.', accion: 'Esperar proceso anterior' },
  // Hora y jornada
  hora_fin_invalida: { mensaje: 'La hora real de conclusión no es válida. Indica una hora correcta.', campo: 'hora-fin-cierre', accion: 'Corregir hora' },
  fecha_fin_futura: { mensaje: 'La hora de conclusión está adelantada. Ajusta la hora a un momento que ya haya pasado.', campo: 'hora-fin-cierre', accion: 'Corregir hora' },
  fecha_fin_anterior_inicio: { mensaje: 'La hora de conclusión es anterior a la hora en que iniciaste. Ajusta la hora de fin.', campo: 'hora-fin-cierre', accion: 'Corregir hora' },
  horas_reales_exceden_sesion: { mensaje: 'El tiempo declarado supera la duración de este bloque. Corrige la hora de conclusión.', campo: 'hora-fin-cierre', accion: 'Corregir hora' },
  horas_extra_sin_autorizacion: { mensaje: 'El tiempo de esta sesión más lo ya trabajado hoy supera la jornada. Si terminaste antes, corrige la hora de conclusión; si trabajaste de más, justifica el exceso o pide autorización.', campo: 'hora-fin-cierre', accion: 'Corregir hora o justificar' },
  minutos_setup_exceden_sesion: { mensaje: 'Los minutos de preparación superan el tiempo de la sesión. Baja los minutos de setup.', accion: 'Corregir preparación' },
  preparacion_invalida: { mensaje: 'La preparación de esta operación ya no es válida. Actualiza la ficha y vuelve a intentarlo.', accion: 'Actualizar ficha' },
  // Sesión y orden
  sesion_no_activa: { mensaje: 'Esta sesión ya fue cerrada o no te pertenece. Actualiza la ficha para ver el estado real.', accion: 'Actualizar ficha' },
  sesion_partida_inconsistente: { mensaje: 'La sesión no corresponde a la partida abierta. Actualiza la ficha y vuelve a abrir el proceso.', accion: 'Actualizar ficha' },
  operador_no_asignado_partida: { mensaje: 'Esta partida ya no está asignada a tu operador. Actualiza la ficha; si sigue así, pide a administración que la reasigne.', accion: 'Actualizar ficha' },
  orden_no_en_proceso: { mensaje: 'La orden ya no está en producción, por eso no se puede cerrar la sesión aquí. Actualiza la ficha.', accion: 'Actualizar ficha' },
  programacion_no_en_proceso: { mensaje: 'La operación programada ya no está en marcha. Actualiza la ficha para ver su estado real.', accion: 'Actualizar ficha' },
  programacion_no_preparada: { mensaje: 'La operación primero debe prepararse antes de iniciar. Pide a Planeación que la prepare.', accion: 'Avisar a Planeación' },
  programa_ya_en_proceso: { mensaje: 'Esta operación ya tiene una sesión en marcha. Actualiza la ficha.', accion: 'Actualizar ficha' },
  operador_o_programacion_con_sesion_activa: { mensaje: 'Esta operación ya tiene una sesión activa. Actualiza la ficha antes de intentarlo de nuevo.', accion: 'Actualizar ficha' },
  recurso_no_disponible: { mensaje: 'El equipo asignado no está disponible. Actualiza la ficha o pide a Planeación que asigne otro equipo.', accion: 'Avisar a Planeación' },
  recurso_inexistente: { mensaje: 'El equipo de esta operación ya no existe. Pide a Planeación que reasigne el recurso.', accion: 'Avisar a Planeación' },
  verificacion_inicio_incompleta: { mensaje: 'Falta completar el checklist de inicio antes de operar.', accion: 'Completar checklist' },
  inspeccion_invalida: { mensaje: 'La inspección capturada no es válida. Revisa el resultado y la causa.', accion: 'Revisar inspección' },
  inspeccion_cierre_duplicada: { mensaje: 'La inspección de cierre ya fue registrada. Actualiza la ficha.', accion: 'Actualizar ficha' },
  retrabajo_invalido: { mensaje: 'Los datos del retrabajo no son válidos. Revisa el material y los minutos.', accion: 'Revisar retrabajo' },
  corrida_invalida: { mensaje: 'La corrida elegida no corresponde a esta operación. Abre de nuevo la ficha y selecciona la corrida correcta.', accion: 'Elegir corrida' },
  corrida_ambigua: { mensaje: 'Tienes más de una corrida abierta. Elige una en el panel antes de continuar.', accion: 'Elegir corrida' },
  corrida_no_corresponde: { mensaje: 'La corrida elegida no es de esta orden. Selecciona la correcta.', accion: 'Elegir corrida' },
  conflicto_idempotencia: { mensaje: 'Esta acción ya se registró para otra operación. Actualiza la ficha y vuelve a intentarlo desde el panel.', accion: 'Actualizar ficha' },
  desconocido: { mensaje: 'No se pudo identificar el problema con los datos capturados. Revisa el material, la hora de conclusión y las piezas, y vuelve a intentarlo.', accion: 'Revisar datos' },
  sin_permiso_planeacion: { mensaje: 'No tienes permiso para preparar operaciones. Pide a Planeación que lo haga.', accion: 'Avisar a Planeación' },
  sin_permiso_cierre_integrado: { mensaje: 'No tienes permiso para cerrar esta corrida integrada. Pide ayuda a administración.', accion: 'Avisar a administración' },
};

/** Convierte un código no previsto en una frase entendible, sin mostrar el código. */
function fraseDesdeCodigo(codigo: string): string {
  const palabras = codigo
    .toLowerCase()
    .split('_')
    .filter((palabra) => palabra.length > 0 && palabra !== 'sin' && palabra !== 'no');
  const primera = palabras[0] ?? 'operación';
  const raiz = PALABRAS[primera] ?? PALABRAS[palabras.find((palabra) => PALABRAS[palabra]) ?? ''] ?? primera;
  const detalle = palabras.slice(1).join(' ').replace(/\s+/g, ' ').trim();
  return detalle.length > 0
    ? `${raiz}: revisa ${detalle} y vuelve a intentarlo.`
    : `${raiz}. Revisa los datos y vuelve a intentarlo.`;
}

export function describirErrorProduccion(codigo: string): DescripcionError {
  return MENSAJES_ERROR_PRODUCCION[codigo] ?? {
    mensaje: fraseDesdeCodigo(codigo),
    accion: 'Revisar datos',
  };
}
