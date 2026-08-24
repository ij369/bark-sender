# Bark Sender - Build Instructions

## English Version

### Build Requirements

This project uses **WXT** (Web Extension Toolkit) to build browser extensions for **Firefox**, **Chrome**, and **Edge**. The following programs and versions are required for building:

#### Operating System Requirements
- **macOS**: 12.7+ (Monterey or later)
- **Linux**: Ubuntu 18.04+ or equivalent distributions

#### Required Programs and Versions

1. **Node.js**: Version 22.0.0 or higher
   - Download from: https://nodejs.org/
   - Verify installation: `node --version`

2. **pnpm**: Version 9.0.0 or higher (Package Manager)
   - Install via npm: `npm install -g pnpm`
   - Or install via standalone: https://pnpm.io/installation
   - Verify installation: `pnpm --version`

3. **TypeScript**: Version 5.8.3 (included in devDependencies)
   - Automatically installed via pnpm

4. **WXT**: Version 0.20.25 (Web Extension Toolkit)
   - Automatically installed via pnpm
   - Main build tool for the extension

#### Build Environment Setup

1. **Clone/Extract the source code**
2. **Navigate to project directory**
3. **Set execute permissions for build script**:
   ```bash
   chmod +x build.sh
   ```
4. **Install dependencies**: `pnpm install`
5. **Run build script**: Execute the provided `build.sh` script

#### Build Process

The build process consists of the following steps:

1. **Dependency Installation**: Install all required packages via pnpm
2. **TypeScript Compilation**: Compile TypeScript source files
3. **WXT Build**: Build extensions for both Firefox and Chrome/Edge targets
4. **Packaging**: Create distributable ZIP files for all browsers

#### Build Script Execution

**First, make the script executable:**
```bash
chmod +x build.sh
```

**Then run the build script:**
```bash
./build.sh
```

This script will:
- Automatically set execute permissions if needed
- Install all dependencies
- Build extensions for Firefox and Chrome/Edge
- Create ZIP packages for all browsers
- Output the following files in the `.output` folder:
  - `bark-sender-<Version>-firefox.zip` (Firefox)
  - `bark-sender-<Version>-chrome.zip` (Chrome/ Edge)

#### Final Output

After successful build, you will find the extension packages at:
- **Firefox**: `.output/bark-sender-<Version>-firefox.zip`
- **Chrome/Edge**: `.output/bark-sender-<Version>-chrome.zip`
- **Location**: Project root `.output` directory

✅ System Compatibility: Passed testing on macOS 12.7.6

### Source Code Repository

👉 https://github.com/ij369/bark-sender

This repository contains all source files, build scripts, and dependency declarations required to reproduce the extension package.


---

## Dependencies Information

### Main Dependencies
- **React**: 19.1.0 - UI framework
- **Material-UI**: 7.2.0 - UI components
- **TypeScript**: 5.8.3 - Type system
- **WXT**: 0.20.25 - Extension build toolkit
- **i18next**: 25.3.2 - Internationalization

### Development Dependencies
All development dependencies are automatically installed via `pnpm install` and are required for the build process.

For complete dependency list, refer to `package.json` in the project root. 