declare const chrome: typeof browser;

import { AppSettings } from '../types';

// 设置存储键名
const SETTINGS_KEY = 'bark_app_settings';

// 默认自定义参数配置
export const DEFAULT_ADVANCED_PARAMS = {
    title: "",
    subtitle: "",
    image: "",
    level: "",
    volume: "5",
    badge: "",
    call: "",
    autoCopy: "1",
    copy: "",
    group: "",
    isArchive: "",
    url: "",
    action: ""
};

// 默认设置
export const DEFAULT_SETTINGS: AppSettings = {
    enableContextMenu: true,
    enableInspectSend: true,
    themeMode: 'system',
    enableEncryption: false,
    encryptionConfig: {
        algorithm: 'AES256',
        mode: 'CBC',
        padding: 'pkcs7',
        key: ''
    },
    sound: undefined, // 推送铃声，默认不设置
    enableBasicAuth: false, // Basic Auth，默认关闭
    enableApiV2: false, // API v2，默认关闭
    enableAdvancedParams: false, // 完整参数配置，默认关闭
    advancedParamsJson: JSON.stringify(DEFAULT_ADVANCED_PARAMS, null, 2), // 默认自定义参数JSON
    enableSpeedMode: false, // 极速模式，默认关闭
    speedModeCountdown: 3000, // 极速模式倒计时，默认3秒
    enableFaviconIcon: false, // 启用 favicon 作为 icon，默认关闭
    faviconApiUrl: '', // favicon 接口 URL 模板
    enableSystemNotifications: true, // 启用系统通知，默认true
    keepEssentialNotifications: true, // 保有必要通知，默认true
    enableFileCache: true, // 文件缓存，默认开启
    enableFileStorage: false, // 启用文件存储服务，默认关闭
    fileStorageConfig: {
        provider: 'aws',
        endpoint: '',
        region: 'us-east-1',
        bucket: '',
        accessKeyId: '',
        secretAccessKey: '',
        customDomain: '',
        pathPrefix: ''
    }, // 文件存储服务配置
};

// 获取浏览器存储API
async function getStorage() {
    if (typeof browser !== 'undefined' && browser.storage) {
        return browser.storage;
    }
    if (typeof chrome !== 'undefined' && chrome.storage) {
        return chrome.storage;
    }
    throw new Error('无法获取浏览器存储API');
}

// 获取应用设置
export async function getAppSettings(): Promise<AppSettings> {
    try {
        const storage = await getStorage();
        const result = await storage.local.get(SETTINGS_KEY);
        const settings = result[SETTINGS_KEY];

        // 如果没有设置，直接返回默认设置
        if (!settings) {
            return DEFAULT_SETTINGS;
        }

        /* 使用默认设置填充缺失的字段
        // 后续新增设置项时，使用 DEFAULT_SETTINGS 兜底
        // 避免存储操作 */
        return { ...DEFAULT_SETTINGS, ...settings };
    } catch (error) {
        console.error('获取应用设置失败:', error);
        return DEFAULT_SETTINGS;
    }
}

// 保存应用设置
export async function saveAppSettings(settings: AppSettings): Promise<void> {
    try {
        const storage = await getStorage();
        await storage.local.set({ [SETTINGS_KEY]: settings });
        // 触发设置变更事件，通知background更新右键菜单
        await storage.local.set({ 'settings_updated': Date.now() });
    } catch (error) {
        console.error('保存应用设置失败:', error);
        throw error;
    }
}

// 更新单个设置项
export async function updateAppSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
): Promise<void> {
    try {
        const currentSettings = await getAppSettings();
        const newSettings = { ...currentSettings, [key]: value };
        await saveAppSettings(newSettings);
    } catch (error) {
        console.error('更新设置失败:', error);
        throw error;
    }
} 