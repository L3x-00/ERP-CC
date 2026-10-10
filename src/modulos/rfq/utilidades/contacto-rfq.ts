import type { ContactoPrincipalClienteRfq } from '../acciones/contactos-rfq';

/** Valor especial del selector cuando se elige el contacto propio del cliente. */
export const VALOR_CONTACTO_PRINCIPAL = '__principal__';

export type ContactoClienteRfq = { id: string; nombre: string; correo: string | null };

export type OpcionContactoRfq = { valor: string; etiqueta: string };

/**
 * Arma las opciones del campo "Contacto del cliente" de la Solicitud: primero
 * los contactos vigentes del cliente y, si el cliente trae datos propios que no
 * coinciden con ninguno, una opción para usarlos (se materializa al guardar).
 */
export function opcionesContactoRfq(
  contactos: readonly ContactoClienteRfq[],
  principal: ContactoPrincipalClienteRfq | null,
): OpcionContactoRfq[] {
  const opciones: OpcionContactoRfq[] = contactos.map((contacto) => ({
    valor: contacto.id,
    etiqueta: contacto.correo ? `${contacto.nombre} · ${contacto.correo}` : contacto.nombre,
  }));

  if (!principal || (!principal.nombre && !principal.correo && !principal.telefono)) {
    return opciones;
  }

  const nombrePrincipal = (principal.nombre ?? '').trim().toLowerCase();
  const correoPrincipal = (principal.correo ?? '').trim().toLowerCase();
  const duplicado = contactos.some(
    (contacto) =>
      contacto.nombre.trim().toLowerCase() === nombrePrincipal &&
      (contacto.correo ?? '').trim().toLowerCase() === correoPrincipal,
  );
  if (duplicado) {
    return opciones;
  }

  const detalle = [principal.correo, principal.telefono]
    .filter((valor): valor is string => Boolean(valor))
    .join(' · ');
  opciones.unshift({
    valor: VALOR_CONTACTO_PRINCIPAL,
    etiqueta: `${principal.nombre ?? 'Contacto del cliente'}${detalle ? ` · ${detalle}` : ''}`,
  });
  return opciones;
}
