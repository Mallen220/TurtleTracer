#!/bin/bash

echo "Installing Pedro Pathing Visualizer via Homebrew..."

# Install Homebrew if not present
if ! command -v brew &> /dev/null; then
    echo "Installing Homebrew first..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add Homebrew to PATH for Apple Silicon
    if [[ $(uname -m) == 'arm64' ]]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
fi

# Clean up any existing tap with wrong URL
if brew tap | grep -q "mallen220/pedro"; then
    echo "Removing old tap configuration..."
    brew untap mallen220/pedro 2>/dev/null || true
    rm -rf "$(brew --repo mallen220/pedro)" 2>/dev/null || true
fi

# Add the correct tap
echo "Adding Pedro Pathing Visualizer tap..."
brew tap Mallen220/PedroPathingVisualizer https://github.com/Mallen220/homebrew-PedroPathingVisualizer

# Install the app
echo "Installing Pedro Pathing Visualizer..."
if brew install --cask Mallen220/PedroPathingVisualizer/pedro-pathing-visualizer; then
    echo "✓ App installed successfully!"
else
    # Try alternative method if the first fails
    echo "Trying alternative installation method..."
    brew install --cask pedro-pathing-visualizer
fi

# Fix Gatekeeper permissions
echo "Fixing macOS security permissions..."
APP_PATH="/Applications/Pedro Pathing Visualizer.app"
if [ -d "$APP_PATH" ]; then
    sudo xattr -rd com.apple.quarantine "$APP_PATH"
    echo "✓ Permissions fixed!"
else
    echo "⚠ App not found in Applications. It may be in your Downloads folder."
    # Check Downloads
    DOWNLOAD_PATH="$HOME/Downloads/Pedro Pathing Visualizer.app"
    if [ -d "$DOWNLOAD_PATH" ]; then
        sudo xattr -rd com.apple.quarantine "$DOWNLOAD_PATH"
        echo "✓ Found and fixed permissions for app in Downloads."
        echo "Please drag it to your Applications folder."
    fi
fi

echo ""
echo "🎉 Installation complete!"
echo ""
echo "To open the app:"
echo "1. Open your Applications folder"
echo "2. Find 'Pedro Pathing Visualizer'"
echo "3. Double-click it"
echo ""
echo "If you see a security warning:"
echo "   - Go to System Settings → Privacy & Security"
echo "   - Scroll down and click 'Open Anyway'"
echo ""
echo "To uninstall later: brew uninstall --cask pedro-pathing-visualizer"
echo "For updates: brew upgrade --cask pedro-pathing-visualizer"