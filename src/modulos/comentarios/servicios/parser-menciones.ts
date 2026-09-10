export interface ResultadoMencionesSanitizado {
  textoLimpio: string;
  mencionesJson: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escaparRegex(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Escapa el texto para que pueda mostrarse como texto plano sin interpretar HTML. */
export function escaparTextoComentario(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function claveNombre(nombre: string): string {
  return nombre.trim().toLocaleLowerCase('es-MX');
}

/**
 * Detecta menciones conocidas y devuelve texto escapado. Sólo se resuelven
 * nombres presentes en `usuariosDisponibles`; una cadena `@desconocido` nunca
 * se convierte en un destinatario arbitrario.
 */
export function extraerMencionesYSanitizar(
  texto: string,
  usuariosDisponibles: Array<{ id: string; nombre: string }>,
): ResultadoMencionesSanitizado {
  const usuariosOriginales = usuariosDisponibles
    .filter((usuario) => UUID.test(usuario.id) && usuario.nombre.trim().length > 0)
    .map((usuario) => ({ ...usuario, nombre: usuario.nombre.trim() }));
  const usuarios = [...usuariosOriginales]
    .sort((a, b) => b.nombre.length - a.nombre.length);

  const ids = new Set<string>();
  for (const usuario of usuarios) {
    const nombreEscapado = escaparRegex(usuario.nombre);
    // Se exige una frontera de palabra/espacio para no resolver @Ana dentro
    // de @Anabel. Se aceptan signos habituales antes y después de la mención.
    const expresion = new RegExp(
      `(^|[\\s([{"'.,;:!?])@${nombreEscapado}(?=$|[\\s)\\]}"'.,;:!?])`,
      'giu',
    );
    if (expresion.test(texto)) ids.add(usuario.id);
  }

  // Evita duplicados de la misma persona aunque se la mencione varias veces.
  // Se mantiene el orden en el que los usuarios fueron proporcionados para
  // que la salida sea determinista y fácil de auditar.
  const mencionesJson = usuariosOriginales
    .filter((usuario) => ids.has(usuario.id))
    .map((usuario) => usuario.id)
    .filter((id, indice, todos) => todos.indexOf(id) === indice);

  return {
    textoLimpio: escaparTextoComentario(texto),
    mencionesJson,
  };
}

/** Normaliza nombres para búsquedas de sugerencias sin modificar lo mostrado. */
export function normalizarNombreMencion(nombre: string): string {
  return claveNombre(nombre).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
