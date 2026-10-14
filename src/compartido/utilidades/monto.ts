const MAXIMO_MONTO = 1_000_000_000;

/**
 * Convierte lo que una persona teclea en un campo de monto a número. Acepta
 * símbolo de moneda, espacios y separadores de miles: «$1,250.50», «1 250.5»,
 * «1.250,50», «1250». Devuelve `null` si el texto está vacío, no es un monto o
 * es negativo o excesivo; así el campo puede ser texto libre sin dejar pasar
 * basura al servidor.
 */
export function parsearMonto(texto: string): number | null {
  const limpio = texto.replace(/mxn|usd|mn|[$\s]/gi, '');
  if (limpio === '' || !/^[\d.,]+$/.test(limpio)) return null;

  const ultimaComa = limpio.lastIndexOf(',');
  const ultimoPunto = limpio.lastIndexOf('.');
  let normalizado: string;

  if (ultimaComa !== -1 && ultimoPunto !== -1) {
    // Gana como decimal el separador que aparece al final.
    const decimal = ultimaComa > ultimoPunto ? ',' : '.';
    const miles = decimal === ',' ? '.' : ',';
    normalizado = limpio.split(miles).join('').replace(decimal, '.');
  } else if (ultimaComa !== -1) {
    if (/^\d{1,3}(,\d{3})+$/.test(limpio)) normalizado = limpio.replace(/,/g, '');
    else if (/^\d+,\d{1,2}$/.test(limpio)) normalizado = limpio.replace(',', '.');
    else return null;
  } else if (ultimoPunto !== -1) {
    if (/^\d{1,3}(\.\d{3}){2,}$/.test(limpio)) normalizado = limpio.replace(/\./g, '');
    else if (/^\d*\.\d+$|^\d+\.$/.test(limpio)) normalizado = limpio;
    else return null;
  } else {
    normalizado = limpio;
  }

  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(normalizado)) return null;
  const numero = Number(normalizado);
  if (!Number.isFinite(numero) || numero > MAXIMO_MONTO) return null;
  return numero;
}

/** Texto de un monto para un campo editable: sin notación científica ni ceros sobrantes. */
export function textoMonto(valor: number): string {
  if (!Number.isFinite(valor)) return '';
  return String(Math.round(valor * 10_000) / 10_000);
}
