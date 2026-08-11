# Fase 0 · Subfase 1 — Base técnica y estructura

## Objetivo

Construir una base modular para sustituir el SPA heredado y permitir que los módulos de negocio crezcan sin concentrar lógica en una única pantalla.

## Implementado

- Inicialización con Next.js App Router, TypeScript estricto y Tailwind CSS v4.
- Estructura por dominio en `src/modulos/`, separada de rutas, infraestructura, estado y componentes reutilizables.
- Proveedores globales para datos de servidor, tema y estado de sesión.
- Rutas iniciales para panel, autenticación, piso de producción, portal y módulos futuros.
- Clientes Supabase de navegador, servidor y administración con responsabilidades separadas.
- Configuración de Vitest, alias de rutas y pruebas base.

## Resultado

La Fase 0 dejó los contratos de carpetas, convenciones de TypeScript y un punto de partida seguro para Auth, CRM y los módulos posteriores.
