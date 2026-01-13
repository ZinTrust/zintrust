#!/bin/bash
TARGET_FILE="src/boot/bootstrap.ts"
if [ -f "$TARGET_FILE" ]; then
    # Use sed to comment out the line if it's not already commented.
    if grep -q "^import '@/zintrust.plugins';" "$TARGET_FILE"; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^import '@/zintrust.plugins';|// import '@/zintrust.plugins';|g" "$TARGET_FILE"
        else
            sed -i "s|^import '@/zintrust.plugins';|// import '@/zintrust.plugins';|g" "$TARGET_FILE"
        fi
        echo "Commented out plugin import in $TARGET_FILE"
    else
        echo "Plugin import already commented out or not found in $TARGET_FILE"
    fi
else
    echo "Error: $TARGET_FILE not found"
    exit 1
fi
