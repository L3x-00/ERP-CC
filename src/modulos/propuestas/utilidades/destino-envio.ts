/**
 * Validación del destino de envío de una propuesta.
 *
 * El mensaje de error solo debe aparecer cuando el valor es inválido: antes se
 * mostraba «El correo debe contener «@»» con un correo correcto porque el
 * mensaje se calculaba con solo comprobar que el campo tuviera texto.
 */
export type ResultadoDestinoEnvio = {
  /** El destino cumple la regla del canal. */
  valido: boolean;
  /** Mensaje para mostrar; `null` mientras el campo está vacío o es válido. */
  error: string | null;
};

const CANALES_TELEFONO = new Set(['WHATSAPP', 'TELEFONO']);

export function evaluarDestinoEnvio(canal: string, destino: string): ResultadoDestinoEnvio {
  const limpio = destino.trim();
  if (limpio === '') {
    return { valido: false, error: null };
  }

  const codigo = canal.trim().toUpperCase();

  if (codigo === 'CORREO') {
    const valido = limpio.includes('@') && !/\s/.test(limpio);
    return {
      valido,
      error: valido ? null : 'El correo debe contener «@» y no tener espacios.',
    };
  }

  if (CANALES_TELEFONO.has(codigo)) {
    const digitos = limpio.replace(/\D/g, '').length;
    return {
      valido: digitos >= 9,
      error: digitos >= 9 ? null : 'El teléfono debe tener al menos 9 números.',
    };
  }

  return { valido: true, error: null };
}
