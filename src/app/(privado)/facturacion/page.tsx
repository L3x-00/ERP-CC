import { redirect } from 'next/navigation';

/**
 * La empresa no emite facturas fiscales: el módulo queda retirado de la
 * navegación y cualquier enlace histórico redirige a Cobranza, que conserva las
 * cuentas por cobrar y los pagos. Las tablas y RPC se mantienen intactas para no
 * romper datos históricos ni los flujos de Cobranza.
 */
export default function PaginaFacturacion() {
  redirect('/cobranza');
}
