# P0 播放器探针（Windows / SMTC）
#
# 用法（Windows PowerShell 5.1 或 PowerShell 7）：
#   powershell -ExecutionPolicy Bypass -File scripts\probe-smtc.ps1 info
#   powershell -ExecutionPolicy Bypass -File scripts\probe-smtc.ps1 play|pause|toggle|next|previous
#
# 通过公开的 Windows.Media.Control API 读取当前媒体会话并发送控制命令。
# 只读当前会话的元数据；不修改播放器、不读取音频、不访问账号。

param(
    [ValidateSet('info', 'play', 'pause', 'toggle', 'next', 'previous')]
    [string]$Action = 'info'
)

$ErrorActionPreference = 'Stop'

# Load the WinRT projection for the media session manager.
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}

$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$session = $manager.GetCurrentSession()

if ($null -eq $session) {
    Write-Output '{}'
    exit 1
}

switch ($Action) {
    'info' {
        $properties = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        $timeline = $session.GetTimelineProperties()
        $playback = $session.GetPlaybackInfo()
        [pscustomobject]@{
            title    = $properties.Title
            artist   = $properties.Artist
            album    = $properties.AlbumTitle
            duration = [math]::Round($timeline.EndTime.TotalSeconds, 3)
            elapsed  = [math]::Round($timeline.Position.TotalSeconds, 3)
            status   = [string]$playback.PlaybackStatus
            client   = $session.SourceAppUserModelId
        } | ConvertTo-Json -Compress
    }
    'play' {
        $session.TryPlayAsync() | Out-Null
        Start-Sleep -Milliseconds 400
    }
    'pause' {
        $session.TryPauseAsync() | Out-Null
        Start-Sleep -Milliseconds 400
    }
    'toggle' {
        $session.TryTogglePlayPauseAsync() | Out-Null
        Start-Sleep -Milliseconds 400
    }
    'next' {
        $session.TrySkipNextAsync() | Out-Null
        Start-Sleep -Milliseconds 400
    }
    'previous' {
        $session.TrySkipPreviousAsync() | Out-Null
        Start-Sleep -Milliseconds 400
    }
}
