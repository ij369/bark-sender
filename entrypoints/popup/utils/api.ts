import { PushResponse, Device } from '../types';
import { getAppSettings } from './settings';
import { recordPushHistory } from './database';
import { sendPush, getRequestParameters, generateID, PushParams, EncryptionConfig } from '../../shared/push-service';
import { resolveSimplifiedProcessing } from '../../shared/simplified-processing';

/**
 * 发送推送消息 - 通过background script
 * @param device 设备信息 (包含 apiURL, alias, authorization)
 * @param message 消息内容
 * @param sound 铃声
 * @param uuid 唯一标识符
 * @param title 标题
 * @param url 链接
 * @param advancedParams 自定义参数
 * @param devices 设备列表
 * @param icon 图标URL
 * @param markdownEnabled 是否启用markdown
 * @param urlDialogSend 无法注入脚本时 UrlDialog 弹窗发起的推送
 */
export async function sendPushMessage(
    device: Device,
    message: string,
    sound?: string,
    uuid?: string,
    title?: string,
    url?: string,
    advancedParams?: Record<string, any>,
    devices?: Device[],
    icon?: string,
    markdownEnabled?: boolean,
    urlDialogSend?: boolean
): Promise<PushResponse> {
    let response: PushResponse;
    let method: 'GET' | 'POST' = 'GET';
    let isEncrypted = false;
    let parameters: any[] = [];

    try {
        // 检查是否启用加密
        const settings = await getAppSettings();

        // 使用传入的UUID或生成新的
        const pushUuid = uuid || generateID();

        // 处理自定义参数
        let processedAdvancedParams: Record<string, any> | undefined;
        if (advancedParams) {
            // 过滤掉值为空字符串或null的属性
            processedAdvancedParams = Object.fromEntries(
                Object.entries(advancedParams).filter(([_, value]) =>
                    value !== "" && value !== null && value !== undefined
                )
            );
        }

        // 消息内容设置为 markdown 的内容
        if (settings.enableApiV2 && markdownEnabled) {
            processedAdvancedParams = {
                ...processedAdvancedParams,
                markdown: message
            };
        }

        // 确定最终使用的图标：优先级 传入的icon > 自定义头像
        let finalIcon: string | undefined;
        if (icon) {
            finalIcon = icon; // 优先使用传入的favicon
        } else if (settings.enableCustomAvatar && settings.barkAvatarUrl) {
            finalIcon = settings.barkAvatarUrl; // 回退到自定义头像
        }

        const pushParams: PushParams = {
            apiURL: device.apiURL,
            message,
            devices: devices ? devices : [device], // 设备信息, 可能有多个设备 (用于API v2)
            device_key: device.deviceKey, // 添加device_key (用于 indexedDB 记录)
            device_keys: devices?.map(d => d.deviceKey).filter(Boolean) as string[], // 添加device_keys (用于 indexedDB 记录)
            sound: sound || settings.sound,
            uuid: pushUuid,
            // 优先使用自定义参数中的 title, url
            title: processedAdvancedParams?.title || title,
            url: processedAdvancedParams?.url || url,
            ...(device.authorization && { authorization: device.authorization }), // 认证信息 (可选)
            ...(finalIcon && { icon: finalIcon }), // 图标 (可选)
            // 添加其他自定义参数，但排除已经处理过的 title, url
            ...(processedAdvancedParams && Object.fromEntries(
                Object.entries(processedAdvancedParams).filter(([key]) =>
                    !['title', 'url'].includes(key)
                )
            ))
        };

        if (urlDialogSend) {
            const { simplifiedActive, resolvedCopy } = resolveSimplifiedProcessing({
                enableSimplifiedProcessing: !!settings.enableSimplifiedProcessing,
                copy: pushParams.copy,
                fallbackCopyContent: message
            });
            if (simplifiedActive) {
                pushParams.message = resolvedCopy;
                pushParams.title = undefined;
                pushParams.url = undefined;
                pushParams.copy = undefined;
            }
        }

        // 根据是否启用加密和API v2选择发送方式
        if (settings.enableEncryption && settings.encryptionConfig?.key) {
            method = 'POST';
            isEncrypted = true;
            // 添加API v2标志
            pushParams.useAPIv2 = settings.enableApiV2;
            response = await sendPushDirectly(pushParams, settings.encryptionConfig);
        } else {
            method = settings.enableApiV2 ? 'POST' : 'GET';
            // 添加API v2标志
            pushParams.useAPIv2 = settings.enableApiV2;
            response = await sendPushDirectly(pushParams);
        }

        // 获取请求参数（用于历史记录）
        parameters = getRequestParameters(pushParams, isEncrypted);

        // 记录推送历史
        await recordPushHistory(
            pushParams.message,
            device.apiURL,
            device.alias,
            response,
            method,
            {
                title: pushParams.title, // 使用最终的 title 值
                sound: sound || settings.sound,
                url: pushParams.url, // 使用最终的 url 值
                isEncrypted,
                uuid: pushUuid,
                parameters,
                authorization: device.authorization // 添加authorization到历史记录
            }
        );

        return response;
    } catch (error) {
        console.error('发送推送失败:', error);

        // 记录失败的推送历史
        if (device) {
            const errorResponse = {
                code: -1,
                // message: error instanceof Error ? error.message : '未知错误',
                message: error instanceof Error ? error.message : 'common.error_unknown',
                timestamp: Date.now()
            };

            // 记录推送历史（即使失败）
            try {
                await recordPushHistory(
                    message,
                    device.apiURL,
                    device.alias,
                    errorResponse,
                    method,
                    {
                        title,
                        sound,
                        url,
                        isEncrypted,
                        uuid: uuid || generateID(),
                        parameters: [],
                        authorization: device.authorization // 添加authorization到历史记录
                    }
                );
            } catch (recordError) {
                console.error('记录失败历史时出错:', recordError);
            }
        }

        throw error;
    }
}

/**
 * 直接发送推送（优先直接请求，失败时回退到background script）
 */
async function sendPushDirectly(params: PushParams, encryptionConfig?: EncryptionConfig): Promise<PushResponse> {
    try {
        // 尝试直接发送
        const apiVersion = params.useAPIv2 ? 'v2' : 'v1';
        return await sendPush(params, encryptionConfig, apiVersion);
    } catch (error) {
        console.error('直接请求失败，尝试通过background script:', error);

        // 如果直接请求失败，通过background script发送
        try {
            const action = encryptionConfig ? 'sendEncryptedPush' : 'sendPush';
            const message: any = {
                action,
                apiURL: params.apiURL,
                message: params.message,
                sound: params.sound,
                url: params.url,
                title: params.title,
                uuid: params.uuid, // 传递UUID给background script
                useAPIv2: params.useAPIv2, // 传递API版本标志
                devices: params.devices // 传递设备列表
            };

            if (encryptionConfig) {
                message.encryptionConfig = encryptionConfig;
            }

            if (params.authorization) {
                message.authorization = params.authorization;
            }

            const response = await sendMessageToBackground(message);

            if (response.success) {
                return response.data;
            } else {
                // throw new Error(response.error || '未知错误');
                throw new Error(response.error || 'common.error_unknown');
            }
        } catch (bgError) {
            console.error('Background script请求也失败:', bgError);
            // throw new Error('网络请求失败，请检查网络连接和API地址');
            throw new Error('utils.api.network_failed');
        }
    }
}

// 向background script发送消息
async function sendMessageToBackground(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
        // 检查是否有chrome runtime
        const runtime = (window as any).chrome?.runtime || (window as any).browser?.runtime;

        if (!runtime) {
            // reject(new Error('扩展运行时不可用'));
            reject(new Error('utils.api.runtime_unavailable'));
            return;
        }

        runtime.sendMessage(message, (response: any) => {
            if (runtime.lastError) {
                reject(new Error(runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

// 格式化API URL
export function formatApiURL(url: string): string {
    let formattedUrl = url.trim();

    // 如果没有协议，添加https://
    if (!/^https?:\/\//.test(formattedUrl)) {
        formattedUrl = `https://${formattedUrl}`;
    }

    // 如果末尾没有斜杠，添加斜杠
    if (!formattedUrl.endsWith('/')) {
        formattedUrl += '/';
    }

    return formattedUrl;
}

// 验证API URL格式
export function validateApiURL(url: string): boolean {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return false;

    const apiUrlPattern = /^(https?:\/\/)?([a-zA-Z0-9.-]+(\.[a-zA-Z]{2,})?|localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?\/[a-zA-Z0-9_-]+\/?.*$/;

    // 检查基本格式
    if (!apiUrlPattern.test(trimmedUrl)) {
        return false;
    }

    // 检查是否包含双斜杠 (除了协议后的双斜杠)
    const withoutProtocol = trimmedUrl.replace(/^https?:\/\//, '');
    if (withoutProtocol.includes('//')) {
        return false;
    }

    return true;
}