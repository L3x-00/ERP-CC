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
        <Input
          id="contrasena"
          name="contrasena"
          type="password"
          autoComplete="current-password"
          required
          value={contrasena}
          onChange={(evento) => setContrasena(evento.target.value)}
          placeholder="••••••••"
        />
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
