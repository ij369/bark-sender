#!/bin/bash

# Bark Sender - Multi-Browser Extension Build Script

set -e

echo "🚀 开始构建 Bark Sender 多浏览器扩展..."
echo "🚀 Starting Bark Sender Multi-Browser Extension Build..."
echo "📦 目标浏览器 / Target Browsers: Chrome, Firefox, Edge"
echo ""

# 动态读取项目版本号
PACKAGE_VERSION=$(node -pe "require('./package.json').version")
echo "📋 项目版本 / Project Version: v$PACKAGE_VERSION"
echo ""

# 检查操作系统
echo "📋 检查构建环境 / Checking build environment..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS 系统检查
    MACOS_VERSION=$(sw_vers -productVersion)
    echo "✅ 检测到 macOS 系统，版本: $MACOS_VERSION"
    echo "✅ Detected macOS system, version: $MACOS_VERSION"
    
    # 检查是否满足最低版本要求 (12.7+)
    if [[ $(echo "$MACOS_VERSION 12.7" | tr " " "\n" | sort -V | head -n1) != "12.7" ]]; then
        echo "⚠️  推荐使用 macOS 12.7 或更高版本以获得最佳兼容性"
        echo "⚠️  Recommended to use macOS 12.7 or higher for best compatibility"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "✅ 检测到 Linux 系统"
    echo "✅ Detected Linux system"
    
    # 尝试获取 Linux 发行版信息
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "   发行版 / Distribution: $NAME"
    fi
else
    echo "❌ 错误: 不支持的操作系统: $OSTYPE"
    echo "❌ Error: Unsupported operating system: $OSTYPE"
    echo "💡 此脚本仅支持 macOS 和 Linux 系统"
    echo "💡 This script only supports macOS and Linux systems"
    exit 1
fi
echo ""

# 检查 Node.js 版本
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js 22.0.0 或更高版本"
    echo "❌ Error: Node.js not found. Please install Node.js 22.0.0 or higher"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "💡 macOS 安装建议:"
        echo "   - 使用 Homebrew: brew install node"
        echo "   - 或访问官网: https://nodejs.org/"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "💡 Linux 安装建议:"
        echo "   - Ubuntu/Debian: sudo apt install nodejs npm"
        echo "   - 或访问官网: https://nodejs.org/"
    fi
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2)
echo "✅ Node.js 版本: v$NODE_VERSION"

# 检查 Node.js 版本是否满足要求
NODE_MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)
if [ "$NODE_MAJOR_VERSION" -lt 22 ]; then
    echo "❌ 错误: Node.js 版本过低，需要 22.0.0 或更高版本"
    echo "❌ Error: Node.js version too low, requires 22.0.0 or higher"
    exit 1
fi

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
    echo "❌ 错误: 未找到 pnpm，请先安装 pnpm"
    echo "❌ Error: pnpm not found. Please install pnpm first"
    echo ""
    echo "💡 安装方法 / Installation methods:"
    echo "   npm install -g pnpm"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "   brew install pnpm  (macOS Homebrew)"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "   curl -fsSL https://get.pnpm.io/install.sh | sh -  (Linux)"
    fi
    echo "   或访问 / Or visit: https://pnpm.io/installation"
    exit 1
fi

PNPM_VERSION=$(pnpm --version)
echo "✅ pnpm 版本: v$PNPM_VERSION"
echo ""

# 确保脚本具有执行权限
if [ ! -x "$0" ]; then
    echo "🔧 设置脚本执行权限 / Setting script execution permissions..."
    chmod +x "$0"
    echo "✅ 执行权限已设置"
    echo ""
fi

# 清理之前的构建输出
echo "🧹 清理之前的构建输出 / Cleaning previous build output..."
if [ -d ".output" ]; then
    rm -rf .output
    echo "✅ 已清理 .output 目录"
fi

if [ -d ".wxt" ]; then
    rm -rf .wxt
    echo "✅ 已清理 .wxt 缓存目录"
fi

# 清理 node_modules/.cache 缓存（如果存在）
if [ -d "node_modules/.cache" ]; then
    rm -rf node_modules/.cache
    echo "✅ 已清理 node_modules 缓存"
fi
echo ""

# 安装依赖
echo "📦 安装项目依赖 / Installing project dependencies..."
pnpm install
echo "✅ 依赖安装完成"
echo ""

# TypeScript 类型检查
echo "🔍 执行 TypeScript 类型检查 / Running TypeScript type checking..."
pnpm run compile
echo "✅ TypeScript 类型检查通过"
echo ""

# 构建 Chrome 扩展
echo "🔨 构建 Chrome 扩展 / Building Chrome extension..."
pnpm run build:chrome
echo "✅ Chrome 扩展构建完成"
echo ""

# 打包 Chrome 扩展
echo "📦 打包 Chrome 扩展 / Packaging Chrome extension..."
pnpm run zip:chrome
echo "✅ Chrome 扩展打包完成"
echo ""

# 构建 Firefox 扩展
echo "🔨 构建 Firefox 扩展 / Building Firefox extension..."
pnpm run build:firefox
echo "✅ Firefox 扩展构建完成"
echo ""

# 打包 Firefox 扩展
echo "📦 打包 Firefox 扩展 / Packaging Firefox extension..."
pnpm run zip:firefox
echo "✅ Firefox 扩展打包完成"
echo ""

# 构建 Edge 扩展
echo "🔨 构建 Edge 扩展 / Building Edge extension..."
pnpm run build:edge
echo "✅ Edge 扩展构建完成"
echo ""

# 打包 Edge 扩展
echo "📦 打包 Edge 扩展 / Packaging Edge extension..."
pnpm run zip:edge
echo "✅ Edge 扩展打包完成"
echo ""

# 检查输出文件
echo "📋 检查构建输出 / Checking build output..."

# 检查 Chrome 扩展
CHROME_SUCCESS=false
if [ -f ".output/bark-sender-$PACKAGE_VERSION-chrome.zip" ]; then
    echo "✅ Chrome 扩展构建成功"
    echo "✅ Chrome extension build successful"
    CHROME_SUCCESS=true
else
    echo "❌ 错误: 未找到 Chrome 扩展包"
    echo "❌ Error: Chrome extension package not found"
fi

# 检查 Firefox 扩展
FIREFOX_SUCCESS=false
if [ -f ".output/bark-sender-$PACKAGE_VERSION-firefox.zip" ]; then
    echo "✅ Firefox 扩展构建成功"
    echo "✅ Firefox extension build successful"
    FIREFOX_SUCCESS=true
else
    echo "❌ 错误: 未找到 Firefox 扩展包"
    echo "❌ Error: Firefox extension package not found"
fi

# 检查 Edge 扩展
EDGE_SUCCESS=false
if [ -f ".output/bark-sender-$PACKAGE_VERSION-edge.zip" ]; then
    echo "✅ Edge 扩展构建成功"
    echo "✅ Edge extension build successful"
    EDGE_SUCCESS=true
else
    echo "❌ 错误: 未找到 Edge 扩展包"
    echo "❌ Error: Edge extension package not found"
fi

# 检查是否至少有一个构建成功
if [ "$CHROME_SUCCESS" = true ] || [ "$FIREFOX_SUCCESS" = true ] || [ "$EDGE_SUCCESS" = true ]; then
    echo ""
    echo "📁 输出文件位置 / Output file locations:"
    
    if [ "$CHROME_SUCCESS" = true ]; then
        echo "   📦 Chrome: .output/bark-sender-$PACKAGE_VERSION-chrome.zip"
        echo "   📏 文件大小 / File size:"
        ls -lh .output/bark-sender-$PACKAGE_VERSION-chrome.zip
    fi
    
    if [ "$FIREFOX_SUCCESS" = true ]; then
        echo "   📦 Firefox: .output/bark-sender-$PACKAGE_VERSION-firefox.zip"
        echo "   📏 文件大小 / File size:"
        ls -lh .output/bark-sender-$PACKAGE_VERSION-firefox.zip
    fi
    
    if [ "$EDGE_SUCCESS" = true ]; then
        echo "   📦 Edge: .output/bark-sender-$PACKAGE_VERSION-edge.zip"
        echo "   📏 文件大小 / File size:"
        ls -lh .output/bark-sender-$PACKAGE_VERSION-edge.zip
    fi
    
    echo ""
    
    # 提供系统特定的便利功能
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "💡 macOS 用户提示: 您可以使用以下命令打开输出目录:"
        echo "💡 macOS tip: You can open the output directory with:"
        echo "   open .output"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "💡 Linux 用户提示: 您可以使用以下命令查看输出目录:"
        echo "💡 Linux tip: You can view the output directory with:"
        echo "   ls -la .output"
        if command -v xdg-open &> /dev/null; then
            echo "   xdg-open .output  (在文件管理器中打开 / Open in file manager)"
        fi
    fi
    echo ""
    
    echo "🎉 多浏览器扩展构建完成！"
    echo "🎉 Multi-browser extension build completed!"
else
    echo "❌ 错误: 所有扩展构建失败"
    echo "❌ Error: All extension builds failed"
    echo "📁 .output 目录内容 / .output directory contents:"
    ls -la .output/ || echo "❌ .output 目录不存在"
    exit 1
fi

echo ""
echo "🍻 构建流程已完成！"
echo "🍻 Build process completed!" 