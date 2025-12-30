#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper Functions
print_status() { echo -e "${GREEN}[✓]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
print_info() { echo -e "${BLUE}[i]${NC} $1"; }
print_header() { echo -e "${CYAN}$1${NC}"; }

print_logo() {
    echo -e "${PURPLE}"
    echo '╔══════════════════════════════════════════════════════════════╗'
    echo '║                                                              ║'
    echo '║     Pedro Pathing Visualizer                                 ║'
    echo '║                     Installation                             ║'
    echo '║                                                              ║'
    echo '╚══════════════════════════════════════════════════════════════╝'
    echo -e "${NC}"
}

# Return all asset download URLs that match a pattern from the latest release
# Uses extended grep to support alternation patterns and is case-insensitive
get_download_urls() {
    local pattern=$1
    curl -s "https://api.github.com/repos/Mallen220/PedroPathingVisualizer/releases/latest" | \
    grep -o '"browser_download_url": "[^"]*"' | \
    cut -d'"' -f4 | \
    grep -Ei "$pattern" || true
}

# Return the latest release version (tag_name) without leading 'v'
get_latest_version() {
    curl -s "https://api.github.com/repos/Mallen220/PedroPathingVisualizer/releases/latest" | \
    grep -o '"tag_name": "[^"]*"' | \
    head -1 | cut -d'"' -f4 | sed 's/^v//' || true
}

# Interactive asset selector: prefers local machine architecture if possible
# Compatible with older bash (avoids 'mapfile') and prints a clear numbered list
select_asset_by_pattern() {
    local pattern=$1

    # Read output into an array in a portable way
    urls=()
    url_output=$(get_download_urls "$pattern")
    if [ -z "$url_output" ]; then
        echo ""; return
    fi
    while IFS= read -r line; do
        # skip empty lines
        [ -z "$line" ] && continue
        urls+=("$line")
    done <<< "$url_output"

    if [ ${#urls[@]} -eq 0 ]; then
        echo ""; return
    fi

    if [ ${#urls[@]} -eq 1 ]; then
        echo "${urls[0]}"; return
    fi

    # Determine architecture preferences
    arch=$(uname -m || echo "")
    arch_candidates=()
    if [[ "$arch" == "arm64" ]] || [[ "$arch" == "aarch64" ]]; then
        arch_candidates=("arm64" "aarch64")
        arch_display="Apple Silicon (M series)"
    else
        arch_candidates=("amd64" "x86_64" "x64" "x86")
        arch_display="Intel (x86_64)"
    fi

    # Try to auto-detect best match
    auto_match_url=""
    auto_match_name=""
    
    for a in "${arch_candidates[@]}"; do
        for u in "${urls[@]}"; do
            fname=$(basename "$u")
            if echo "$fname" | grep -iq "$a"; then
                auto_match_url="$u"
                auto_match_name="$fname"
                break 2
            fi
        done
    done
    
    # If on x86_64/amd64 and no explicit match, exclude arm/aarch variants
    if [ -z "$auto_match_url" ] && [[ "$arch" != "arm64" && "$arch" != "aarch64" ]]; then
        for u in "${urls[@]}"; do
            fname=$(basename "$u")
            if ! echo "$fname" | grep -Eiq "(arm64|aarch64|arm)"; then
                auto_match_url="$u"
                auto_match_name="$fname"
                break
            fi
        done
    fi

    # Present interactive choices with auto-detect option
    echo "" >&2
    echo "Multiple assets found for pattern: $pattern" >&2
    echo "" >&2
    
    if [ -n "$auto_match_url" ]; then
        printf "  [A] Auto-detect for %s → %s (recommended)\n" "$arch_display" "$auto_match_name" >&2
    else
        printf "  [A] Auto-detect for %s (no match found)\n" "$arch_display" >&2
    fi
    echo "" >&2
    
    local i=1
    for u in "${urls[@]}"; do
        printf "  [%d] %s\n" "$i" "$(basename "$u")" >&2
        ((i++))
    done
    printf "  [0] Enter URL manually\n" >&2
    echo "" >&2

    while true; do
        read -p "Select an asset [A/1-$((i-1))/0] (Default: A): " sel < /dev/tty
        
        # Default to auto if empty
        if [ -z "$sel" ]; then
            sel="A"
        fi
        
        # Handle auto-detect
        if [[ "$sel" == "A" || "$sel" == "a" ]]; then
            if [ -n "$auto_match_url" ]; then
                print_status "Auto-selected: $auto_match_name" >&2
                echo "$auto_match_url"
                return
            else
                print_error "No suitable asset found for $arch_display" >&2
                continue
            fi
        fi
        
        if printf "%s" "$sel" | grep -Eq "^[0-9]+$"; then
            if [ "$sel" -eq 0 ]; then
                read -p "Enter full download URL: " manual < /dev/tty
                echo "$manual"
                return
            elif [ "$sel" -ge 1 ] && [ "$sel" -lt "$i" ]; then
                echo "${urls[$((sel-1))]}"
                return
            fi
        fi
        echo "Invalid selection." >&2
    done
}

install_mac() {
    print_header "Starting macOS Installation..."
    
    # Homebrew Check
    if ! command -v brew &> /dev/null; then
        print_warning "Homebrew not found. Installing..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        if [[ $(uname -m) == 'arm64' ]]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        fi
    fi

    print_status "Looking for DMG assets in the latest release..."
    DOWNLOAD_URL=$(select_asset_by_pattern "\.dmg")

    # Fallback for Intel macs: if no DMG found via the general selector, try explicit conventional names
    if [ -z "$DOWNLOAD_URL" ] && [[ "$(uname -m)" == "x86_64" || "$(uname -m)" == "i386" ]]; then
        print_info "No DMG auto-selected; attempting Intel mac fallback filenames..."
        version=$(get_latest_version)
        if [ -n "$version" ]; then
            # Candidate filename patterns to try (covers common naming conventions and the requested variant)
            candidates=(
                "Pedro-Pathing-Visualizer-${version}.dmg"
                "Pedro-Pathing-Visualizer-${version}-amd64.dmg"
                "pedro-pathing-visualizer_${version}.dmg"
                "pedro-pathing-visualizer-${version}.dmg"
                "Pedro-Pathing-Visualizer-${version}-arm64.dmg"
            )

            for c in "${candidates[@]}"; do
                # Escape dots for regex, search by basename match
                pattern="$(echo "$c" | sed 's/\./\\./g')$"
                url=$(get_download_urls "$pattern")
                if [ -n "$url" ]; then
                    DOWNLOAD_URL="$url"
                    print_status "Found DMG via fallback: $(basename "$url")"
                    break
                fi
            done
        fi
    fi

    if [ -z "$DOWNLOAD_URL" ]; then
        print_error "No DMG found in latest release. You can manually provide a direct download URL."
        read -p "Enter a direct .dmg download URL: " DOWNLOAD_URL < /dev/tty
        if [ -z "$DOWNLOAD_URL" ]; then
            print_error "No URL provided. Aborting."
            exit 1
        fi
    fi

    DMG_PATH="/tmp/pedro-installer.dmg"
    print_status "Downloading $(basename "$DOWNLOAD_URL")..."
    if ! curl -L -o "$DMG_PATH" "$DOWNLOAD_URL" --fail; then
        print_error "Download failed. Aborting."
        exit 1
    fi
    
    print_status "Mounting and Installing..."
    TEMP_MOUNT=$(mktemp -d /tmp/pedro-mount.XXXXXX)
    if ! hdiutil attach "$DMG_PATH" -mountpoint "$TEMP_MOUNT" -nobrowse -quiet; then
        print_error "Failed to mount DMG"
        rm "$DMG_PATH"
        rm -rf "$TEMP_MOUNT"
        exit 1
    fi
    
    APP_SOURCE=$(find "$TEMP_MOUNT" -name "*.app" -type d -maxdepth 2 | head -1)
    if [ -z "$APP_SOURCE" ]; then
        print_error "App not found in DMG"
        hdiutil detach "$TEMP_MOUNT" -quiet
        rm "$DMG_PATH"
        rm -rf "$TEMP_MOUNT"
        exit 1
    fi
    
    # Cleanup old version only after successful download and mount
    if [ -d "/Applications/Pedro Pathing Visualizer.app" ]; then
        print_status "Removing old version..."
        sudo rm -rf "/Applications/Pedro Pathing Visualizer.app"
    fi

    print_status "Copying new version..."
    cp -R "$APP_SOURCE" "/Applications/"
    hdiutil detach "$TEMP_MOUNT" -quiet
    rm "$DMG_PATH"
    rm -rf "$TEMP_MOUNT"

    # Fix permissions
    sudo xattr -rd com.apple.quarantine "/Applications/Pedro Pathing Visualizer.app" 2>/dev/null
    
    print_status "Installation Complete! Look in your Applications folder."
}

install_linux() {
    print_header "Starting Linux Installation..."

    # Try to find .deb, .AppImage, or .tar.gz; prefer architecture-matching debs for x86_64
    arch=$(uname -m)
    candidate_url=""

    if [[ "$arch" == "x86_64" || "$arch" == "amd64" || "$arch" == "x64" ]]; then
        candidate_url=$(select_asset_by_pattern "\.deb\|\.AppImage\|\.tar\.gz")
    else
        # For arm machines prefer arm builds or AppImage
        candidate_url=$(select_asset_by_pattern "\.AppImage\|\.deb\|\.tar\.gz")
    fi

    if [ -z "$candidate_url" ]; then
        print_error "No Linux assets found in latest release. You can manually provide a direct download URL."
        read -p "Enter a direct download URL (AppImage, .deb, or .tar.gz): " candidate_url < /dev/tty
        if [ -z "$candidate_url" ]; then
            print_error "No URL provided. Aborting."
            exit 1
        fi
    fi

    # Create directory if it doesn't exist
    INSTALL_DIR="$HOME/Applications"
    mkdir -p "$INSTALL_DIR"

    fname=$(basename "$candidate_url")
    lower=$(echo "$fname" | tr '[:upper:]' '[:lower:]')

    if [[ "$lower" == *.appimage ]]; then
        APP_PATH="$INSTALL_DIR/$fname"
        TMP_APP_PATH="/tmp/$fname"
        print_info "Downloading AppImage to $TMP_APP_PATH..."
        if ! curl -L -o "$TMP_APP_PATH" "$candidate_url" --fail; then
            print_error "Download failed. Aborting."
            exit 1
        fi

        print_status "Moving AppImage to $APP_PATH..."
        mv "$TMP_APP_PATH" "$APP_PATH"
        print_status "Making executable..."
        chmod +x "$APP_PATH"

        # Optional: Create Desktop Entry
        if [ -d "$HOME/.local/share/applications" ]; then
            print_info "Creating desktop entry..."
            cat > "$HOME/.local/share/applications/pedro-visualizer.desktop" << EOL
[Desktop Entry]
Name=Pedro Pathing Visualizer
Exec=$APP_PATH
Icon=utilities-terminal
Type=Application
Categories=Development;
Comment=Visualizer for Pedro Pathing
Terminal=false
EOL
            print_status "Desktop shortcut created."
        fi

        print_status "Installation Complete!"
        echo "Run it via: $APP_PATH"
    elif [[ "$lower" == *.deb ]]; then
        TMP_DEB="/tmp/$fname"
        print_info "Downloading .deb to $TMP_DEB..."
        if ! curl -L -o "$TMP_DEB" "$candidate_url" --fail; then
            print_error "Download failed. Aborting."
            exit 1
        fi
        print_status "Installing via dpkg..."
        sudo dpkg -i "$TMP_DEB" || (print_warning "dpkg returned errors; attempting to fix with apt-get -f install" && sudo apt-get -f install -y)
        rm -f "$TMP_DEB"
        print_status "Installation Complete! Launch from your applications menu."
    elif [[ "$lower" == *.tar.gz ]]; then
        TMP_TAR="/tmp/$fname"
        DEST_DIR="$INSTALL_DIR/pedro-$RANDOM"
        print_info "Downloading tarball to $TMP_TAR..."
        if ! curl -L -o "$TMP_TAR" "$candidate_url" --fail; then
            print_error "Download failed. Aborting."
            exit 1
        fi
        mkdir -p "$DEST_DIR"
        tar -xzf "$TMP_TAR" -C "$DEST_DIR" || (print_error "Failed to extract tarball" && exit 1)
        rm -f "$TMP_TAR"
        print_status "Extracted to $DEST_DIR"
        echo "Inspect the folder and run the executable inside. Consider moving it to /usr/local/bin if it's a single executable."
    else
        print_error "Unknown or unsupported asset type: $fname"
        exit 1
    fi
}

# Main Script Execution
print_logo

# Detect OS
OS_TYPE=$(uname -s)
case "$OS_TYPE" in
    Darwin*)    DETECTED_OS="macOS" ;;
    Linux*)     DETECTED_OS="Linux" ;;
    CYGWIN*|MINGW*|MSYS*) DETECTED_OS="Windows" ;;
    *)          DETECTED_OS="Unknown" ;;
esac

echo "Detected System: $DETECTED_OS"
echo ""
echo "Select installation type:"
echo "1) macOS (DMG)"
echo "2) Linux (AppImage)"
echo "3) Windows (Info)"
echo ""
read -p "Enter choice [1-3] (Default: Auto-detect): " CHOICE < /dev/tty

if [ -z "$CHOICE" ]; then
    case "$DETECTED_OS" in
        "macOS") CHOICE=1 ;;
        "Linux") CHOICE=2 ;;
        "Windows") CHOICE=3 ;;
        *) print_error "Could not auto-detect OS. Please select manualy."; exit 1 ;;
    esac
fi

case "$CHOICE" in
    1)
        install_mac
        ;;
    2)
        install_linux
        ;;
    3)
        print_header "Windows Installation"
        echo "This script cannot install the Windows .exe directly."
        echo "Please download the latest 'Pedro-Pathing-Visualizer-Setup.exe' from:"
        echo ""
        echo "   https://github.com/Mallen220/PedroPathingVisualizer/releases/latest"
        echo ""
        ;;
    *)
        print_error "Invalid selection."
        exit 1
        ;;
esac