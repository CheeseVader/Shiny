# TCG Store Template

Plantilla genérica para crear instalaciones independientes de la aplicación.
La marca visible se controla desde un solo archivo: `brand.config.json`.

## Cambiar la marca

Edite únicamente los valores de `brand.config.json`:

```json
{
  "name": "Shiny",
  "shortName": "Shiny",
  "legalName": "Shiny",
  "description": "Plataforma de administración TCG",
  "posName": "Shiny POS",
  "visionName": "Shiny Vision",
  "emailFromName": "Shiny"
}
```

La configuración controla la interfaz, portal público, POS, tickets, correos,
PWA y búsqueda visual. Los identificadores internos históricos, como el esquema
PostgreSQL `shiny`, no se muestran al cliente y se conservan por compatibilidad.

## Crear un cliente

Desde PowerShell:

```powershell
.\create-client.ps1 -ClientName "Shiny"
```

La copia se crea junto a la plantilla, sin dependencias, compilaciones,
credenciales, base operativa, imágenes subidas ni historial Git.

## Instalar y ejecutar

```powershell
npm run install:all
npm install
npm run build
npm run dev
```

El servicio visual se inicia por separado:

```powershell
.\services\visual-search-beta\start-visual-beta.ps1
```

Cada cliente debe tener su propia base de datos, `.env`, imágenes, usuarios,
credenciales e historial Git.
