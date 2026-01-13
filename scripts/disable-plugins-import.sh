#!/bin/bash
TARGET_FILE="src/boot/bootstrap.ts"
if [ -f "$TARGET_FILE" ]; then
    # Use sed to comment out the line.
    # macOS requires an empty extension for -i, standard linux does not use the space or empty string usually.
    # To be safe for cross-platform in a shared repo, we might need a distinct check, but user is on macOS.

    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|import '@/zintrust.plugins';|// import '@/zintrust.plugins';|g" "$TARGET_FILE"
    else
        sed -i "s|import '@/zintrust.plugins';|// import '@/zintrust.plugins';|g" "$TARGET_FILE"
    fi

    echo "Commented out plugin import in $TARGET_FILE"
else
    echo "Error: $TARGET_FILE not found"
    exit 1
fi
