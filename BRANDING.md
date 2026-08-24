# Marca configurable

La marca visible se controla desde `brand.config.json`. Los nombres técnicos
de archivos, tablas, esquema PostgreSQL `gmx`, migraciones y dependencias no
se renombran.

Para cambiar GMX a Shiny desde PowerShell:

```powershell
.\set-brand.ps1 -Name "Shiny"
```

Después ejecute:

```powershell
npm run build
npm run dev
```

Los logotipos del cliente se colocan en `frontend/public/branding`.
