# Configuración de marca

La aplicación utiliza `brand.config.json` como fuente única de identidad.
No es necesario renombrar archivos, componentes, rutas ni tablas para crear un
nuevo cliente.

Los siguientes consumidores leen esa configuración:

- interfaz administrativa y portal público;
- POS, tickets y comprobantes;
- correos y recuperación de acceso;
- PWA, título del navegador y nombre instalado;
- servicio local de búsqueda visual;
- mensajes generados por el backend.

Los nombres técnicos históricos (`shiny.*`, `SHINY_AUTH_TOKEN` y algunas clases
CSS) se mantienen únicamente como contratos internos compatibles. No forman
parte de la identidad visible ni deben cambiarse por cliente.

Después de modificar `brand.config.json`, vuelva a compilar el frontend:

```powershell
npm run build
```
