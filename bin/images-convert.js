#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { Command } from "commander";
import ora from "ora";
import pc from "picocolors";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const require = createRequire(import.meta.url);

const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

const FORMAT_CONFIG = {
  "to-webp": {
    packageName: "images-to-webp-cli",
    outputExtension: ".webp",
    color: pc.cyan,
    useProgrammatic: false,
    cliArgSets: (inputFile) => [["convert", inputFile], [inputFile]]
  },
  "to-avif": {
    packageName: "images-to-avif-cli",
    outputExtension: ".avif",
    color: pc.green,
    useProgrammatic: false,
    cliArgSets: (inputFile) => [["convert", inputFile], [inputFile]]
  },
  "to-svg": {
    packageName: "images-to-svg",
    outputExtension: ".svg",
    color: pc.magenta,
    useProgrammatic: false,
    cliArgSets: (inputFile) => [["convert", inputFile], [inputFile]]
  },
  "to-ico": {
    packageName: null,
    outputExtension: ".ico",
    color: pc.yellow,
    useProgrammatic: true,
    cliArgSets: () => []
  }
};

function bytesToHuman(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let i = 0;

  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i += 1;
  }

  return `${size.toFixed(2)} ${units[i]}`;
}

function getPercentChange(before, after) {
  if (before <= 0) return "N/A";
  const change = ((after - before) / before) * 100;
  return `${change.toFixed(2)}%`;
}

function isSupportedImage(filePath) {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function collectInputFiles(inputPath) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input path does not exist: ${inputPath}`);
  }

  const stats = fs.statSync(inputPath);

  if (stats.isFile()) {
    if (!isSupportedImage(inputPath)) {
      throw new Error("Only .jpg, .jpeg, and .png files are supported as input.");
    }

    return [path.resolve(inputPath)];
  }

  if (!stats.isDirectory()) {
    throw new Error("Input path must be a file or a directory.");
  }

  const files = fs
    .readdirSync(inputPath)
    .map((name) => path.join(inputPath, name))
    .filter((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile())
    .filter((filePath) => isSupportedImage(filePath))
    .map((filePath) => path.resolve(filePath));

  if (files.length === 0) {
    throw new Error("No supported image files found in this directory.");
  }

  return files;
}

function resolvePackageInfo(packageName) {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const packageDir = path.dirname(packageJsonPath);
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  let binRelativePath = null;

  if (typeof pkg.bin === "string") {
    binRelativePath = pkg.bin;
  } else if (pkg.bin && typeof pkg.bin === "object") {
    const entries = Object.entries(pkg.bin);
    if (entries.length > 0) {
      binRelativePath = entries[0][1];
    }
  }

  if (!binRelativePath) {
    throw new Error(`Could not find a binary entry in ${packageName} package.`);
  }

  return {
    packageDir,
    binAbsolutePath: path.resolve(packageDir, binRelativePath)
  };
}

async function tryProgrammaticConvert(packageName, inputFile, outputExtension) {
  try {
    const moduleExports = await import(packageName);
    const candidates = [
      moduleExports.convert,
      moduleExports.run,
      moduleExports.default,
      moduleExports.convertImage,
      moduleExports.transform
    ].filter((fn) => typeof fn === "function");

    if (candidates.length === 0) {
      return { used: false };
    }

    const before = fs.statSync(inputFile).size;
    const startedAt = Date.now();

    // Try the first available function with a conservative signature.
    await candidates[0](inputFile);

    const outputFile = findOutputFile(inputFile, outputExtension, startedAt);
    if (!outputFile) {
      return { used: false };
    }

    const after = fs.statSync(outputFile).size;

    return {
      used: true,
      outputFile,
      before,
      after
    };
  } catch {
    return { used: false };
  }
}

function runCliConverter(binAbsolutePath, inputFile, outputExtension, cliArgSets = [[inputFile]]) {
  const before = fs.statSync(inputFile).size;
  let lastError = null;

  for (const cliArgs of cliArgSets) {
    const startedAt = Date.now();
    const result = spawnSync(process.execPath, [binAbsolutePath, ...cliArgs], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });

    if (result.error) {
      lastError = result.error;
      continue;
    }

    if (result.status !== 0) {
      const rawMessage = `${result.stderr || ""}\n${result.stdout || ""}`.trim();
      lastError = new Error(rawMessage || `Conversion process exited with code ${result.status}.`);
      continue;
    }

    const outputFile = findOutputFile(inputFile, outputExtension, startedAt);

    if (!outputFile) {
      lastError = new Error("Conversion command completed, but output file was not found.");
      continue;
    }

    const after = fs.statSync(outputFile).size;

    return {
      outputFile,
      before,
      after
    };
  }

  throw lastError ?? new Error("Conversion failed with unknown error.");
}

function findOutputFile(inputFile, outputExtension, startedAt) {
  const inputDir = path.dirname(inputFile);
  const baseName = path.parse(inputFile).name;
  const primaryCandidate = path.join(inputDir, `${baseName}${outputExtension}`);

  if (fs.existsSync(primaryCandidate)) {
    const mtime = fs.statSync(primaryCandidate).mtimeMs;
    if (mtime >= startedAt - 2000) {
      return primaryCandidate;
    }
  }

  const candidates = fs
    .readdirSync(inputDir)
    .map((name) => path.join(inputDir, name))
    .filter((candidatePath) => fs.statSync(candidatePath).isFile())
    .filter((candidatePath) => path.extname(candidatePath).toLowerCase() === outputExtension)
    .filter((candidatePath) => path.parse(candidatePath).name.startsWith(baseName))
    .map((candidatePath) => ({
      file: candidatePath,
      mtime: fs.statSync(candidatePath).mtimeMs
    }))
    .filter(({ mtime }) => mtime >= startedAt - 2000)
    .sort((a, b) => b.mtime - a.mtime);

  return candidates[0]?.file ?? null;
}

async function convertSingleFile(filePath, formatOption, options = {}) {
  const outputDir = options.output ? path.resolve(options.output) : null;

  if (formatOption === "to-webp") {
    const before = fs.statSync(filePath).size;
    const outputFileName = `${path.parse(filePath).name}.webp`;
    const outputFile = outputDir ? path.join(outputDir, outputFileName) : path.join(path.dirname(filePath), outputFileName);

    await sharp(filePath).webp({ quality: options.quality }).toFile(outputFile);

    const after = fs.statSync(outputFile).size;
    return {
      outputFile,
      before,
      after,
      method: "programmatic"
    };
  }

  if (formatOption === "to-avif") {
    const before = fs.statSync(filePath).size;
    const outputFileName = `${path.parse(filePath).name}.avif`;
    const outputFile = outputDir ? path.join(outputDir, outputFileName) : path.join(path.dirname(filePath), outputFileName);

    await sharp(filePath).avif({ quality: options.quality }).toFile(outputFile);

    const after = fs.statSync(outputFile).size;
    return {
      outputFile,
      before,
      after,
      method: "programmatic"
    };
  }

  if (formatOption === "to-ico") {
    const before = fs.statSync(filePath).size;
    const outputFileName = `${path.parse(filePath).name}.ico`;
    const outputFile = outputDir ? path.join(outputDir, outputFileName) : path.join(path.dirname(filePath), outputFileName);
    const inputExtension = path.extname(filePath).toLowerCase();
    let icoBuffer;

    if (inputExtension === ".png") {
      icoBuffer = await pngToIco(filePath);
    } else {
      const pngBuffer = await sharp(filePath).png().toBuffer();
      icoBuffer = await pngToIco(pngBuffer);
    }

    fs.writeFileSync(outputFile, icoBuffer);
    const after = fs.statSync(outputFile).size;

    return {
      outputFile,
      before,
      after,
      method: "programmatic"
    };
  }

  const { packageName, outputExtension, cliArgSets, useProgrammatic } = FORMAT_CONFIG[formatOption];

  if (useProgrammatic) {
    const programmaticResult = await tryProgrammaticConvert(packageName, filePath, outputExtension);

    if (programmaticResult.used) {
      return {
        ...programmaticResult,
        method: "programmatic"
      };
    }
  }

  const { binAbsolutePath } = resolvePackageInfo(packageName);
  const cliResult = runCliConverter(binAbsolutePath, filePath, outputExtension, cliArgSets(filePath));

  if (outputDir) {
    const movedOutputFile = path.join(outputDir, path.basename(cliResult.outputFile));
    if (fs.existsSync(movedOutputFile)) {
      fs.unlinkSync(movedOutputFile);
    }
    fs.renameSync(cliResult.outputFile, movedOutputFile);
    cliResult.outputFile = movedOutputFile;
  }

  return {
    ...cliResult,
    method: "cli"
  };
}

async function main() {
  const program = new Command();

  program
    .name("images-convert")
    .description("Wrapper CLI to convert images to WebP, AVIF, SVG, or ICO")
    .option("--remove", "Remove original source file after successful conversion")
    .option("-o, --output <dir>", "Output directory for converted files")
    .option("-q, --quality <number>", "Quality for WebP/AVIF conversion (1-100)", "80")
    .argument("<path>", "Input file or directory")
    .argument("<format>", "Target format: to-webp | to-avif | to-svg | to-ico")
    .action(async (inputPath, formatOption, options) => {
      const selected = FORMAT_CONFIG[formatOption];

      if (!selected) {
        console.error(pc.red(`Invalid format: ${formatOption}`));
        console.error(pc.yellow("Allowed formats: to-webp, to-avif, to-svg, to-ico"));
        process.exitCode = 1;
        return;
      }

      const quality = Number.parseInt(options.quality, 10);
      if (Number.isNaN(quality) || quality < 1 || quality > 100) {
        console.error(pc.red("Invalid --quality value. Allowed range: 1-100."));
        process.exitCode = 1;
        return;
      }

      if (quality !== 80 && !["to-webp", "to-avif"].includes(formatOption)) {
        console.error(pc.red("--quality is only supported for to-webp and to-avif."));
        process.exitCode = 1;
        return;
      }

      const color = selected.color;
      const absoluteInputPath = path.resolve(inputPath);
      const outputDir = options.output ? path.resolve(options.output) : null;

      if (outputDir) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      let filesToProcess = [];
      try {
        filesToProcess = collectInputFiles(absoluteInputPath);
      } catch (error) {
        console.error(pc.red(`Error: ${error.message}`));
        process.exitCode = 1;
        return;
      }

      console.log(color(`Starting conversion to ${formatOption.replace("to-", "").toUpperCase()}...`));
      console.log(pc.dim(`Files queued: ${filesToProcess.length}`));

      const spinner = ora("Preparing conversion...").start();

      let successCount = 0;
      let failCount = 0;
      let removedCount = 0;
      let removeFailCount = 0;
      let totalBefore = 0;
      let totalAfter = 0;
      const failures = [];
      const removeFailures = [];

      for (let i = 0; i < filesToProcess.length; i += 1) {
        const filePath = filesToProcess[i];
        const fileName = path.basename(filePath);

        spinner.text = `Converting (${i + 1}/${filesToProcess.length}): ${fileName}`;

        try {
          const result = await convertSingleFile(filePath, formatOption, {
            output: outputDir,
            quality
          });

          if (options.remove) {
            try {
              fs.unlinkSync(filePath);
              removedCount += 1;
            } catch (removeError) {
              removeFailCount += 1;
              removeFailures.push({
                fileName,
                error: removeError.message
              });
            }
          }

          successCount += 1;
          totalBefore += result.before;
          totalAfter += result.after;

          const percentChange = getPercentChange(result.before, result.after);
          spinner.succeed(
            color(
              `${fileName} -> ${path.basename(result.outputFile)} | ${bytesToHuman(result.before)} -> ${bytesToHuman(result.after)} (${percentChange}) [${result.method}]`
            )
          );
          spinner.start();
        } catch (error) {
          failCount += 1;
          failures.push({ fileName, error: error.message });
          spinner.fail(pc.red(`${fileName} failed: ${error.message}`));
          spinner.start();
        }
      }

      spinner.stop();

      const totalPercent = getPercentChange(totalBefore, totalAfter);

      console.log("\n" + pc.bold("Summary"));
      console.log(pc.green(`Success: ${successCount}`));
      console.log(pc.red(`Failed: ${failCount}`));
      if (options.remove) {
        console.log(pc.green(`Original removed: ${removedCount}`));
        console.log(pc.yellow(`Original remove failed: ${removeFailCount}`));
      }
      console.log(pc.white(`Total size: ${bytesToHuman(totalBefore)} -> ${bytesToHuman(totalAfter)} (${totalPercent})`));

      if (failures.length > 0) {
        console.log("\n" + pc.red(pc.bold("Errors")));
        for (const item of failures) {
          console.log(pc.red(`- ${item.fileName}: ${item.error}`));
        }
      }

      if (removeFailures.length > 0) {
        console.log("\n" + pc.yellow(pc.bold("Remove Errors")));
        for (const item of removeFailures) {
          console.log(pc.yellow(`- ${item.fileName}: ${item.error}`));
        }
      }

      process.exitCode = failCount > 0 ? 1 : 0;
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(pc.red(`Unexpected error: ${error.message}`));
  process.exit(1);
});
