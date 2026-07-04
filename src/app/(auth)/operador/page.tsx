import { TecladoPin } from '@/modulos/autenticacion/componentes/teclado-pin';

/**
 * Página de acceso de operadores de piso mediante PIN numérico.
 * Fondo oscuro fijo (independiente del tema del sistema), pensado para uso
 * en planta de producción. La validación del PIN ocurre en `TecladoPin` vía
 * la Server Action `validarPinAccion`.
 */
export default function PaginaOperador() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-950 p-6 text-zinc-50">
      <h1 className="text-2xl font-bold">Acceso Operador</h1>
      <TecladoPin />
    </main>
  );
}
