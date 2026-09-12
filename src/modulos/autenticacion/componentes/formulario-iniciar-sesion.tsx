'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { iniciarSesionAccion } from '@/modulos/autenticacion/acciones/iniciar-sesion';

/**
 * Formulario de inicio de sesión con correo y contraseña (admin, ventas, gerentes).
 * Envía las credenciales a `iniciarSesionAccion`; en éxito redirige a /dashboard,
 * en error muestra el mensaje con rol de alerta. El botón queda deshabilitado
 * mientras envía.
 */
export function FormularioIniciarSesion() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mostrarContrasena, setMostrarContrasena] = useState(false);
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    const marco = requestAnimationFrame(() => setHidratado(true));
    return () => cancelAnimationFrame(marco);
  }, []);

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      const respuesta = await iniciarSesionAccion({ email, contrasena });

      if (respuesta.exito) {
        router.push('/dashboard');
        router.refresh();
        return;
      }

      setError(respuesta.error);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    }

    setEnviando(false);
  }

  return (
    <form
      onSubmit={manejarEnvio}
      method="post"
      data-testid="formulario-iniciar-sesion"
      data-hidratado={hidratado ? 'true' : 'false'}
      className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-borde bg-superficie p-6 shadow-md"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email" obligatorio>Correo electrónico</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
          placeholder="tu@empresa.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contrasena" obligatorio>Contraseña</Label>
        <div className="relative">
          <Input
            id="contrasena"
            name="contrasena"
            type={mostrarContrasena ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={contrasena}
            onChange={(evento) => setContrasena(evento.target.value)}
            placeholder="••••••••"
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setMostrarContrasena((visible) => !visible)}
            aria-label={mostrarContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={mostrarContrasena}
            title={mostrarContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-texto-secundario transition-colors hover:text-texto-primario focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento"
          >
            {mostrarContrasena ? <IconoOjoCerrado /> : <IconoOjoAbierto />}
          </button>
        </div>
      </div>

      {error !== null && (
        <p role="alert" className="text-sm text-peligro-texto">
          {error}
        </p>
      )}

      <Button type="submit" tamano="lg" disabled={enviando} className="w-full">
        {enviando ? 'Iniciando sesión…' : 'Iniciar sesión'}
      </Button>
    </form>
  );
}

/** Icono de ojo abierto (la contraseña es visible). */
function IconoOjoAbierto() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Icono de ojo tachado (la contraseña está oculta). */
function IconoOjoCerrado() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4l16 16" />
      <path d="M10.6 5.7A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.3 17.3 0 0 1-3.4 4.2" />
      <path d="M6.3 7.4A16.7 16.7 0 0 0 2.5 12s3.5 6.5 9.5 6.5c1.3 0 2.5-.3 3.6-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
