/**
 * Re-export del registrador central de auditoría `registrarLog(...)`.
 * La implementación vive en el núcleo (usa el cliente admin sin RLS)
 * para poder invocarse desde cualquier módulo sin dependencias circulares.
 */
export { registrarLog } from '@/nucleo/auditoria/registrar-log';
