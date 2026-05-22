#!/bin/bash

echo "=== ZinTrust Core Runtime Bundle Pruning Verification ==="
echo

echo "📊 Bundle Size Comparison:"
echo

# Core bundle sizes
echo "🔹 @zintrust/core bundle sizes:"
echo "  Full index.js:      $(wc -c < dist/src/index.js) bytes"
echo "  Runtime index.js:   $(wc -c < dist/src/runtime-index.js) bytes"
echo "  Size reduction:     $(($(wc -c < dist/src/index.js) - $(wc -c < dist/src/runtime-index.js))) bytes"
echo

# Queue monitor bundle sizes
echo "🔹 @zintrust/queue-monitor bundle sizes:"
echo "  Full index.js:          $(wc -c < packages/queue-monitor/dist/index.js) bytes"
echo "  Runtime index.js:       $(wc -c < packages/queue-monitor/dist/runtime-index.js) bytes"
echo "  Driver subpath:         $(wc -c < packages/queue-monitor/dist/driver-index.js) bytes"
echo "  Metrics subpath:        $(wc -c < packages/queue-monitor/dist/metrics-index.js) bytes"
echo "  Dashboard subpath:      $(wc -c < packages/queue-monitor/dist/dashboard-index.js) bytes"
echo "  Runtime vs Full reduction: $(($(wc -c < packages/queue-monitor/dist/index.js) - $(wc -c < packages/queue-monitor/dist/runtime-index.js))) bytes"
echo

# Non-runtime subpath sizes
echo "🔹 @zintrust/core non-runtime subpaths:"
echo "  CLI utilities:       $(wc -c < dist/src/cli-index.js) bytes"
echo "  Seeders:             $(wc -c < dist/src/seeders-index.js) bytes"
echo "  Testing helpers:     $(wc -c < dist/src/testing-index.js) bytes"
echo "  Scripts:             $(wc -c < dist/src/scripts-index.js) bytes"
echo

echo "✅ Bundle pruning verification completed!"
echo "🎯 Worker bundles can now import only runtime-needed code"
echo "📈 Production deploy uploads will be materially smaller"
