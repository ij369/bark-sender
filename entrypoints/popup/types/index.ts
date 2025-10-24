// 设备信息接口
export interface Device {
    id: string; // 时间戳作为唯一标识
    alias: string; // 设备别名
    apiURL: string; // API URL
    createdAt: string; // 创建时间 YYYY-MM-DD HH:mm:ss
    timestamp: number; // 时间戳
    authorization?: {
        type: 'basic';
        user: string;
        pwd: string;
        value: string; // `basic btoa(${username}:${password})`
    };
    server?: string; // 服务器地址 为 API v2 批量推送使用
    deviceKey?: string; // 设备密钥 为 API v2 批量推送使用
}

// 推送响应接口
export interface PushResponse {
    code: number;
    message: string;
    timestamp: number;
}

// 页面标识
export type TabValue = 'send' | 'history' | 'settings';

// 主题模式类型
export type ThemeMode = 'light' | 'dark' | 'system';

// 加密算法类型
export type EncryptionAlgorithm = 'AES256' | 'AES192' | 'AES128';

// 加密模式类型  
export type EncryptionMode = 'CBC';

// 填充模式类型
export type PaddingMode = 'pkcs7';

// 加密配置接口
export interface EncryptionConfig {
    algorithm: EncryptionAlgorithm;
    mode: EncryptionMode;
    padding: PaddingMode;
    key: string;
}

// 铃声接口
export interface Sound {
    name: string;
    duration: number; // 持续时间 (ms)
    old?: boolean; // 是否为旧铃声
}

// 文件存储服务提供商类型
export type FileStorageProvider = 'aws' | 'r2' | 'custom';

// 文件存储配置接口
export interface FileStorageConfig {
    provider: FileStorageProvider;
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    customDomain?: string;
    pathPrefix?: string;
}

// 应用设置接口
export interface AppSettings {
    enableContextMenu: boolean;
    enableInspectSend: boolean;
    themeMode: ThemeMode;
    enableEncryption: boolean;
    encryptionConfig?: EncryptionConfig;
    sound?: string;
    enableBasicAuth: boolean;
    enableCustomAvatar?: boolean; // 是否启用自定义头像
    barkAvatarUrl?: string; // 自定义头像URL
    enableApiV2?: boolean; // 是否启用API v2
    enableAdvancedParams?: boolean; // 是否启用完整参数配置
    advancedParamsJson?: string; // 完整参数配置的 JSON
    enableSpeedMode?: boolean; // 是否启用极速模式
    speedModeCountdown?: number; // 极速模式倒计时时间(ms)
    enableFaviconIcon?: boolean; // 是否启用 favicon 作为 icon
    faviconApiUrl?: string; // favicon 接口 URL 模板
    enableSystemNotifications?: boolean; // 是否启用系统通知
    keepEssentialNotifications?: boolean; // 是否保留必要通知（仅显示错误通知）
    enableFileCache?: boolean; // 是否启用文件缓存
    enableFileStorage?: boolean; // 是否启用文件存储服务
    fileStorageConfig?: FileStorageConfig; // 文件存储服务配置
}
// 平台类型
export type PlatformType = 'mac' | 'windows' | 'linux' | 'unknown';

// App上下文状态接口
export interface AppContextState {
    platform: PlatformType;
    isAppleDevice: boolean;
    shortcutKeys: {
        send: string; // 发送快捷键组合
        openExtension: string; // 打开扩展快捷键组合
    };
    // 加密相关
    appSettings: AppSettings | null;
    loading: boolean;
}

// App上下文接口
export interface AppContextType extends AppContextState {
    // 加密相关
    toggleEncryption: () => Promise<void>;
    updateEncryptionConfig: (config: EncryptionConfig) => Promise<void>;
    updateAppSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
    reloadSettings: () => Promise<void>;
    shouldShowEncryptionToggle: boolean;
    cleanupBlobs: () => void;    // blob 管理
}
