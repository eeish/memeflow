#!/bin/bash
# Generate PWA icons from SVG
# Requires: inkscape, imagemagick, or rsvg-convert

set -e

ICON_SVG="public/icons/icon.svg"
OUTPUT_DIR="public/icons"

# Check which tool is available
if command -v rsvg-convert &> /dev/null; then
    echo "Using rsvg-convert..."
    rsvg-convert -w 192 -h 192 "$ICON_SVG" -o "$OUTPUT_DIR/icon-192.png"
    rsvg-convert -w 512 -h 512 "$ICON_SVG" -o "$OUTPUT_DIR/icon-512.png"
elif command -v inkscape &> /dev/null; then
    echo "Using inkscape..."
    inkscape "$ICON_SVG" -w 192 -h 192 -o "$OUTPUT_DIR/icon-192.png"
    inkscape "$ICON_SVG" -w 512 -h 512 -o "$OUTPUT_DIR/icon-512.png"
elif command -v magick &> /dev/null; then
    echo "Using imagemagick (v7)..."
    magick -background none -resize 192x192 "$ICON_SVG" "$OUTPUT_DIR/icon-192.png"
    magick -background none -resize 512x512 "$ICON_SVG" "$OUTPUT_DIR/icon-512.png"
elif command -v convert &> /dev/null; then
    echo "Using imagemagick (legacy)..."
    convert -background none -resize 192x192 "$ICON_SVG" "$OUTPUT_DIR/icon-192.png"
    convert -background none -resize 512x512 "$ICON_SVG" "$OUTPUT_DIR/icon-512.png"
else
    echo "No SVG converter found. Please install one of:"
    echo "  - librsvg (rsvg-convert)"
    echo "  - inkscape"
    echo "  - imagemagick"
    exit 1
fi

echo "Generated icons:"
ls -la "$OUTPUT_DIR"/*.png
