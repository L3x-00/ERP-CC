import type { Metadata } from 'next';
import { Inter, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import ProveedoresApp from './proveedores';
import '@/estilos/globals.css';

const interSans = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'ORCA MFG ERP - CC Manufacturing Group',
  description: 'Sistema de gestión empresarial para manufactura CNC',
};

export default function LayoutRaiz({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${interSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ProveedoresApp>{children}</ProveedoresApp>
        </ThemeProvider>
      </body>
    </html>
  );
}
