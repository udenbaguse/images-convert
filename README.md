# images-convert

`images-convert` is a wrapper CLI package that integrates these libraries:

1. `images-to-webp-cli`
2. `images-to-avif-cli`
3. `images-to-svg`
4. `png-to-ico`

This package provides one unified command so you can convert images to WebP, AVIF, SVG, or ICO from a single entry point.

## Install

```bash
npm install -g images-convert
```

## Usage

Global command:

```bash
images-convert <path> [path ...] <format> [options]
```

<!-- NPM script command:

```bash
npm run images-convert -- <path> to-<webp|avif|svg>
``` -->

## Format

- `to-webp` Convert images to WebP format.
- `to-avif` Convert images to AVIF format.
- `to-svg` Convert images to SVG format.
- `to-ico` Convert images to ICO format.

## Options

- `--remove` Remove original source file after successful conversion.
- `-o, --output <dir>` Output directory for converted files.
- `-q, --quality <number>` Quality for WebP/AVIF conversion (`1-100`, default `80`).

## Examples

```bash
images-convert ./assets/photo.jpg to-webp
images-convert ./assets to-avif
images-convert ./a.jpg ./b.png ./folder-images to-avif --quality 75
images-convert ./assets/logo.png to-svg
images-convert ./assets/favicon.png to-ico
images-convert ./assets/photo.jpg to-avif --remove
images-convert ./assets/photo.jpg to-webp --quality 90
images-convert ./assets to-avif --output ./converted
images-convert ./assets/photo.jpg to-avif --quality 65 --output ./dist --remove
```
Notes:

- `<path>` can be one or many file/directory paths.
- `<format>`: `to-webp`, `to-avif`, `to-svg`, `to-ico`.
- Supported source input files: `.jpg`, `.jpeg`, `.png`.
- For directory mode, files are read non-recursively from the selected folder.
- `--output <dir>` writes converted files into a custom directory (created automatically if missing).
- `--quality` is supported for `to-webp` and `to-avif` only.
- `--remove` deletes original source file only when conversion succeeds.
- `to-ico` supports `.jpg`, `.jpeg`, and `.png` input.
