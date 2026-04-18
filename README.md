# images-convert

`images-convert` is a wrapper CLI package that integrates these 3 libraries:

1. `images-to-webp-cli`
2. `images-to-avif-cli`
3. `images-to-svg`

This package provides one unified command so you can convert images to WebP, AVIF, or SVG from a single entry point.

## Install

```bash
npm install -g images-convert
```

## Usage

Global command:

```bash
images-convert <path> to-<webp|avif|svg>
```

<!-- NPM script command:

```bash
npm run images-convert -- <path> to-<webp|avif|svg>
``` -->

Notes:

- `<path>` can be a single file or a directory.
- Supported source input files: `.jpg`, `.jpeg`, `.png`.
- For directory mode, files are read non-recursively from the selected folder.

## Examples

```bash
images-convert ./assets/photo.jpg to-webp
images-convert ./assets to-avif
images-convert ./assets/logo.png to-svg
```