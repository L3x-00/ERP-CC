import type { NextConfig } from "next";
import { createMDX } from 'fumadocs-mdx/next';

const nextConfig: NextConfig = {
  async headers() {
    // AUD-16: cabeceras de endurecimiento que no dependen del despliegue.
    // La CSP completa queda pendiente: requiere nonce por petición para no
    // romper los scripts inline de Next.js (ver informe B6).
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
