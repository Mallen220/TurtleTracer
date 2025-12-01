cask "pedro-pathing-visualizer" do
  version "1.1.0"
  sha256 "4304526311a37d9660c9724e1d38c551252de3392e0744865a759d88e947e484"

  url "https://github.com/Mallen220/homebrew-PedroPathingVisualizer/releases/download/v#{version}/Pedro-Pathing-Visualizer-#{version}-arm64.dmg"
  name "Pedro Pathing Visualizer"
  desc "A path planning visualizer for FIRST Robotics Competition"
  homepage "https://github.com/Mallen220/homebrew-PedroPathingVisualizer"

  livecheck do
    url "https://github.com/Mallen220/homebrew-PedroPathingVisualizer/releases"
    strategy :github_latest
  end

  auto_updates true

  app "Pedro Pathing Visualizer.app"

  zap trash: [
    "~/Library/Application Support/pedro-pathing-visualizer",
    "~/Library/Caches/pedro-pathing-visualizer",
    "~/Library/Preferences/com.pedropathing.visualizer.plist",
    "~/Library/Saved Application State/com.pedropathing.visualizer.savedState",
  ]

  caveats <<~EOS
    #{token} is not notarized by Apple.
    You may need to allow it in System Settings > Privacy & Security.
    
    If you get an error that the app is damaged:
      sudo xattr -cr "/Applications/Pedro Pathing Visualizer.app"
  EOS
end