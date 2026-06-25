# ⚔ TikTok Game Overlay
**by SurLab Studio**

Overlay interactivo tipo RPG para TikTok Live Studio y OBS.  
Los likes, comentarios y gifts de tus viewers atacan a un boss en pantalla.

---

## Requisitos
- Node.js 18+ → https://nodejs.org
- Tu TikTok tiene que estar **en vivo** para recibir eventos reales
- (Sin live activo: modo DEMO automático)

---

## Instalación rápida (Windows)

1. Descarga y descomprime este proyecto
2. Abre `server.js` y cambia la línea:
   ```js
   const TIKTOK_USER = '@tuusuario';  // ← pon tu @
   ```
3. Doble clic en **INICIO.bat**  
   *(o corre `npm install && npm start` en terminal)*

---

## Agregar a TikTok Live Studio

1. En Live Studio: **+ Agregar fuente → Link**
2. Pega la URL: `http://localhost:3000/overlay.html`
3. Ajusta el tamaño: **480 × 220 px**
4. Posicionalo en la parte inferior de tu escena

---

## Cómo juega tu audiencia

| Acción viewer | Efecto en el juego |
|---|---|
| ❤ Like / corazón | 1 daño × combo al boss |
| 💬 Comentar | 3 daño × combo |
| 🪙 Gift / diamantes | 2× diamantes de daño |
| ⭐ Seguir | 5 daño fijo |
| 🔗 Compartir | 8 daño fijo |
| 🔥 Actividad rápida | Sube el multiplicador COMBO (máx x10) |

Cuando el boss llega a 0 HP → aparece un nuevo boss con más HP.

---

## Personalización

En `server.js`:
- `bossMaxHp` → HP inicial del boss (default 1000)
- `bossName` → Nombre del primer boss
- Daño por acción → busca `dealDamage(...)` en los eventos

En `public/overlay.html`:
- `#streamTitle` → cambia el texto del título
- Colores CSS → ajusta la paleta pixel art

---

*Proyecto personal — no afiliado con TikTok / ByteDance*
