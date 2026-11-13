// P0 播放器探针（macOS）：通过系统 MediaRemote 读取正在播放的信息并发送控制命令。
// 开发期先用本脚本替代 nowplaying-cli；正式版是否内置同样的 helper 由 P4 决定。
//
// 用法：
//   swift scripts/probe-media-macos.swift info
//   swift scripts/probe-media-macos.swift play|pause|toggle|next|previous|shuffle|repeat
//   swift scripts/probe-media-macos.swift media-toggle|media-next|media-previous
//   swift scripts/probe-media-macos.swift ax-state <bundle-id>
//
// 只读当前正在播放的会话；不修改播放器、不读取音频、不访问账号。

import AppKit
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
guard arguments.count >= 2 else {
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
let mediaKeys: [String: Int] = [
    "media-toggle": 16,
    "media-next": 17,
    "media-previous": 18,
]

func sendMediaKey(_ key: Int) {
    func post(flags: UInt, state: Int) {
        let data = (key << 16) | (state << 8)
        guard let event = NSEvent.otherEvent(
            with: .systemDefined,
            location: .zero,
            modifierFlags: NSEvent.ModifierFlags(rawValue: flags),
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            subtype: 8,
            data1: data,
            data2: -1
        ) else { return }
        event.cgEvent?.post(tap: .cghidEventTap)
    }
    post(flags: 0xa00, state: 0x0a)
    usleep(80_000)
    post(flags: 0xb00, state: 0x0b)
}

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

if command == "ax-state" {
    let bundleId = arguments.count > 2 ? arguments[2] : ""
    var output: [String: Any] = [
        "trusted": AXIsProcessTrusted(),
        "state": "unknown",
    ]
    if AXIsProcessTrusted(), !bundleId.isEmpty,
       let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId).first {
        let app = AXUIElementCreateApplication(running.processIdentifier)

        func attribute(_ element: AXUIElement, _ name: String) -> AnyObject? {
            var value: AnyObject?
            guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else {
                return nil
            }
            return value
        }
        func text(_ element: AXUIElement, _ name: String) -> String {
            (attribute(element, name) as? String) ?? ""
        }
        func frame(_ element: AXUIElement) -> CGRect? {
            guard let position = attribute(element, kAXPositionAttribute),
                  let size = attribute(element, kAXSizeAttribute) else { return nil }
            var point = CGPoint.zero
            var bounds = CGSize.zero
            guard AXValueGetValue(position as! AXValue, .cgPoint, &point),
                  AXValueGetValue(size as! AXValue, .cgSize, &bounds) else { return nil }
            return CGRect(origin: point, size: bounds)
        }

        var playing: Bool?
        var clockLabels: [(frame: CGRect, text: String)] = []
        var visited = 0
        func walk(_ element: AXUIElement, _ depth: Int) {
            if depth > 18 || visited > 900 || playing != nil { return }
            visited += 1
            let description = text(element, kAXDescriptionAttribute)
            if description == "暂停播放" {
                playing = true
            } else if description == "播放" {
                playing = false
            }
            let title = text(element, kAXTitleAttribute)
            let value = text(element, kAXValueAttribute)
            let label = description.isEmpty ? (title.isEmpty ? value : title) : description
            if label.range(of: #"^\d{1,2}:[0-5]\d$"#, options: .regularExpression) != nil,
               let rect = frame(element) {
                clockLabels.append((rect, label))
            }
            if let children = attribute(element, kAXChildrenAttribute) as? [AXUIElement] {
                for child in children { walk(child, depth + 1) }
            }
        }
        walk(app, 0)

        if let playing {
            output["state"] = playing ? "playing" : "paused"
        }
        // Players such as Kugou draw their own transport controls but still
        // expose the elapsed/duration labels: use the bottom-most pair.
        if let bottom = clockLabels.map({ $0.frame.midY }).max() {
            let row = clockLabels.filter { abs($0.frame.midY - bottom) < 4 }
            let sorted = row.sorted { $0.frame.minX < $1.frame.minX }
            func seconds(_ label: String) -> Double? {
                let parts = label.split(separator: ":").compactMap { Double($0) }
                guard parts.count == 2 else { return nil }
                return parts[0] * 60 + parts[1]
            }
            if sorted.count >= 2,
               let position = seconds(sorted[0].text),
               let duration = seconds(sorted[sorted.count - 1].text),
               duration > 0, position <= duration,
               sorted[sorted.count - 1].frame.minX - sorted[0].frame.minX > 100 {
                output["position"] = position
                output["duration"] = duration
            }
        }
    }
    if let data = try? JSONSerialization.data(withJSONObject: output, options: [.sortedKeys]),
       let text = String(data: data, encoding: .utf8) {
        print(text)
    } else {
        print("{\"state\":\"unknown\",\"trusted\":false}")
    }
    exit(0)
}

if let key = mediaKeys[command] {
    sendMediaKey(key)
    RunLoop.main.run(until: Date().addingTimeInterval(0.2))
    exit(0)
}

guard let code = commands[command] else {
    FileHandle.standardError.write(Data("未知命令: \(command)\n".utf8))
    exit(2)
}
let ok = sendCommand(code, nil)
// The command travels over XPC; leave enough time for slower players to apply it.
RunLoop.main.run(until: Date().addingTimeInterval(0.8))
exit(ok ? 0 : 1)
