cask "pedro-pathing-visualizer" do
  version "1.1.0"
  sha256 "4304526311a37d9660c9724e1d38c551252de3392e0744865a759d88e947e484"

  url "https://github.com/Mallen220/VisualizerMacOSApp/releases/download/v#{version}/Pedro-Pathing-Visualizer-#{version}-arm64.dmg"
  name "Pedro Pathing Visualizer"
  desc "A path planning visualizer for FIRST Robotics Competition"
  homepage "https://github.com/Mallen220/homebrew-PedroPathingVisualizer"

  # Important: This tells Homebrew to use auto-updates from your app
  auto_updates true

  app "Pedro Pathing Visualizer.app"

  zap trash: [
    "~/Library/Application Support/pedro-pathing-visualizer",
    "~/Library/Caches/pedro-pathing-visualizer",
    "~/Library/Preferences/com.pedropathing.visualizer.plist",
    "~/Library/Saved Application State/com.pedropathing.visualizer.savedState",
  ]

  caveats <<~EOS
    This app is not notarized by Apple. On first run:
    1. Right-click the app in Applications
    2. Select "Open"
    3. Click "Open" in the security dialog
    
    Or run: sudo xattr -rd com.apple.quarantine "/Applications/Pedro Pathing Visualizer.app"
  EOS
end