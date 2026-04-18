# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog,
and this project follows Semantic Versioning.

## [1.0.0] - 2026-04-19

### Added
- Initial release of `images-convert` wrapper CLI package.
- Global executable via `bin` command: `images-convert`.
- Support input as a single file or directory.
- Supported source extensions: `.jpg`, `.jpeg`, `.png`.
- Target conversion commands: `to-webp`, `to-avif`, and `to-svg`.
- Integration with `images-to-webp-cli`, `images-to-avif-cli`, and `images-to-svg`.
- Programmatic conversion attempt with CLI fallback using child process.
- Terminal spinner/progress using `ora`.
- Colored and readable CLI output using `picocolors`.
- Conversion summary with success/failed counts, size before/after, and percentage changes.
- Error reporting per failed file.