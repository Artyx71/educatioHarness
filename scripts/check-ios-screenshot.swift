import AppKit
import Foundation

guard CommandLine.arguments.count == 2 else {
  fatalError("Usage: swift check-ios-screenshot.swift <screenshot.png>")
}

let imageData = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
guard let bitmap = NSBitmapImageRep(data: imageData) else {
  fatalError("The simulator screenshot is not a readable bitmap")
}

// Ignore the status bar and home indicator: those can be visible while the WebView is blank.
var brightSamples = 0
for row in 12..<88 {
  for column in 12..<88 {
    let x = column * bitmap.pixelsWide / 100
    let y = row * bitmap.pixelsHigh / 100
    guard let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { continue }
    let lightness = 0.2126 * color.redComponent + 0.7152 * color.greenComponent + 0.0722 * color.blueComponent
    if lightness > 0.55 { brightSamples += 1 }
  }
}

print("Visible content samples: \(brightSamples)")
precondition(brightSamples >= 25, "The iOS app is still blank after its startup wait")
