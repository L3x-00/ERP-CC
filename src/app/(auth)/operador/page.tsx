import { TecladoPin } from '@/modulos/autenticacion/componentes/teclado-pin';

/**
 * Página de acceso de operadores de piso mediante PIN numérico.
 * Fondo oscuro fijo (independiente del tema del sistema), pensado para uso
 * en planta de producción. La validación del PIN ocurre en `TecladoPin` vía
 * la Server Action `validarPinAccion`.
 */
export default function PaginaOperador() {
  return (
    <main className="dark flex min-h-screen flex-col items-center justify-center gap-6 bg-fondo p-4 text-texto-primario sm:p-6">
      <div className="max-w-sm text-center">
        <p className="text-sm font-semibold text-acento">Paso 1 de 2</p>
        <h1 className="mt-1 text-2xl font-bold">Acceso de operador</h1>
        <p className="mt-2 text-sm text-texto-secundario">
          Ingresa tu PIN. Después podrás seleccionar el trabajo asignado.
        </p>
      </div>
      <TecladoPin />
    </main>
  );
}
