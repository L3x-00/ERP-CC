/** Fecha de calendario (sin hora) en UTC; '—' si el texto no es una fecha válida. */
export function formatearFechaCalendario(fecha: string): string {
  const [anioTexto, mesTexto, diaTexto] = fecha.slice(0, 10).split('-');
  const anio = Number(anioTexto);
  const mes = Number(mesTexto);
  const dia = Number(diaTexto);
  const valor = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    !Number.isFinite(anio)
    || !Number.isFinite(mes)
    || !Number.isFinite(dia)
    || valor.getUTCFullYear() !== anio
    || valor.getUTCMonth() !== mes - 1
    || valor.getUTCDate() !== dia
  ) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(valor);
}

export function claveValor(valor: unknown): string {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}
