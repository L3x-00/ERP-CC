import Link from 'next/link';
import { TecladoPin } from '@/modulos/autenticacion/componentes/teclado-pin';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

/**
 * Página de acceso de operadores de piso mediante PIN numérico.
 * Fondo oscuro fijo (independiente del tema del sistema), pensado para uso
 * en planta de producción. La validación del PIN ocurre en `TecladoPin` vía
 * la Server Action `validarPinAccion`. Si hay una sesión de administrador,
 * se ofrece el atajo al piso en solo lectura: ese rol no usa PIN.
 */
export default async function PaginaOperador() {
  const usuario = await obtenerUsuarioServidor();
  const esAdmin = usuario?.rol === 'admin' && usuario.activo;

  return (
    <main className="dark flex min-h-screen flex-col items-center justify-center gap-6 bg-fondo p-4 text-texto-primario sm:p-6">
      <div className="max-w-sm text-center">
        <p className="text-sm font-semibold text-acento">Paso 1 de 2</p>
        <h1 className="mt-1 text-2xl font-bold">Acceso de operador</h1>
        <p className="mt-2 text-sm text-texto-secundario">
          Ingresa tu PIN. Después podrás seleccionar el trabajo asignado.
        </p>
      </div>
      {esAdmin ? (
        <div
          data-testid="acceso-admin-piso"
          className="w-full max-w-sm rounded-xl border border-acento/40 bg-superficie-2 p-4 text-left"
        >
          <p className="text-sm font-semibold text-texto-primario">
            Sesión de administrador detectada
          </p>
          <p className="mt-1 text-xs text-texto-secundario">
            Tu rol no requiere PIN: puedes ver el piso completo en solo lectura.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/produccion-piso"
              className="rounded-md bg-acento px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-acento-hover"
            >
              Ver piso (solo lectura)
            </Link>
            <Link
              href="/produccion"
              className="rounded-md border border-borde-fuerte bg-superficie px-3 py-2 text-sm font-medium text-texto-primario transition-colors hover:bg-superficie-2"
            >
              Panel de producción
            </Link>
          </div>
        </div>
      ) : null}
      <TecladoPin />
    </main>
  );
}
