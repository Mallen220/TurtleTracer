#!/bin/bash

echo "Installing Pedro Pathing Visualizer via Homebrew..."

# Install Homebrew if not present
if ! command -v brew &> /dev/null; then
    echo "Installing Homebrew first..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Add the tap
brew tap Mallen220/pedro https://github.com/Mallen220/homebrew-PedroPathingVisualizer

# Install the app
brew install --cask pedro-pathing-visualizer

# Fix Gatekeeper permissions
echo "Fixing permissions..."
sudo xattr -rd com.apple.quarantine "/Applications/Pedro Pathing Visualizer.app"

echo ""
echo "Installation complete! You can find Pedro Pathing Visualizer in your Applications folder."
echo ""
echo "If you see a security warning on first launch:"
echo "1. Right-click the app in Applications"
echo "2. Select 'Open'"
echo "3. Click 'Open' in the dialog"