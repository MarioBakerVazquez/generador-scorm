; Copia el modelo de IA local desde la carpeta "modelos" que acompaña al instalador (funciona sin internet).
!macro customInstall
  IfFileExists "$EXEDIR\modelos\*.gguf" 0 +4
    CreateDirectory "$INSTDIR\resources\models"
    CopyFiles /SILENT "$EXEDIR\modelos\*.gguf" "$INSTDIR\resources\models"
    DetailPrint "Modelo de IA local instalado"
!macroend
