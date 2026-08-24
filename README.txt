VISION-002A R2
Corrige el instalador para no depender del bloque de texto exacto del handler.
Busca por lineas:
- handleVisionPosResult
- setVisionPickerOpen(true)
- activateScanner

Si no existen candidatos locales, consulta automaticamente YGOPRODeck.
No modifica stock ni crea cartas.
