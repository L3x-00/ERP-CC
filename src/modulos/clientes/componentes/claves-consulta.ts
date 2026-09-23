import type { QueryKey } from '@tanstack/react-query';

import type { FiltrosClientes } from '@/modulos/clientes/servicios/obtener-clientes';

/**
 * Raíz de las consultas del módulo. Bajo esta raíz conviven la lista
 * (`['clientes', <filtros|null>]`), el historial (`['clientes', 'historial', …]`)
 * y los contactos (`['clientes', 'contactos', <clienteId>]`), así que invalidar
 * la raíz completa dispararía relecturas que el evento no justifica.
 */
export const RAIZ_CLIENTES = 'clientes';

/** Raíz de la ficha 360°: `['cliente', <id>]`. */
export const RAIZ_DETALLE_CLIENTE = 'cliente';

/** Clave de los contactos (OBS-02) de un cliente. */
export const CLAVE_CONTACTOS_CLIENTE = [RAIZ_CLIENTES, 'contactos'] as const;

/** Clave de la lista paginada/filtrada de clientes. */
export function claveListaClientes(filtros?: FiltrosClientes) {
  return [RAIZ_CLIENTES, filtros ?? null] as const;
}

/** Clave de la ficha de un cliente (o `null` mientras no hay selección). */
export function claveDetalleCliente(id: string | null) {
  return [RAIZ_DETALLE_CLIENTE, id] as const;
}

/** Clave de los contactos de un cliente concreto. */
export function claveContactosCliente(clienteId: string) {
  return [...CLAVE_CONTACTOS_CLIENTE, clienteId] as const;
}

/**
 * Identifica solo la lista: el segundo elemento es el objeto de filtros (o
 * `null`). Los bloques hermanos usan un `string` ahí (`'historial'`,
 * `'contactos'`), de modo que no se invalidan por error.
 */
export function esClaveListaClientes(clave: QueryKey): boolean {
  return (
    clave.length === 2 &&
    clave[0] === RAIZ_CLIENTES &&
    (clave[1] === null || (typeof clave[1] === 'object' && !Array.isArray(clave[1])))
  );
}

/** Identifica la ficha de cualquier cliente: `['cliente', <id>]`. */
export function esClaveDetalleCliente(clave: QueryKey): boolean {
  return clave.length === 2 && clave[0] === RAIZ_DETALLE_CLIENTE;
}
