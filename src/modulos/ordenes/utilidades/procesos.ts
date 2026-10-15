function claveCanonica(proceso: string): string {
  return proceso
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, ' ');
}

/**
 * Resume los procesos de una partida para la ficha: la ruta guarda un nombre por paso, así que
 * dos pasos «Láser CO₂» se muestran como «Láser CO₂ (2 operaciones)». Agrupa por nombre sin
 * mayúsculas, acentos ni espacios sobrantes, conserva el nombre de la primera aparición y el orden
 * de los demás. Sin procesos devuelve «—». El detalle por paso vive en la pestaña Ruta.
 */
export function resumirProcesos(procesos: readonly string[], separador = ' · '): string {
  const grupos = new Map<string, { nombre: string; operaciones: number }>();
  for (const proceso of procesos) {
    const nombre = proceso.trim();
    if (nombre === '') continue;
    const clave = claveCanonica(nombre);
    const grupo = grupos.get(clave);
    if (grupo) grupo.operaciones += 1;
    else grupos.set(clave, { nombre, operaciones: 1 });
  }
  if (grupos.size === 0) return '—';
  return [...grupos.values()]
    .map(({ nombre, operaciones }) => (operaciones > 1 ? `${nombre} (${operaciones} operaciones)` : nombre))
    .join(separador);
}
