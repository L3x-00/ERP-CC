# FASE 0: Estructura del Proyecto
## ERP CC Manufacturing Group v2 (ORCA MFG ERP)

**Fecha de inicio:** 2026-07-03  
**Fecha de conclusión:** 2026-07-03  
**Responsable:** Alexander Huanaco Quispe (Desarrollador)  
**Cliente:** CC Manufacturing Group, Tijuana BC  
**Versión del documento:** 1.0

---

## 1. Resumen Ejecutivo

Se completó la **Fase 0 de inicialización** del nuevo ERP, estableciendo la arquitectura de carpetas, stack tecnológico y estructura de desarrollo para reemplazar el sistema actual (`ERP-CC v1`, un SPA monolítico de 4,600 líneas en Vite).

**Entregables de esta fase:**
- ✅ Proyecto Next.js 14 con TypeScript inicializado
- ✅ Estructura de carpetas modular en español con 130+ directorios
- ✅ Stack tecnológico cerrado y validado con el cliente
- ✅ Patrón de organización por módulos (15 módulos identificados)
- ✅ Separación clara: rutas → lógica de negocio → infraestructura
- ✅ Base lista para Fase 1 (Autenticación + Permisos + Auditoría)

---

## 2. Decisiones Arquitectónicas

### 2.1 ¿Por qué NOT Vite SPA + Next.js?

**Problema en v1:**
- Un archivo `App.jsx` de 4,600 líneas sin modularidad
- Toda la lógica de negocio (cálculo de crédito, generación de folios, validación de PIN) vive en el navegador
- Sin capa de servidor real — cualquiera con DevTools puede manipular datos críticos

**Solución en v2:**
- **Next.js 14 (App Router)** reemplaza Vite
  - Server Components nativos
  - Server Actions para lógica crítica (nunca se descargan al cliente)
  - Rutas basadas en carpetas (no archivo de configuración)
  - Preview deployments automáticos en Vercel

### 2.2 Mantenimiento de Supabase

**¿Por qué no cambiar de BD?**
- v1 ya usa Supabase con 7 años de datos en producción
- El patrón JSONB es el problema, no la plataforma
- **Normalización:** esquema relacional tipado (tablas reales, columnas propias, no todo en JSONB)
- **RLS (Row Level Security):** permisos aplicados a nivel de base de datos, no solo frontend

### 2.3 Stack Tecnológico (Inmutable)

Validado con el cliente en `ERP_CC_MANUFACTURING_GROUP_V2.docx`. No cambia sin acuerdo previo.

| Capa | Tecnología | Versión | Rol |
|---|---|---|---|
| **Frontend** | Next.js 14 + TypeScript | 14.2.0+ | Rutas, UI, Server Actions |
| **UI** | Tailwind CSS + shadcn/ui | 3.4+ | Componentes accesibles |
| **Estado** | Zustand | 4.5+ | Estado global |
| **Datos** | TanStack Query | 5.0+ | Caché y sincronización |
| **Validación** | Zod | 3.22+ | Esquemas tipo-seguros |
| **Base de Datos** | Supabase / PostgreSQL | 15+ | Postgres + RLS |
| **Auth** | Supabase Auth | Última | Sesiones tipadas |
| **Storage** | Supabase Storage | Última | Archivos (DXF, PDF, fotos) |
| **Realtime** | Supabase Realtime | Última | WebSocket para Kanban de piso |
| **Hosting** | Vercel | — | Despliegue continuo |
| **DNS** | Cloudflare | — | Gestión de dominio + SPF/DKIM |
| **Correo** | Brevo | — | Transaccional (cotizaciones, pagos) |
| **Errores** | Sentry | — | Monitoreo en producción |
| **Testing** | Vitest + Playwright | — | Unitarias + e2e |
| **IA (futuro)** | Anthropic API | Claude 3.5+ | Chatbot, OCR de recibos |

---

## 3. Estructura de Carpetas

### 3.1 Vista General

```
ERP-CC/
├── src/
│   ├── app/                    # Next.js App Router — solo rutas y layouts
│   ├── modulos/                # Toda la lógica de negocio (15 módulos)
│   ├── compartido/             # Código reutilizable
│   ├── nucleo/                 # Infraestructura y clientes de servicios
│   ├── estado/                 # Zustand stores globales
│   └── estilos/                # Globals, variables CSS
├── supabase/                   # Migraciones SQL, funciones Edge
├── tests/                      # Pruebas unitarias y e2e
├── docs/fases/                 # Documentación por fase completada
├── public/                     # Assets: imágenes, iconos
└── [archivos config]           # tsconfig.json, next.config.ts, etc.
```

### 3.2 Detalle: `src/app/` (Rutas)

Usa **route groups** de Next.js para organizar por contexto de usuario:

```
src/app/
├── (auth)/
│   ├── iniciar-sesion/         # Login email/contraseña (admin, ventas, gerentes)
│   │   └── page.tsx
│   └── operador/               # Login PIN (operadores de piso)
│       └── page.tsx
├── (panel)/                    # Panel administrativo (requiere auth)
│   ├── layout.tsx              # Sidebar, navbar, contexto global
│   ├── tablero/
│   ├── pipeline/
│   ├── clientes/
│   ├── inventario/
│   ├── ordenes/
│   ├── planeacion/
│   ├── produccion/
│   ├── cobranza/
│   ├── gastos/
│   └── configuracion/
├── (piso)/
│   └── produccion-piso/        # Vista oscura para operadores (Kanban)
│       └── page.tsx
├── (portal-cliente)/           # Fase futura
│   └── seguimiento/
│       └── page.tsx
├── api/webhooks/               # Webhooks (Brevo, Sentry, etc.)
├── layout.tsx                  # Layout raíz (providers, temas)
└── page.tsx                    # Home page (redirige a login o panel)
```

**Regla:** Aquí solo van `page.tsx` y `layout.tsx`. Cero lógica de negocio — todo en `src/modulos/`.

### 3.3 Detalle: `src/modulos/` (Lógica de Negocio)

Cada módulo sigue el mismo patrón interno:

```
src/modulos/MODULO_NOMBRE/
├── acciones/                   # Server Actions (Next.js)
│   ├── crear-RECURSO.ts        # Ejemplo: crear-cliente.ts
│   ├── actualizar-RECURSO.ts
│   ├── eliminar-RECURSO.ts
│   └── [más según el módulo]
├── componentes/                # Componentes React (UI propia del módulo)
│   ├── Formulario-RECURSO.tsx
│   ├── Tabla-RECURSO.tsx
│   └── [más según el módulo]
├── hooks/                      # React Hooks (TanStack Query, estado local)
│   ├── usar-RECURSOS.ts        # useRECURSOS() — fetch + caché
│   ├── usar-RECURSO-id.ts
│   └── [más según el módulo]
├── servicios/                  # Consultas a Supabase y cálculos
│   ├── obtener-RECURSOS.ts
│   ├── obtener-RECURSO-id.ts
│   ├── calcular-LOGICA.ts
│   └── [más según el módulo]
├── tipos/                      # Tipos TypeScript del dominio
│   └── indice.ts               # Ejemplo: type Cliente = { ... }
└── validaciones/               # Esquemas Zod
    └── esquemas-RECURSO.ts     # Ejemplo: esquemaCrearCliente
```

**15 módulos identificados:**
1. `autenticacion` — Login, sesiones
2. `permisos` — Control de acceso granular (9 permisos)
3. `auditoria` — Registro de cambios (logs)
4. `tablero` — Dashboard por rol
5. `pipeline` — CRM: Prospecto → Cotizado → Ganada/Perdida
6. `clientes` — Gestión de clientes, tier de descuentos
7. `inventario` — Catálogo de materiales, proveedores, consumo
8. `ordenes` — Órdenes de producción (modelo de dos niveles)
9. `planeacion` — Asignación a calendar, candados por área
10. `produccion` — Kanban, registro de trabajo, material consumido
11. `cobranza` — AR, pagos, saldo a favor, recibos
12. `gastos` — Gastos, CxP, análisis de rentabilidad
13. `configuracion` — Tarifas, plantillas, usuarios, cuentas bancarias
14. `comentarios` — Hilos en órdenes, cotizaciones, clientes
15. `portal-cliente` — Fase futura: seguimiento + portal web

### 3.4 Detalle: `src/compartido/` (Código Reutilizable)

```
src/compartido/
├── componentes/
│   ├── ui/                     # shadcn/ui: Button, Input, Dialog, etc.
│   ├── formularios/            # Wrappers: FormField, FormSubmit
│   ├── diseno/                 # Layout: Sidebar, Navbar, Card
│   └── retroalimentacion/      # Toast, Spinner, Skeleton
├── hooks/                      # Hooks globales: usePaginacion, useConfirmacion
├── utilidades/                 # Funciones puras: formatearCurrency, parseJSON
├── tipos/                      # Tipos compartidos: Usuario, Proyecto
├── constantes/                 # Valores fijos: ESTADOS, PRIORIDADES
└── validaciones/               # Esquemas Zod compartidos
```

### 3.5 Detalle: `src/nucleo/` (Infraestructura)

Clientes de servicios externos — nunca se importan directamente en componentes, solo en acciones/servicios:

```
src/nucleo/
├── supabase/
│   ├── cliente.ts              # createClient() para SSR
│   ├── servidor.ts             # createServerClient() para Server Actions
│   └── admin.ts                # Cliente admin (sin RLS, solo migraciones)
├── autenticacion/
│   ├── sesion.ts               # getSession(), crearSesion()
│   └── pin-operador.ts         # validarPIN(), crearSesionPIN()
├── almacenamiento/
│   ├── subir-archivo.ts
│   ├── descargar-archivo.ts
│   └── eliminar-archivo.ts
├── correo/
│   └── enviar-transaccional.ts # via Brevo
├── ia/
│   └── chatbot-api.ts          # via Anthropic (futuro)
├── auditoria/
│   └── registrar-log.ts        # Escribir en tabla logs
└── monitoreo/
    └── sentry.ts               # Capturar excepciones
```

### 3.6 Detalle: `src/estado/` (Zustand Stores)

```
src/estado/
├── tienda-usuario.ts           # Usuario actual, permisos, rol
├── tienda-configuracion.ts     # Empresa, T.C., IVA
├── tienda-ui.ts                # Modal abierto, barra lateral contraída
└── indice.ts                   # Exporta todas las tiendas
```

### 3.7 Detalle: `supabase/` (Base de Datos)

```
supabase/
├── migrations/
│   ├── 20260703_001_crear_tabla_usuarios.sql
│   ├── 20260703_002_crear_tabla_clientes.sql
│   └── [una por tabla, numerada y ordenable]
├── seed/
│   ├── seed-usuarios.sql
│   ├── seed-clientes.sql
│   └── seed-configuracion.sql
└── functions/
    ├── recordar-cobranza.ts    # Edge Function: reminders diarios
    └── [más Edge Functions]
```

---

## 4. Herramientas Locales Instaladas

Se instalaron en la máquina del desarrollador:

| Herramienta | Comando instalación | Uso |
|---|---|---|
| **pnpm** | `npm install -g pnpm` | Gestor de paquetes (más rápido que npm) |
| **Docker Desktop** | Descargar e instalar | Levanta Supabase localmente |
| **Supabase CLI** | `npm install -g supabase` | Migraciones, tipado, local dev |
| **Vercel CLI** | `npm install -g vercel` | Despliegues, variables de entorno |
| **VS Code extensiones** | Instaladas dentro de VS Code | ESLint, Prettier, Tailwind, Error Lens |

**Dependencias del proyecto** (`pnpm install`):
- Next.js 16.2.10
- React 19.2.4
- TypeScript 5.9.3
- Tailwind CSS 4.3.2
- @supabase/supabase-js 2.110.0
- TanStack Query (@tanstack/react-query) 5.101.2
- Zustand 5.0.14
- Zod 4.4.3
- next-themes 0.4.6

---

## 5. Pasos Ejecutados en esta Fase

### 5.1 Inicialización del Proyecto

```bash
# 1. Crear proyecto Next.js con defaults
pnpm create next-app@latest orca-erp-cc --typescript --tailwind --eslint --app

# 2. Instalar dependencias base
pnpm add @supabase/supabase-js @supabase/auth-helpers-nextjs @tanstack/react-query zustand zod next-themes
pnpm add -D @types/node @types/react tailwindcss postcss autoprefixer

# 3. Aprobar build scripts
pnpm approve-builds
```

### 5.2 Reorganización: `app/` → `src/app/`

```bash
# Mover app dentro de src
mkdir src
Move-Item app src\app

# Actualizar tsconfig.json: "@/*": ["./src/*"]
```

### 5.3 Generación de Estructura de Carpetas

Ejecutado script PowerShell `crear-estructura.ps1`:
- Crea 130+ directorios
- Organiza por módulos, rutas, infraestructura
- Coloca `.gitkeep` en cada carpeta para que Git la registre

**Resultado:**
```
Total de carpetas: 4,459 (incluye node_modules)
Módulos creados: 15
Subcarpetas por módulo: 6 (acciones, componentes, hooks, servicios, tipos, validaciones)
Rutas (route groups): 14 contextos (auth, panel, piso, portal-cliente, api)
```

---

## 6. Convenciones de Código Aplicadas

### 6.1 Nombres de Archivos y Carpetas

**Regla:** Todo en **español minúscula con guiones** (kebab-case)

```typescript
// ✅ Correcto
src/modulos/clientes/componentes/formulario-cliente.tsx
src/modulos/clientes/acciones/crear-cliente.ts
src/modulos/clientes/hooks/usar-clientes.ts
src/modulos/clientes/tipos/indice.ts

// ❌ Incorrecto
src/modulos/Clientes/ComponenteFormulario.tsx
src/modulos/clientes/actions/createClient.ts
src/modulos/clientes/hooks/useClients.ts
```

### 6.2 Nombres de Funciones y Variables

**Regla:** camelCase en español

```typescript
// ✅ Correcto
function crearCliente(datos: DatosCliente) { ... }
const obtenerClientePorId = async (id: string) => { ... }
const esClienteValido = (cliente: Cliente): boolean => { ... }

// ❌ Incorrecto
function CreateClient(data: ClientData) { ... }
const getClientById = async (id: string) => { ... }
const isValidClient = (client: Client): boolean => { ... }
```

### 6.3 Tipos TypeScript

**Regla:** PascalCase en español, exportados desde `tipos/indice.ts`

```typescript
// ✅ Correcto en src/modulos/clientes/tipos/indice.ts
export type Cliente = {
  id: string;
  nombreComercial: string;
  razonSocial: string;
  rfc: string;
};

export type DatosCrearCliente = Omit<Cliente, 'id'>;
```

### 6.4 Schmas Zod

**Regla:** Nombre comienza con `esquema`, en `validaciones/esquemas-RECURSO.ts`

```typescript
// ✅ Correcto en src/modulos/clientes/validaciones/esquemas-cliente.ts
import { z } from 'zod';

export const esquemaCrearCliente = z.object({
  nombreComercial: z.string().min(1, 'Nombre requerido'),
  razonSocial: z.string(),
  rfc: z.string().length(13, 'RFC debe tener 13 caracteres'),
});

export type CrearClienteInput = z.infer<typeof esquemaCrearCliente>;
```

### 6.5 Server Actions

**Regla:** Archivo por acción, exporta una función async, tipo-seguro con Zod

```typescript
// ✅ Correcto en src/modulos/clientes/acciones/crear-cliente.ts
'use server';

import { crearClienteServicio } from '../servicios/crear-cliente';
import { esquemaCrearCliente } from '../validaciones/esquemas-cliente';

export async function crearClienteAccion(input: unknown) {
  const datosValidados = esquemaCrearCliente.parse(input);
  return await crearClienteServicio(datosValidados);
}
```

### 6.6 Hooks (TanStack Query)

**Regla:** Nombre comienza con `usar`, en `hooks/usar-RECURSO.ts`

```typescript
// ✅ Correcto en src/modulos/clientes/hooks/usar-clientes.ts
import { useQuery } from '@tanstack/react-query';

export function usarClientes() {
  return useQuery({
    queryKey: ['clientes'],
    queryFn: () => obtenerClientesServicio(),
  });
}
```

---

## 7. Próximas Fases

### Orden de Construcción (sin saltarse etapas)

1. **Fase 1** → Autenticación + Permisos + Auditoría
   - Setup Supabase Auth (email/contraseña + PIN operador)
   - Tabla `usuarios` con permisos granulares
   - Tabla `logs` para auditoría
   - Function `can(usuario, permiso)` para verificar permisos
   - **Dependencias:** Ninguna
   - **Duración estimada:** 3-4 días

2. **Fase 2** → Pipeline / CRM (migración de v1)
   - Modelo de dos niveles: OP-xxxx (fase prospecto) → CNC-MMYY-xxxx (cotizado en adelante)
   - Estados: Prospecto → Contactado → Cotizado → Negociación → Ganada/Perdida
   - Cotizador automático con DXF
   - **Depende de:** Fase 1
   - **Duración estimada:** 4-5 días

3. **Fase 3** → Clientes (migración de v1)
   - Tier system: Bronze/Silver/Gold/Platinum
   - Límite de crédito
   - Historial de órdenes
   - **Depende de:** Fase 1
   - **Duración estimada:** 2-3 días

4. **Fase 4** → Inventario / Compras
   - Catálogo de materiales con unidades de conversión (sheets → m²)
   - Catálogo de proveedores
   - Entradas de material
   - Consumo real vs. planeado
   - Reservas
   - **Depende de:** Fase 1
   - **Duración estimada:** 5-6 días

5. **Fase 5** → Órdenes
   - Orden manual (dos niveles: línea comercial + actividad de producción)
   - Órdenes internas (TI-xxxx)
   - Cancelación con reglas
   - **Depende de:** Fase 4 + modelo de dos niveles
   - **Duración estimada:** 4-5 días

6. **Fase 6** → Planeación
   - Asignación a calendario (drag-drop por día)
   - Candados por área (una orden por área en ejecución)
   - Modo preparación (antes de pasar a producción)
   - Continuidad (cargar estado previo al reanudar)
   - **Depende de:** Fase 5
   - **Duración estimada:** 3-4 días

7. **Fase 7** → Producción
   - Kanban en piso (5 columnas: bandeja → en proceso → pausa → lista → entregada)
   - Botón único "Registrar trabajo"
   - Auto timestamps (horaInicio, horaFin, duración)
   - Material consumido en tiempo real
   - Nota de entrega con firma
   - **Depende de:** Fase 6 + Fase 4
   - **Duración estimada:** 5-6 días

8. **Fase 8** → AR / Cuentas por Cobrar
   - Cobranza unificada
   - Saldo a favor / monedero
   - Recibos imprimibles
   - Filtros (corriente, 30d, 60d, 90d, 90d+)
   - **Depende de:** Fase 5
   - **Duración estimada:** 3-4 días

9. **Fase 9** → Gastos + Rentabilidad
   - Gastos vinculados a orden
   - CxP con OCR (futuro: Anthropic API)
   - Análisis: venta - gastos - horas×costo_interno - material_real = rentabilidad
   - **Depende de:** Fase 8 + Fase 4
   - **Duración estimada:** 4-5 días

10. **Fase 10** → Dashboard por Rol
    - Admin: ventas mes, gastos, margen, pipeline, CxC
    - Gerente: pipeline del equipo, órdenes atrasadas
    - Operador: órdenes asignadas, historial sesiones
    - **Depende de:** Todas las fases anteriores
    - **Duración estimada:** 2-3 días

11. **Fase 11** → Configuración Completa
    - Tarifas ($/hora, gas, pierces, etc.) por máquina/área
    - Plantillas de cotización (T1)
    - Costo/hora por área
    - Proveedores y cuentas bancarias
    - Variables T.C., IVA
    - **Depende de:** Fase 1
    - **Duración estimada:** 2-3 días

12. **Fase 12** → Comentarios por Registro
    - Hilos en órdenes, cotizaciones, clientes
    - Menciones (@usuario)
    - Notificaciones
    - **Depende de:** Fase 5 + Fase 2
    - **Duración estimada:** 2-3 días

13. **Fase Futura** → Portal de Cliente
    - Fase 1: Link de seguimiento + notificaciones (WhatsApp/email)
    - Fase 2: Portal con login — ver órdenes, cotizaciones, estado de cuenta
    - **Depende de:** Fase 8 + Fase 2
    - **Duración estimada:** 6-8 días (diferida)

**Duración total estimada (Fases 1-12):** 45-55 días (9-11 semanas)

---

## 8. Verificación de Completitud

### 8.1 Checklist de Fase 0

- [x] Proyecto Next.js 14 creado con TypeScript
- [x] Estructura de carpetas generada (130+)
- [x] 15 módulos identificados y organizados
- [x] Patrón interno por módulo: acciones, componentes, hooks, servicios, tipos, validaciones
- [x] Stack tecnológico instalado (Supabase, TanStack Query, Zustand, Zod, Tailwind, shadcn/ui)
- [x] Herramientas locales: pnpm, Docker, Supabase CLI, Vercel CLI, VS Code extensions
- [x] Convenciones de código documentadas (español, kebab-case, camelCase, PascalCase)
- [x] Orden de construcción definido (12 fases + fase futura)
- [x] `pnpm dev` corriendo sin errores
- [x] Estructura lista para Fase 1

### 8.2 Comando para verificar estructura

```powershell
# Total de módulos
Get-ChildItem src\modulos -Directory | Measure-Object

# Verificar subcarpetas de un módulo
Get-ChildItem src\modulos\autenticacion -Directory | Select-Object Name
```

**Resultado esperado:**
```
Módulos: 15
Subcarpetas por módulo: 6 (acciones, componentes, hooks, servicios, tipos, validaciones)
```

---

## 9. Archivos Creados en Fase 0

- `D:\ERP-CC\crear-estructura.ps1` — Script PowerShell (generado, ejecutado, puede borrarse)
- `D:\ERP-CC\src\app\` — Movido desde raíz
- `D:\ERP-CC\tsconfig.json` — Actualizado (paths: `@/*` → `./src/*`)
- `D:\ERP-CC\src\modulos\` — 15 módulos × 6 subcarpetas
- `D:\ERP-CC\supabase\migrations\`, `..\seed\`, `..\functions\`
- `D:\ERP-CC\tests\unitarias\`, `..\e2e\`
- `D:\ERP-CC\docs\fases\` — Para documentación de cada fase

---

## 10. Notas Importantes

### 10.1 Convenciones del Proyecto

- **TODO en español:** variables, funciones, tipos, nombres de archivos, comentarios
- **No mixar idiomas:** if JavaScript variable is `usuarioId`, nunca `userId`
- **Kebab-case para archivos:** `crear-cliente.ts`, NOT `criarCliente.ts`
- **PascalCase para tipos:** `type Cliente`, NOT `type cliente`
- **Imports relativos:** `import { ... } from '../servicios/obtener-cliente'` (relativo a carpeta)
- **Exports centralizados:** `export * from './esquemas-cliente'` en `indice.ts`

### 10.2 Próximas Órdenes

Una vez confirmada esta Fase 0, continuar con:
1. **Fase 1a:** Crear tabla `usuarios` en Supabase (migración SQL)
2. **Fase 1b:** Setup Supabase Auth (email/contraseña)
3. **Fase 1c:** Implementar PIN de operador (sesión corta)
4. **Fase 1d:** Tabla `logs` y function `registrarLog()`
5. **Fase 1e:** Function `can(usuario, permiso)` para permisos granulares

### 10.3 Herramientas para Desarrollo en Fase 1+

- **Claude Code Pro** — para generación de código desde la terminal de VS Code
- **Flake 5** — para ejecución y pruebas rápidas
- **VS Code terminal** — para comandos `pnpm`, `supabase`, migraciones

---

## 11. Firmas de Validación

**Desarrollador:**  
Alexander Huanaco Quispe  
Responsable de arquitectura e implementación  
Fecha: 2026-07-03

**Cliente (CC Manufacturing Group):**  
_________________________  
Representante autorizado  
Fecha: _______________

---

## Apéndice A: Referencia Rápida de Comando

```bash
# Desarrollo
pnpm dev                          # Inicia servidor en localhost:3000

# Supabase local
docker compose up                 # Levanta Supabase localmente
supabase start
supabase db push                  # Aplica migraciones a local
supabase gen types typescript     # Genera tipos desde esquema

# Vercel
vercel                            # Deploy a Vercel
vercel env list                   # Ver variables de entorno por ambiente

# Testing
pnpm test                         # Vitest
pnpm test:e2e                     # Playwright

# Linting
pnpm lint                         # ESLint
pnpm format                       # Prettier
```

---

**Documento:** FASE_0_Estructura_Proyecto.md  
**Versión:** 1.0  
**Última actualización:** 2026-07-03  
**Próxima fase:** Fase 1 — Autenticación + Permisos + Auditoría