// P0 播放器探针（macOS）：通过系统 MediaRemote 读取正在播放的信息并发送控制命令。
// 开发期先用本脚本替代 nowplaying-cli；正式版是否内置同样的 helper 由 P4 决定。
//
// 用法：
//   swift scripts/probe-media-macos.swift info
//   swift scripts/probe-media-macos.swift play|pause|toggle|next|previous|shuffle|repeat
//
// 只读当前正在播放的会话；不修改播放器、不读取音频、不访问账号。

import Foundation

let mediaRemotePath = "/System/Library/PrivateFrameworks/MediaRemote.framework"
guard let bundle = CFBundleCreate(
    kCFAllocatorDefault,
    URL(fileURLWithPath: mediaRemotePath) as CFURL
) else {
    FileHandle.standardError.write(Data("MediaRemote.framework 不可用\n".utf8))
    exit(2)
}

typealias GetNowPlayingInfo = @convention(c) (
    DispatchQueue,
    @escaping @convention(block) (CFDictionary?) -> Void
) -> Void
typealias SendCommand = @convention(c) (Int, CFTypeRef?) -> Bool

func symbol<T>(_ name: String, as type: T.Type) -> T? {
    guard let pointer = CFBundleGetFunctionPointerForName(bundle, name as CFString) else {
        return nil
    }
    return unsafeBitCast(pointer, to: T.self)
}

guard let getInfo = symbol("MRMediaRemoteGetNowPlayingInfo", as: GetNowPlayingInfo.self),
      let sendCommand = symbol("MRMediaRemoteSendCommand", as: SendCommand.self) else {
    FileHandle.standardError.write(Data("MediaRemote 符号缺失\n".utf8))
    exit(2)
}

let arguments = CommandLine.arguments
guard arguments.count == 2 else {
    FileHandle.standardError.write(Data("用法: probe-media-macos info|play|pause|toggle|next|previous\n".utf8))
    exit(2)
}

let command = arguments[1]
let commands: [String: Int] = [
    "play": 0,
    "pause": 1,
    "toggle": 2,
    "next": 4,
    "previous": 5,
    "shuffle": 6,
    "repeat": 7,
]

if command == "info" {
    var finished = false
    getInfo(DispatchQueue.main) { dictionary in
        defer { finished = true }
        guard let info = dictionary as? [String: Any] else {
            print("{}")
            return
        }
        let fields: [(String, String)] = [
            ("title", "kMRMediaRemoteNowPlayingInfoTitle"),
            ("artist", "kMRMediaRemoteNowPlayingInfoArtist"),
            ("album", "kMRMediaRemoteNowPlayingInfoAlbum"),
            ("duration", "kMRMediaRemoteNowPlayingInfoDuration"),
            ("elapsed", "kMRMediaRemoteNowPlayingInfoElapsedTime"),
            ("rate", "kMRMediaRemoteNowPlayingInfoPlaybackRate"),
            ("client", "kMRMediaRemoteNowPlayingInfoClientBundleIdentifier"),
        ]
        var output: [String: Any] = [:]
        for (key, source) in fields {
            if let value = info[source] {
                output[key] = value
            }
        }
        if let data = try? JSONSerialization.data(withJSONObject: output, options: [.sortedKeys]),
           let text = String(data: data, encoding: .utf8) {
            print(text)
        }
    }
    let deadline = Date().addingTimeInterval(2)
    while !finished && Date() < deadline {
        RunLoop.main.run(until: Date().addingTimeInterval(0.02))
    }
    exit(0)
}

guard let code = commands[command] else {
    FileHandle.standardError.write(Data("未知命令: \(command)\n".utf8))
    exit(2)
}
let ok = sendCommand(code, nil)
// The command travels over XPC; give the system a moment before the helper exits.
RunLoop.main.run(until: Date().addingTimeInterval(0.4))
exit(ok ? 0 : 1)
