#!/usr/bin/env bash
# ============================================================================
# Project Configurator — setup_project.sh
# ============================================================================
# Configures a target project to use the Remote Antigravity hook bridge.
# Writes .gemini/settings.json pointing to the ABSOLUTE paths of the hooks.
#
# Usage:
#   ./scripts/setup_project.sh /path/to/target/project
# ============================================================================

set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <target_directory>"
    exit 1
fi

TARGET_DIR="$1"
# Resolve absolute path of HQ (where hooks live)
HQ_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ Target directory not found: $TARGET_DIR"
    exit 1
fi

DOT_GEMINI="$TARGET_DIR/.gemini"
SETTINGS="$DOT_GEMINI/settings.json"

mkdir -p "$DOT_GEMINI"

echo "🔧 Configuring project: $TARGET_DIR"
# Create wrapper scripts to handle spaces in paths (Gemini CLI resolves symlinks, so we need real files)
WRAPPERS_DIR="$HOME/.gemini/wa_bridge_wrappers"
mkdir -p "$WRAPPERS_DIR"

# Wrapper for BeforeAgent
cat > "$WRAPPERS_DIR/before_agent_wa.sh" <<EOF
#!/bin/bash
exec "$HQ_DIR/scripts/hooks/before_agent_wa.sh"
EOF
chmod +x "$WRAPPERS_DIR/before_agent_wa.sh"

# Wrapper for AfterAgent
cat > "$WRAPPERS_DIR/after_agent_wa.sh" <<EOF
#!/bin/bash
exec "$HQ_DIR/scripts/hooks/after_agent_wa.sh"
EOF
chmod +x "$WRAPPERS_DIR/after_agent_wa.sh"

echo "🔗 Created wrappers in: $WRAPPERS_DIR"

# Write settings.json using the wrapper paths (safe from spaces)
cat > "$SETTINGS" <<EOF
{
    "hooks": {
        "BeforeAgent": [
            {
                "matcher": "*",
                "hooks": [
                    {
                        "name": "wa-bridge-inject",
                        "type": "command",
                        "command": "$WRAPPERS_DIR/before_agent_wa.sh",
                        "description": "Inject Telegram context (Remote Antigravity Bridge)"
                    }
                ]
            }
        ],
        "AfterAgent": [
            {
                "matcher": "*",
                "hooks": [
                    {
                        "name": "wa-bridge-extract",
                        "type": "command",
                        "command": "$WRAPPERS_DIR/after_agent_wa.sh",
                        "description": "Inject Telegram context (Remote Antigravity Bridge)"
                    }
                ]
            }
        ]

    }
}
EOF

echo "✅ Created $SETTINGS"
echo "   Now execute in Telegram: /add $(basename "$TARGET_DIR") $TARGET_DIR"
echo "   Then switch:             /project $(basename "$TARGET_DIR")"
