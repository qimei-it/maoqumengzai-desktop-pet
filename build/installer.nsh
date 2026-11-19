; 毛趣萌仔 Windows 卸载流程。
; 默认保留本地数据；只有用户确认（或显式传入 --delete-app-data）才删除。
; 覆盖安装/应用内更新会带 --updated 运行卸载器，此处不询问也不删除。
; 静默卸载（/S）同样保留数据，避免无人值守时误删。

!macro mqmzRemoveLocalData
  RMDir /r "$LOCALAPPDATA\mqmz-desktop"
  ; 早期版本使用 Electron 默认的用户数据目录。
  RMDir /r "$APPDATA\毛趣萌仔"
  RMDir /r "$APPDATA\mqmz-desktop-pet"
!macroend

!macro mqmzRemoveLoginItems
  ; setLoginItemSettings 写入的值名取决于 AppUserModelId，逐一清理。
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.mqmz.desktop"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "毛趣萌仔"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "mqmz-desktop-pet"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.mqmz.desktop"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "毛趣萌仔"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "mqmz-desktop-pet"
!macroend

!macro customUnInstall
  !insertmacro mqmzRemoveLoginItems
  ; 卸载后不应留下“下次启动时清空数据”的请求。
  Delete "$LOCALAPPDATA\mqmz-data-purge.json"

  ${ifNot} ${isUpdated}
    ${if} ${isDeleteAppData}
      !insertmacro mqmzRemoveLocalData
    ${elseifNot} ${Silent}
      ${if} ${FileExists} "$LOCALAPPDATA\mqmz-desktop\*.*"
        MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "是否同时删除毛趣萌仔的本地数据？$\r$\n$\r$\n包含桌宠素材、聊天与邮件缓存、设置和已保存的密钥：$\r$\n$LOCALAPPDATA\mqmz-desktop$\r$\n$\r$\n选择“否”会保留这些数据，便于以后重新安装。" IDYES mqmz_delete_local_data
        Goto mqmz_keep_local_data
        mqmz_delete_local_data:
          !insertmacro mqmzRemoveLocalData
        mqmz_keep_local_data:
      ${endif}
    ${endif}
  ${endif}
!macroend
