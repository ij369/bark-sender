import { PushResponse, EncryptionAlgorithm, Device } from '../popup/types';

/**
 * 消息体（最终发送给服务器的数据）
 * 注意: 后续出现新的参数，需要在这里添加
 * i18n 参考 https://github.com/Finb/Bark/blob/master/Bark/Localizable.xcstrings
 */
export interface MessagePayload {
    body: string; // 推送内容（必需）
    title?: string; // 推送标题
    subtitle?: string; // 推送副标题
    image?: string; // 推送图片地址，支持 URL 或 base64 编码的图片
    device_key?: string;
    /* 设备 key，API v2 使用
        实际服务器根据请求头 Content-Type 来判断是 API v1 还是 API v2
        目前用的是 API v1, apiURL 格式为 = 服务器地址/:device_key/ device_key在:path 中
        如果后续 API v2 使用, 地址固定为 服务器地址/:push/ device_key在 body 中
     */
    device_keys?: string[]; // key数组，用于批量推送，API v2 使用
    level?: 'critical' | 'active' | 'timeSensitive' | 'passive';
    /* 推送中断级别：
        critical: 重要警告，在静音模式下也会响铃
        active: 默认值，系统会立即亮屏显示通知
        timeSensitive: 时效性通知，可在专注状态下显示通知
        passive: 仅将通知添加到通知列表，不会亮屏提醒
    */
    volume?: number; // 重要警告的通知音量，取值范围：0-10，不传默认值为5
    badge?: number; // 推送角标，可以是任意数字
    call?: '1'; // 传"1"时，通知铃声重复播放
    autoCopy?: '1'; // 传"1"时，iOS14.5以下自动复制推送内容，iOS14.5以上需手动长按推送或下拉推送
    copy?: string; // 复制推送时，指定复制的内容，不传此参数将复制整个推送内容
    sound?: string; // 可以为推送设置不同的铃声
    icon?: string; // 为推送设置自定义图标，设置的图标将替换默认Bark图标
    group?: string; // 对消息进行分组，推送将按group分组显示在通知中心中
    ciphertext?: string; // 加密推送的密文，API v2 使用
    isArchive?: '1'; // 传1保存推送，传其他的不保存推送，不传按APP内设置来决定是否保存
    url?: string; // 点击推送时，跳转的URL
    action?: 'none'; // 传"none"时，点击推送不会弹窗
    id?: string; // 作为请求参数里的id作为唯一标识，这个id后续修改撤回功能会用到
    delete?: '1'; // 传"1"配合id参数可以撤回推送
    iv?: string; // 加密推送的 iv，API v2 使用, API v1 放在 Form Data 中
}

/**
 * API v2 消息体（body字段可选）
 */
export interface MessagePayloadv2 extends Omit<MessagePayload, 'body'> {
    body?: string; // 推送内容（加密时可选）
}

/**
 * 推送参数接口（前端传入的数据）
 * 继承 MessagePayload 只添加特殊字段, 避免重复定义
 */
export interface PushParams extends Omit<MessagePayload, 'body' | 'id'> {
    useAPIv2?: boolean; // 是否使用 API v2
    devices?: Device[]; // 完整的设备信息
    apiURL: string; // API URL地址
    message: string; // *必填* 对应 MessagePayload 中的 body
    uuid?: string; // 作为请求参数里的 id 作为唯一标识, 这个 id 后续修改撤回功能会用到 对应 MessagePayload 中的 id
    authorization?: {
        type: 'basic';
        user: string;
        pwd: string;
        value: string; // Basic <凭证>
    };
}

/**
 * 加密配置接口
 */
export interface EncryptionConfig {
    key: string;
}

/**
 * 加密推送参数接口
 */
export interface EncryptedPushParams extends PushParams {
    encryptionConfig: EncryptionConfig;
}

/**
 * 生成 ID
 * 时间戳转成 base62 并拼接随机大小写的 UUID 加强唯一性
 */
export function generateID(): string {
    function toBase62(num: number): string {
        const chars = 'ij369BARKSENder0124578abcfghklmnopqstuvwxyzCDFGHIJLMOPQTUVWXYZ';
        let result = '';
        if (num === 0) return 'i';
        while (num > 0) {
            result = chars[num % 62] + result;
            num = Math.floor(num / 62);
        }
        return result;
    }

    const timestamp = Date.now(); // 将时间戳转成 base62
    const base62Timestamp = toBase62(timestamp);

    // 生成 UUID
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    // 转十六进制并随机大小写
    const uuid = Array.from(bytes)
        .map(b => {
            const hex = b.toString(16).padStart(2, '0');
            return hex
                .split('')
                .map(c => /[a-f]/.test(c) ? (Math.random() < 0.5 ? c.toUpperCase() : c) : c)
                .join('');
        })
        .join('');

    return `${base62Timestamp}${uuid}`;
}


/**
 * 生成指定长度 ASCII 字符串
 */
function generateAsciiString(len: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => charset[b % charset.length]).join('');
}

/**
 * 根据算法获取 KEY 长度
 */
function getKeyLength(algorithm: EncryptionAlgorithm): number {
    switch (algorithm) {
        case 'AES128':
            return 16;
        case 'AES192':
            return 24;
        case 'AES256':
            return 32;
        default:
            return 32;
    }
}

/**
 * 生成 KEY
 */
export function generateKey(algorithm: EncryptionAlgorithm): string {
    const keyLength = getKeyLength(algorithm);
    return generateAsciiString(keyLength);
}

/**
 * 生成 16 位随机 IV
 */
export function generateIV(): string {
    return generateAsciiString(16);
}

/**
 * 字符串转 UTF8 字节数组
 */
function toUtf8Bytes(str: string): Uint8Array {
    return new TextEncoder().encode(str);
}

/**
 * ArrayBuffer 转 Base64 字符串
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const binary = String.fromCharCode(...new Uint8Array(buffer));
    return btoa(binary);
}

/**
 * AES-CBC 加密
 */
export async function encryptAESCBC(plaintext: string, keyStr: string, ivStr: string): Promise<string> {
    const keyBytes = toUtf8Bytes(keyStr);
    const iv = toUtf8Bytes(ivStr);
    const data = toUtf8Bytes(plaintext);

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        new Uint8Array(keyBytes),
        { name: 'AES-CBC' },
        false,
        ['encrypt']
    );

    const encryptedBuffer = await crypto.subtle.encrypt(
        {
            name: 'AES-CBC',
            iv: new Uint8Array(iv)
        },
        cryptoKey,
        new Uint8Array(data)
    );

    return arrayBufferToBase64(encryptedBuffer);
}

/**
 * 发送明文推送消息 (API v1)
 */
export async function sendPlainPush(msgPayload: MessagePayload, apiURL: string, authorization?: PushParams['authorization']): Promise<PushResponse> {
    const { body, title, ...queryParams } = msgPayload; // 剔除 路径参数 外的 body 和 title

    const baseUrl = `${apiURL}${title ?
        encodeURIComponent(title) + '/' : ''}${encodeURIComponent(body)}`;

    // 滤掉值为undefined的键值对
    const validParams = Object.entries(queryParams).reduce((acc, [key, value]) => {
        if (value !== undefined) {
            if (Array.isArray(value)) {
                acc[key] = value.join(','); // 数组转为逗号分隔的字符串
            } else {
                acc[key] = String(value); // 其他类型转为字符串
            }
        }
        return acc;
    }, {} as Record<string, string>);

    const searchParams = new URLSearchParams(validParams);
    const requestUrl = `${baseUrl}?${searchParams.toString()}`;

    console.debug('发送明文请求到:', requestUrl);

    const headers: Record<string, string> = {};
    if (authorization && authorization.value) {
        headers['Authorization'] = authorization.value;
    }

    const response = await fetch(requestUrl, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
        ...(Object.keys(headers).length > 0 && { headers })
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result: PushResponse = await response.json();
    console.debug('明文请求成功:', result);

    return result;
}

/**
 * 发送加密推送消息 (API v1)
 */
export async function sendEncryptedPush(msgPayload: MessagePayload, apiURL: string, authorization?: PushParams['authorization'], encryptionConfig?: EncryptionConfig): Promise<PushResponse> {
    if (!encryptionConfig?.key) {
        throw new Error('加密配置缺失');
    }

    const iv = generateIV();
    const plaintext = JSON.stringify(msgPayload);

    const ciphertext = await encryptAESCBC(plaintext, encryptionConfig.key, iv);

    console.debug('发送加密请求到:', apiURL);
    console.debug('UUID:', msgPayload.id);
    console.debug('IV:', iv);
    console.debug('Plaintext:', plaintext);
    console.debug('Ciphertext:', ciphertext);

    const formData = new URLSearchParams();
    formData.append('iv', iv);
    formData.append('ciphertext', ciphertext);
    formData.append('id', msgPayload.id || ''); // 不确定撤回是不是在这里读取的id, 也有可能在ciphertext中, 待以后验证

    const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded' // 表单数据 API v1 的(加密时)请求头, v2使用的是 application/json, bark-server 区别 API v1 和 v2 是根据 application/json
    };
    if (authorization && authorization.value) {
        headers['Authorization'] = authorization.value;
    }

    // 发送加密请求
    const response = await fetch(apiURL, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-cache',
        headers,
        body: formData.toString()
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result: PushResponse = await response.json();
    console.debug('加密请求成功:', result);

    return result;
}

/**
 * 发送 API v2 推送消息
 */
export async function sendAPIv2Push(msgPayload: MessagePayloadv2, apiURL: string, authorization?: PushParams['authorization'], encryptionConfig?: EncryptionConfig, devices?: Device[]): Promise<PushResponse> {
    // 获取服务器地址的 origin 部分
    const url = new URL(apiURL);
    const defaultEndpoint = `${url.origin}/push`;

    if (!devices || devices.length === 0) {
        const { device_keys, ...cleanPayload } = msgPayload as any;
        return sendGroupAPIv2Push(cleanPayload, defaultEndpoint, authorization, encryptionConfig);
    }

    // 按服务器分组设备
    const deviceGroups = groupDevicesByServer(devices);
    console.debug('设备分组:', deviceGroups);

    // 存储所有请求的结果
    const results: PushResponse[] = [];

    // 对每个服务器分组进行批量请求
    const requests = Object.entries(deviceGroups).map(async ([server, groupDevices]) => {
        // 获取该组中的设备密钥（过滤掉可能的undefined值）
        const deviceKeys = groupDevices
            .map(device => device.deviceKey)
            .filter((key): key is string => key !== undefined);

        // 获取该组的授权信息（使用第一个设备的授权信息）
        const groupAuth = groupDevices[0].authorization || authorization;

        // 创建该组的请求负载（移除devices字段和原有的device_key、device_keys）
        const { devices: _, device_key, device_keys, ...payloadWithoutDevices } = msgPayload as any;
        const groupPayload = {
            ...payloadWithoutDevices,
            // 对于API v2，如果是多个设备，只使用device_keys；如果是单个设备，使用device_key
            ...(deviceKeys.length > 1
                ? { device_keys: deviceKeys }
                : { device_key: deviceKeys[0] }
            )
        };

        try {
            // 发送批量请求
            const endpoint = `${server}/push`;
            const result = await sendGroupAPIv2Push(groupPayload, endpoint, groupAuth, encryptionConfig);
            results.push(result);
            return result;
        } catch (error) {
            console.error(`服务器 ${server} 批量推送失败:`, error);
            throw error;
        }
    });

    // 等待所有请求完成
    await Promise.all(requests);

    // 合并结果
    const mergedResult: PushResponse = {
        code: results.every(r => r.code === 200) ? 200 : 400,
        message: results.map(r => r.message).join('; '),
        timestamp: Date.now()
    };

    return mergedResult;
}

/**
 * 按服务器分组设备
 */
function groupDevicesByServer(devices: Device[]): Record<string, Device[]> {
    return devices.reduce((groups, device) => {
        if (!device.server) {
            return groups;
        }

        const server = device.server;
        if (!groups[server]) {
            groups[server] = [];
        }

        groups[server].push(device);
        return groups;
    }, {} as Record<string, Device[]>);
}

/**
 * 发送分组 API v2 推送消息
 */
async function sendGroupAPIv2Push(msgPayload: MessagePayloadv2, endpoint: string, authorization?: PushParams['authorization'], encryptionConfig?: EncryptionConfig): Promise<PushResponse> {
    // 准备请求头
    const headers: Record<string, string> = {
        'Content-Type': 'application/json; charset=utf-8'
    };

    if (authorization && authorization.value) {
        headers['Authorization'] = authorization.value;
    }

    let payload = { ...msgPayload };

    // 如果是加密模式，处理加密
    if (encryptionConfig?.key) {
        const iv = generateIV();
        const plaintext = JSON.stringify({
            body: payload.body,
            title: payload.title,
            ...Object.entries(payload)
                .filter(([key]) => !['body', 'title'].includes(key))
                .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})
        });

        const ciphertext = await encryptAESCBC(plaintext, encryptionConfig.key, iv);

        // 加密模式下，移除 body，title subtitle useAPIv2 字段，使用 ciphertext 和 iv
        const { body, title, subtitle, ...payloadWithoutBody } = payload;
        payload = {
            ...payloadWithoutBody,
            ciphertext,
            iv
        };

        console.debug('API v2 加密请求:', {
            endpoint,
            iv,
            plaintext,
            ciphertext
        });
    } else {
        console.debug('API v2 明文请求:', {
            endpoint,
            payload
        });
    }

    // 发送请求
    const response = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-cache',
        headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result: PushResponse = await response.json();
    console.debug('API v2 请求成功:', result);

    return result;
}

/**
 * 统一的推送服务 - 根据配置自动选择明文或加密方式
 */
export async function sendPush(params: PushParams, encryptionConfig?: EncryptionConfig, apiVersion: 'v1' | 'v2' = 'v1'): Promise<PushResponse> {
    // 构建消息体 - 将PushParams转换为MessagePayload
    const msgPayload: MessagePayload = {
        // 特殊字段映射
        body: params.message,
        id: params.uuid || generateID(),

        // 复制其他所有字段 (除去前端内部使用的 apiURL, authorization, devices 等)
        ...Object.entries(params)
            .filter(([key, value]) => {
                // 排除内部使用的字段
                if (['apiURL', 'message', 'uuid', 'authorization', 'useAPIv2', 'devices'].includes(key)) {
                    return false;
                }
                // 排除默认音量 (5)
                if (key === 'volume' && (value === 5 || value === '5')) {
                    return false;
                }
                return true;
            })
            .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})
    };
    // 判断是否是 API v2 模式
    if (apiVersion === 'v2') {
        // 使用 API v2 方式
        return sendAPIv2Push(msgPayload as unknown as MessagePayloadv2, params.apiURL, params.authorization, encryptionConfig, params.devices);
    } else if (encryptionConfig?.key) {
        // 使用加密方式
        return sendEncryptedPush(msgPayload, params.apiURL, params.authorization, encryptionConfig);
    } else {
        // 使用明文方式
        return sendPlainPush(msgPayload, params.apiURL, params.authorization);
    }
}

/**
 * 获取请求参数列表（用于历史记录）
 */
export function getRequestParameters(params: PushParams, isEncrypted: boolean): Array<{ key: string; value: string }> {
    // 构建基本参数对象
    const paramMap: Record<string, string | undefined> = {
        message: params.message,
        autoCopy: params.autoCopy || '1',
        copy: params.copy || params.message,
        id: params.uuid || '',
        sound: params.sound || '',
        title: params.title,
        url: params.url,
        subtitle: params.subtitle,
        device_key: params.device_key,
        device_keys: params.device_keys?.join(','),
        level: params.level,
        volume: params.volume?.toString(),
        badge: params.badge?.toString(),
        call: params.call,
        icon: params.icon,
        image: params.image,
        group: params.group,
        isArchive: params.isArchive,
        action: params.action,
        delete: params.delete
    };

    // 过滤有效参数并转换为数组格式
    const filteredParams = Object.entries(paramMap)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => ({ key, value: value as string }));

    // 如果是加密模式，添加加密相关参数，但保留所有原始参数
    if (isEncrypted) {
        return [
            { key: 'iv', value: '***' },
            { key: 'ciphertext', value: '***' },
            ...filteredParams // 保留所有参数，不再过滤
        ];
    }

    return filteredParams;
}