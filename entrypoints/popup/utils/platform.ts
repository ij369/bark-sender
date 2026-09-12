import { PlatformType } from '../types';

/**
 * 检测当前用户的操作系统平台
 * @returns PlatformType
 */
export function detectPlatform(): PlatformType {
    if (typeof navigator === 'undefined') {
        return 'unknown';
    }

    const userAgent = navigator.userAgent.toLowerCase();
    const platform = navigator.platform?.toLowerCase() || '';

    // 检测Mac设备
    if (platform.includes('mac') || userAgent.includes('mac os') || userAgent.includes('macintosh')) {
        return 'mac';
    }

    // 检测Windows设备
    if (platform.includes('win') || userAgent.includes('windows')) {
        return 'windows';
    }

    // 检测Linux设备
    if (platform.includes('linux') || userAgent.includes('linux')) {
        return 'linux';
    }

    return 'unknown';
}

/**
 * 判断是否为Apple设备
 * @param platform 平台类型
 * @returns boolean
 */
export function isAppleDevice(platform: PlatformType): boolean {
    return platform === 'mac';
}

/**
 * 根据平台获取快捷键组合文本
 * @param platform 平台类型
 * @returns 快捷键配置对象
 */
export function getShortcutKeys(platform: PlatformType) {
    const isApple = isAppleDevice(platform);

    return {
        send: isApple ? '⌘ + ↩' : 'Ctrl + Enter',
        openExtension: isApple ? '⌘ + ⇧ + 8' : 'Ctrl + Shift + 8'
    };
}

/**
 * 检测浏览器类型
 * @returns 'firefox' | 'chrome' | 'edge' | 'safari' | 'unknown'
 */
export function detectBrowser(): 'firefox' | 'chrome' | 'edge' | 'safari' | 'unknown' {
    if (typeof navigator === 'undefined') {
        return 'unknown';
    }

    const userAgent = navigator.userAgent.toLowerCase();

    // Firefox
    if (userAgent.includes('firefox')) {
        return 'firefox';
    }

    // Edge
    if (userAgent.includes('edg/') || userAgent.includes('edge/')) {
        return 'edge';
    }

    // Chrome
    if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
        return 'chrome';
    }

    // Safari
    if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
        return 'safari';
    }

    return 'unknown';
}

/**
 * 当前环境是否为 Chromium 浏览器（Chrome / Edge）
 */
export function isChromium(): boolean {
    const b = detectBrowser();
    return ['chrome', 'edge'].includes(b);
}

/**
 * Safari 工具栏 popup 需用 transform 模拟滚动
 */
export function needsTransformScroll(): boolean {
    return typeof window !== 'undefined'
        && detectBrowser() === 'safari'
        && !['window', 'sidepanel'].includes(new URLSearchParams(window.location.search).get('mode') ?? '');
}
