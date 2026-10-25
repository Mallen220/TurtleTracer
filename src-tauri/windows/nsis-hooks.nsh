; Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
; Hooks for Tauri's NSIS installer (bundle.windows.nsis.installerHooks).

; Turtle Tracer 2.6 and earlier were Electron apps with their own uninstaller,
; registered under a GUID key with the same display name. Upgrading leaves that
; entry (and its uninstaller) behind, so the app would be listed twice under
; Installed apps. Run the old uninstaller silently first; it keeps user data.
!macro TT_REMOVE_ELECTRON_INSTALL ROOT
  StrCpy $R0 0
  ${Do}
    EnumRegKey $R1 ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall" $R0
    ${If} $R1 == ""
      ${Break}
    ${EndIf}
    IntOp $R0 $R0 + 1
    ; Tauri's own entry is keyed by the product name; the old one by a GUID.
    ${If} $R1 != "Turtle Tracer"
      ReadRegStr $R2 ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "DisplayName"
      ReadRegStr $R3 ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "InstallLocation"
      ${If} $R2 == "Turtle Tracer"
      ${AndIf} ${FileExists} "$R3\Uninstall Turtle Tracer.exe"
        DetailPrint "Removing the previous (Electron) version of Turtle Tracer from $R3"
        ; _?= runs the uninstaller in place, so ExecWait waits for it.
        ExecWait '"$R3\Uninstall Turtle Tracer.exe" /S /allusers _?=$R3' $R4
        Delete "$R3\Uninstall Turtle Tracer.exe"
        DeleteRegKey ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1"
        ; The list changed under us; start over.
        StrCpy $R0 0
      ${EndIf}
    ${EndIf}
  ${Loop}
!macroend

!macro NSIS_HOOK_PREINSTALL
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  SetRegView 64
  !insertmacro TT_REMOVE_ELECTRON_INSTALL HKLM
  !insertmacro TT_REMOVE_ELECTRON_INSTALL HKCU
  SetRegView 32
  !insertmacro TT_REMOVE_ELECTRON_INSTALL HKLM
  SetRegView 64
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
!macroend
