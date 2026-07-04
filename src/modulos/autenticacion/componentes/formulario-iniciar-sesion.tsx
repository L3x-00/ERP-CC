'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { iniciarSesionAccion } from '@/modulos/autenticacion/acciones/iniciar-sesion';

/**
 * Formulario de inicio de sesión con correo y contraseña (admin, ventas, gerentes).
 * Envía las credenciales a `iniciarSesionAccion`; en éxito redirige a /tablero,
 * en error muestra el mensaje en rojo. El botón queda deshabilitado mientras envía.
 */
export function FormularioIniciarSesion() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    try {
      const respuesta = await iniciarSesionAccion({ email, contrasena });

      if (respuesta.exito) {
        router.push('/tablero');
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
      className="flex w-full max-w-sm flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
          className="rounded-base border border-foreground/20 bg-background px-3 py-2 text-foreground outline-none focus:border-primario focus:ring-2 focus:ring-primario/30"
          placeholder="tu@empresa.com"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="contrasena" className="text-sm font-medium">
          Contraseña
        </label>
        <input
          id="contrasena"
          name="contrasena"
          type="password"
          autoComplete="current-password"
          required
          value={contrasena}
          onChange={(evento) => setContrasena(evento.target.value)}
          className="rounded-base border border-foreground/20 bg-background px-3 py-2 text-foreground outline-none focus:border-primario focus:ring-2 focus:ring-primario/30"
          placeholder="••••••••"
        />
      </div>

      {error !== null && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="rounded-base bg-primario px-4 py-2 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {enviando ? 'Iniciando sesión…' : 'Iniciar sesión'}
      </button>
    </form>
  );
}
