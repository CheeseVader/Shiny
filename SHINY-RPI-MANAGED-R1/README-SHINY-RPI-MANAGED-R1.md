# SHINY RPI MANAGED R1

Objetivo: administrar actualizaciones de Shiny en Raspberry Pi sin entregar credenciales personales al cliente.

## Arquitectura

1. Desarrollo privado: tu proyecto Shiny.
2. Releases privados: repositorio separado (idealmente en una GitHub Organization).
3. Cada RPi tiene:
   - DEVICE_ID individual
   - token de SOLO LECTURA
   - agente `shiny-update-agent.sh`
   - timer systemd
4. El cliente no necesita entrar a GitHub.

## Archivos

- `INSTALAR-SHINY-MANAGED-UPDATER-R1.sh`
  Instala configuración, agente y timer systemd.

- `shiny-update-agent.sh`
  Consulta GitHub Releases, descarga paquete + manifest, valida SHA256,
  hace backup, instala, reinicia y ejecuta rollback si falla el health check.

- `PREPARAR-RELEASE-SHINY-R1.ps1`
  Se ejecuta en tu PC Windows para generar:
  - `shiny-rpi-X.Y.Z.tar.gz`
  - `manifest-X.Y.Z.json`

## Reglas de seguridad

- NO guardar contraseña personal de GitHub.
- NO usar token con escritura.
- NO incluir `.env` en releases.
- NO reemplazar PostgreSQL.
- NO ejecutar scripts de "entrega nueva" en actualizaciones.
- NO borrar SUPERADMIN ni datos operativos.
- Las modificaciones de BD deben hacerse por migraciones incrementales.

## Flujo de publicación

En Windows:

```powershell
cd "C:\Users\igarcia\Videos\Shiny"

.\PREPARAR-RELEASE-SHINY-R1.ps1 `
  -ProjectRoot "C:\Users\igarcia\Videos\Shiny" `
  -Version "1.0.1"
```

Después publica un Release `v1.0.1` en el repositorio de releases y sube los dos assets.

## Flujo en RPi

Primera instalación:

```bash
chmod +x INSTALAR-SHINY-MANAGED-UPDATER-R1.sh shiny-update-agent.sh
sudo ./INSTALAR-SHINY-MANAGED-UPDATER-R1.sh
```

Revisar:

```bash
sudo /usr/local/lib/shiny-updater/shiny-update-agent.sh status
sudo /usr/local/lib/shiny-updater/shiny-update-agent.sh check
```

Instalar manualmente una actualización autorizada/publicada:

```bash
sudo /usr/local/lib/shiny-updater/shiny-update-agent.sh install
```

`AUTO_INSTALL=0` queda por defecto. Esto permite que el cliente solicite una actualización y tú controles cuándo publicarla/autorizarla.
