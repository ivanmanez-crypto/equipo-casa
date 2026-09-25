# 🏠 Equipo Casa

Mini app familiar (PWA) de tareas de casa y paga semanal:

- **Niños**: entran con su PIN de 4 cifras, marcan tareas como hechas y ven sus puntos.
- **Padres**: validan (✅/❌), dan puntos sorpresa con un motivo, ven la paga de la semana y la marcan como pagada.
- **Sin App Store**: se instala desde el navegador y funciona como una app.

## Cómo funciona la paga

| Capa | Qué es | ¿Da dinero? |
|---|---|---|
| **Paga base** | Cantidad fija semanal para cada hijo | Sí, siempre |
| **Tareas obligatorias** | Lo que se hace por ser parte del equipo (cama, plato, deberes…) | No. Se ve el % cumplido |
| **Tareas extra** | Ayudas que suman ⭐ cuando los padres las validan | Sí: ⭐ × €/punto, con tope semanal |
| **Puntos sorpresa** | Los padres premian algo que no estaba en la lista, con un motivo | Sí, igual que los extras |
| **Reto de hermanos** | Objetivo común; lo consiguen juntos o nadie | No: premio de experiencia (peli, cena…) |

Todo (tareas, puntos, € por punto, tope, reto, paga base) se cambia desde **Ajustes** en el modo padres.

## Privacidad

- Este repositorio **solo contiene código y datos de ejemplo** ("Hijo", "Hija"). Los datos reales están en tu proyecto de Supabase.
- La web abierta sin activar solo muestra la pantalla **"Activa este dispositivo"**. Sin una cuenta de la familia, la base de datos no devuelve nada, ni siquiera los nombres.
- Los PIN se guardan cifrados y se comprueban en el servidor. Tras 5 intentos fallidos, el perfil se bloquea 10 minutos.
- Los niños **no pueden aprobar tareas ni darse puntos**: solo la cuenta de padres puede hacerlo.

## Puesta en marcha (una sola vez, ~15 minutos)

### 1. Supabase (base de datos gratuita)

1. Crea una cuenta en [supabase.com](https://supabase.com) y un proyecto nuevo (región: *West EU*). Guarda la contraseña de la base de datos, aunque no la usaremos.
2. **Authentication → Users → Add user → Create new user**. Crea dos usuarios y marca *Auto Confirm User* en los dos:
   - **Cuenta de padres**: tu email, con una contraseña fuerte.
   - **Cuenta de familia**: sirve para activar los móviles de los niños. Puede ser un alias, por ejemplo `tuemail+familia@gmail.com`.
3. **SQL Editor → New query**. Pega el contenido de [`supabase/schema.sql`](supabase/schema.sql), cambia los **dos emails** del final (sección 9) y pulsa **Run**. Al terminar deben aparecer 2 filas: `parent` y `family`.
4. Recomendado: **Authentication → Sign In / Providers**, desactiva *Allow new users to sign up*. Aunque alguien se registrara, no tendría acceso, pero así queda más limpio.
5. Copia dos datos de la sección de API del proyecto (*Project Settings → Data API / API Keys*):
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public key** o **publishable key**. ⚠️ Nunca la `service_role` / `secret`.

### 2. Conectar la app

Edita [`config.js`](config.js) y pega la URL y la clave. Mientras estén vacías, la app funciona en **modo demo**, con datos inventados guardados solo en ese dispositivo.

### 3. Publicarla (GitHub Pages, gratis)

**Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)` → Save.**
En un par de minutos estará en `https://<tu-usuario>.github.io/equipo-casa/`.

### 4. Instalarla en cada móvil

- **iPhone/iPad**: abre el enlace en **Safari** → botón Compartir → **Añadir a pantalla de inicio**.
- **Android**: abre el enlace en **Chrome** → menú ⋮ → **Instalar aplicación**.

Al abrirla por primera vez, pide email y contraseña:

- **Móviles de los niños**: usa la **cuenta de familia**.
- **Vuestros móviles**: también la cuenta de familia. El modo padres (🔐) pide aparte la cuenta de padres. Si marcas "Es mi móvil", las siguientes veces basta con el **PIN de padres**.

### 5. Primeros ajustes (modo padres → ⚙️ Ajustes)

1. Cambia nombres, avatares, paga base y **PIN** de cada hijo. Los PIN iniciales son: Hijo `1111`, Hija `2222`.
2. Cambia el **PIN de padres**, que empieza en `0000`.
3. Revisa las tareas, los € por punto, el tope y el reto de hermanos.

## Uso semanal

- Durante la semana los niños marcan ✔ y vosotros validáis en la pestaña **Validar**. El número rojo indica cuántas hay pendientes.
- Los **puntos sorpresa** van con un motivo que el niño ve en su pantalla. Ese motivo es lo más valioso: dice *qué* ha hecho bien.
- El domingo, en **Semana**: marcad el reto de hermanos, pulsad **Guardar cierre** y, al pagar, marcad **Pagada**. El lunes empieza una semana nueva automáticamente.

## Mantenimiento

- Supabase gratuito **pausa el proyecto tras 7 días sin uso**. La tarea automática [`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml) lo evita llamando cada 3 días a una función vacía, sin datos. GitHub desactiva las tareas programadas si el repositorio pasa 60 días sin cambios: si os llega un email avisando, se reactiva con un clic en la pestaña *Actions*. Y si alguna vez se pausa, se reactiva desde el panel de Supabase sin perder datos.
- Coste: **0 €**. Supabase Free, GitHub Pages y GitHub Actions entran de sobra en el plan gratuito.

## Estructura

```
index.html            Página única
app.js                Toda la lógica (pantallas + datos en modo demo o Supabase)
styles.css            Estilos (tema "peque" claro, tema "mayor" oscuro, padres claro/oscuro)
config.js             URL y clave pública de Supabase
sw.js                 Service worker (instalable y abre sin conexión)
manifest.webmanifest  Datos de la PWA
supabase/schema.sql   Tablas, seguridad y funciones
```
