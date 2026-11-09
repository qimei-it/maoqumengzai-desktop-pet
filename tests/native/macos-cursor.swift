// Optional P0 QA helper: moves the cursor only; never posts clicks or changes permissions.
import CoreGraphics
import Foundation

guard CommandLine.arguments.count == 3,
      let x = Double(CommandLine.arguments[1]),
      let y = Double(CommandLine.arguments[2]),
      x.isFinite, y.isFinite else { exit(2) }
let result = CGWarpMouseCursorPosition(CGPoint(x: x, y: y))
if result != .success { exit(3) }
print("cursor_moved")
