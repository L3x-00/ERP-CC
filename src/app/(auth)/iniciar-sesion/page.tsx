import { FormularioIniciarSesion } from '@/modulos/autenticacion/componentes/formulario-iniciar-sesion';

/**
 * Página de inicio de sesión con correo y contraseña (admin, ventas, gerentes).
 * Server Component simple: solo presenta el título y el formulario centrado;
 * toda la lógica de autenticación vive en `FormularioIniciarSesion` y en la
 * Server Action `iniciarSesionAccion`.
 */
export default function PaginaIniciarSesion() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">ORCA MFG ERP</h1>
        <p className="text-sm text-foreground/70">Inicia sesión para continuar</p>
      </div>
      <FormularioIniciarSesion />
    </main>
  );
}
