Shiny POS KIOSK SETUP + ADMIN UX R6
Fecha: 2026-08-21

OBJETIVO
Mantener la terminal de OPERADOR dentro del Punto de Venta sin barra de direcciones,
pestañas ni controles normales del navegador.

ESTE PAQUETE INCLUYE DOS PARTES

1) PARCHE R6
   frontend/src/pages/OrdersPage.jsx

   - Reconoce ?kiosk=1.
   - En modo kiosco NO solicita Fullscreen API del navegador.
   - No muestra la pantalla "Iniciar POS en pantalla completa".
   - ESC se usa dentro de Shiny para abrir "Salida protegida".
   - El modal aparece sobre el POS.
   - Long-press del logo Shiny POS continúa funcionando para tablet/táctil.
   - La contraseña continúa validándose en backend con el mecanismo de R4/R5.

2) TOOLS/SHINY_POS_KIOSK
   - Start-SHINY-POS-Kiosk.ps1
   - INICIAR_SHINY_POS_KIOSK.cmd
   - Install-SHINY-POS-Kiosk-Shortcut.ps1
   - Verify-SHINY-POS-Kiosk.ps1

APLICACIÓN
Copiar el contenido del ZIP sobre:
C:\Users\igarcia\Videos\Shiny

Después:
npm run build --prefix frontend

Reiniciar Vite.

PRUEBA RÁPIDA WINDOWS
Ejecutar:
C:\Users\igarcia\Videos\Shiny\tools\SHINY_POS_KIOSK\INICIAR_SHINY_POS_KIOSK.cmd

El launcher abre:
http://127.0.0.1:5173/admin/pedidos?kiosk=1

en Microsoft Edge Kiosk fullscreen.

ACCESO DIRECTO
Desde PowerShell:
powershell -ExecutionPolicy Bypass -File .\tools\SHINY_POS_KIOSK\Install-SHINY-POS-Kiosk-Shortcut.ps1

Esto crea "Shiny POS Kiosk" en el Escritorio.

COMPORTAMIENTO ESPERADO
- No se ven pestañas ni barra de direcciones.
- Login OPERADOR lleva al POS.
- No aparece Sidebar/Admin.
- ESC abre la salida protegida DENTRO del POS.
- Contraseña incorrecta: no sale.
- Volver al POS: continúa la venta.
- Contraseña correcta: Shiny cierra la sesión y muestra Login dentro del kiosco.

SEGURIDAD IMPORTANTE
El modo Edge Kiosk por comando es mucho mejor que Fullscreen API, pero para una caja
de producción realmente bloqueada se recomienda Windows Assigned Access (single-app kiosk).
Microsoft indica que Assigned Access ejecuta una única aplicación a pantalla completa
y aplica políticas de bloqueo. El mecanismo de mantenimiento de Windows sigue siendo
Ctrl+Alt+Del; Shiny no puede ni debe interceptar la pantalla segura de Windows.

RECOMENDACIÓN PRODUCCIÓN
- Usuario Windows dedicado: SHINY_POS
- Sin privilegios de administrador
- Windows Assigned Access -> Microsoft Edge
- URL Shiny: http://127.0.0.1:5173/admin/pedidos?kiosk=1
- Cuenta Shiny OPERADOR con una única sucursal.
- Credenciales administrativas de Windows solo para IT/SUPERADMIN.

TABLET/MÓVIL
- Android: PWA + Screen Pinning o solución MDM Kiosk/Lock Task.
- iPad/iPhone: PWA + Guided Access; para administración corporativa, Single App Mode.
- Dentro de Shiny: long-press 5 segundos sobre Shiny POS -> contraseña del operador.

NOTA
Una aplicación web no puede bloquear Ctrl+Alt+Del, el botón físico del dispositivo ni
otras funciones de seguridad del sistema operativo. Esas restricciones pertenecen al
modo kiosco/MDM del dispositivo, no al frontend de Shiny.
