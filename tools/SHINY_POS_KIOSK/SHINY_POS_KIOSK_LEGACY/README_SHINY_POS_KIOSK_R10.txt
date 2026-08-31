Shiny POS KIOSK R10 — INSTANCIA DEDICADA CHROME/EDGE

PROBLEMA CORREGIDO
Si Chrome ya estaba abierto normalmente, Windows/Chrome podía reutilizar esa instancia
y abrir Shiny como una pestaña normal aunque el launcher enviara --kiosk.

R10 fuerza una instancia independiente usando un perfil dedicado:
%LOCALAPPDATA%\Shiny\POS_KIOSK\Chrome
o
%LOCALAPPDATA%\Shiny\POS_KIOSK\Edge

De esta forma:
- Chrome normal puede seguir abierto.
- Shiny POS abre en otra instancia.
- La nueva instancia recibe realmente --kiosk.
- Login se abre primero.
- OPERADOR continúa a /admin/pedidos?kiosk=1 por la lógica R7.

APLICAR
Copiar el ZIP sobre:
C:\Users\igarcia\Videos\Shiny

No requiere npm build porque R10 solo reemplaza herramientas de launcher.

PRUEBA
1. Deja Chrome normal abierto si quieres.
2. Ejecuta:
   .\tools\SHINY_POS_KIOSK\INICIAR_SHINY_POS_KIOSK.cmd
3. Debe abrir OTRA instancia sin pestañas/barra de direcciones.
4. Inicia sesión como OPERADOR.

VERIFICACIÓN
Ejecuta:
   .\tools\SHINY_POS_KIOSK\Verify-SHINY-POS-Kiosk.ps1

Debe mostrar:
KIOSK_INSTANCE_FOUND=True
HAS_KIOSK_FLAG=True
HAS_DEDICATED_PROFILE=True

ACCESO DIRECTO
Ejecuta:
powershell -ExecutionPolicy Bypass -File .\tools\SHINY_POS_KIOSK\Install-SHINY-POS-Shortcut.ps1

Esto crea/actualiza el acceso "Shiny POS" del Escritorio.
