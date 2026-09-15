import { initBackgroundI18n, watchLanguageChanges, getMessage } from './background/i18n-helper';
import { sendPush, getRequestParameters, generateID, PushParams, EncryptionConfig } from './shared/push-service';
import { resolveSimplifiedProcessing } from './shared/simplified-processing';
import { Device } from './popup/types';
import { DEFAULT_ADVANCED_PARAMS } from './popup/utils/settings';
import { fileCacheManager, dbManager } from './popup/utils/database';
import { showSYSNotification } from './popup/utils/notification';

export default defineBackground(() => {
  const getStorageData = (...keys: string[]) =>
    browser.storage.local.get(keys) as Promise<Record<string, any>>;

  // 获取当前活动标签页的地址 (供 popup/侧边栏 的 "发送此页面链接" 使用)
  // 命名区分于其他取网页的逻辑; 只放行 http(s)
  async function getActiveWebPageInPopupOrSidepanel(): Promise<{ url: string; title?: string } | null> {
    try {
      const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs?.[0];
      if (tab?.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        return { url: tab.url, title: tab.title || undefined };
      }
    } catch (error) {
      console.debug('查询活动标签页失败:', error);
    }

    return null;
  }

  // 初始化 i18n
  initBackgroundI18n();
  watchLanguageChanges();

  // Safari 启动时预热 native messaging 连接
  if (typeof navigator !== 'undefined') {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
      setTimeout(() => {
        // 发送 ping 预热连接
        browser.runtime.sendNativeMessage('com.uuphy.bark-sender', {
          action: 'ping'
        }, (response) => {
          if (browser.runtime.lastError) {
            console.log('[NativeMessaging] Warmup failed:', browser.runtime.lastError.message);
          } else {
            console.log('[NativeMessaging] Connection warmed up');
          }
        });
      }, 1000);
    }
  }

  // 检查自定义参数差异，只返回与默认配置不同的参数
  function getCustomParametersDifference(settings: any): Record<string, any> {
    const customParams: Record<string, any> = {};

    // 如果未启用自定义参数，返回空对象
    if (!settings.enableAdvancedParams) {
      return customParams;
    }

    try {
      // 解析用户自定义的参数配置
      const userParams = settings.advancedParamsJson ?
        JSON.parse(settings.advancedParamsJson) : {};

      // 对比每个参数，只保留与默认值不同的参数
      Object.keys(DEFAULT_ADVANCED_PARAMS).forEach(key => {
        const defaultValue = DEFAULT_ADVANCED_PARAMS[key as keyof typeof DEFAULT_ADVANCED_PARAMS];
        const userValue = userParams[key];

        // 如果用户设置的值与默认值不同且不为空 则添加到自定义参数中
        if (userValue !== undefined && userValue !== defaultValue && userValue !== '') {
          customParams[key] = userValue;
        }
      });

      console.debug('自定义参数差异:', customParams);
      return customParams;
    } catch (error) {
      console.error('解析自定义参数失败:', error);
      return customParams;
    }
  }

  // 过滤与解析内容冲突的自定义参数
  function filterConflictingParams(
    customParams: Record<string, any>,
    parsedContent: {
      title?: string;
      url?: string;
      copyContent?: string;
      autoCopy?: string;
      level?: string;
      contentType?: string;
    }
  ): Record<string, any> {
    const filtered = { ...customParams };

    // 定义冲突检查规则
    const conflictRules = [
      { condition: () => !!parsedContent.title, removeKeys: ['title'] },
      { condition: () => !!parsedContent.url, removeKeys: ['url'] },
      { condition: () => !!parsedContent.copyContent, removeKeys: ['copy'] },
      { condition: () => !!parsedContent.autoCopy, removeKeys: ['autoCopy'] },
      { condition: () => !!parsedContent.level, removeKeys: ['level'] },
      { condition: () => parsedContent.contentType === 'image', removeKeys: ['image'] }
    ];

    // 应用冲突规则，移除冲突的自定义参数
    conflictRules.forEach(rule => {
      if (rule.condition()) {
        rule.removeKeys.forEach(key => delete filtered[key]);
      }
    });

    // console.debug('过滤后的自定义参数:', filtered);
    return filtered;
  }

  // 预请求 favicon
  async function prefetchFavicon(url: string): Promise<string | null> {
    try {
      // 获取应用设置
      const settingsResult = await getStorageData('bark_app_settings');
      const settings = settingsResult.bark_app_settings || {};

      // 检查是否启用 favicon
      if (!settings.enableFaviconIcon) {
        throw new Error('Favicon 功能已关闭');
      }

      const domain = new URL(url).hostname;

      // 构建 favicon URL，使用 API 模板
      const faviconApiTemplate = settings.faviconApiUrl;
      const faviconUrl = faviconApiTemplate.replace('$domain$', domain);

      // 发送 HEAD 判断 Favicon 是否存在
      const response = await fetch(faviconUrl, {
        method: 'HEAD',
        cache: 'force-cache'
      });

      if (response.ok) {
        // 如果 HEAD 请求成功，再发送 GET 请求预加载 Favicon
        const getResponse = await fetch(faviconUrl, {
          cache: 'force-cache'
        });

        if (getResponse.ok) {
          const contentType = getResponse.headers.get('content-type');
          // 检查是否为有效的图片类型
          if (contentType && (
            contentType.startsWith('image/') ||
            contentType === 'application/octet-stream'
          )) {
            console.debug(`Favicon 预加载 for ${domain}: ${faviconUrl}`);
            return faviconUrl;
          }
        }
      }

      console.debug(`Favicon 不可用 for ${domain}`);
      return null;
    } catch (error) {
      console.debug(`预加载 Favicon 失败 ${url}:`, error);
      return null;
    }
  }

  // 初始化扩展栏图标点击行为
  async function initActionClickBehavior() {
    if (!browser.sidePanel) return;
    try {
      const settingsResult = await getStorageData('bark_app_settings');
      const settings = settingsResult.bark_app_settings || {};
      const behavior = settings.actionClickBehavior || 'popup';
      await (browser.sidePanel as any).setPanelBehavior({
        openPanelOnActionClick: behavior === 'sidepanel'
      });
      console.debug('扩展栏图标点击行为已设置为:', behavior);
    } catch (error) {
      console.debug('设置扩展栏图标点击行为失败:', error);
    }
  }
  initActionClickBehavior();

  // 监听来自popup的消息
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 处理更新扩展栏图标点击行为
    if (message.action === 'updateActionClickBehavior') {
      if (browser.sidePanel) {
        const openPanelOnActionClick = message.behavior === 'sidepanel';
        (browser.sidePanel as any).setPanelBehavior({ openPanelOnActionClick })
          .then(() => {
            console.debug('扩展栏图标点击行为已更新为:', message.behavior);
            sendResponse({ success: true });
          })
          .catch((error: any) => {
            console.error('更新扩展栏图标点击行为失败:', error);
            sendResponse({ success: false, error: error.message });
          });
      } else {
        sendResponse({ success: false, error: 'sidePanel API 不可用' });
      }
      return true;
    }

    if (message.action === 'getActiveWebPageInPopupOrSidepanel') {
      getActiveWebPageInPopupOrSidepanel()
        .then(page => {
          sendResponse({ success: true, page });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }

    if (message.action === 'prefetchFavicon') {
      prefetchFavicon(message.url)
        .then(faviconUrl => {
          sendResponse({ success: true, faviconUrl });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }

    if (message.action === 'sendPush') {
      handleSendPush(message.apiURL, message.message, message.sound, message.url, message.title, message.uuid, message.authorization, message.useAPIv2, message.devices, message.icon)
        .then(result => {
          sendResponse({ success: true, data: result });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      return true; // 保持消息通道开放
    }

    if (message.action === 'sendEncryptedPush') {
      handleSendEncryptedPush(message.apiURL, message.message, message.encryptionConfig, message.sound, message.url, message.title, message.uuid, message.authorization, message.useAPIv2, message.devices, message.icon)
        .then(result => {
          sendResponse({ success: true, data: result });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      return true; // 保持消息通道开放
    }

    if (message.action === 'readClipboard') {
      // 处理剪切板读取
      handleClipboard()
        .then(result => {
          sendResponse(result);
        })
        .catch(error => {
          sendResponse('');
        });
      return true;
    }

    // 处理来自 popup 的 Safari native messaging
    if (message.action === 'readClipboardFromNative') {
      handleNativeClipboardRead()
        .then(result => {
          sendResponse(result);
        })
        .catch(error => {
          sendResponse({ success: false, data: error.message, type: 'error' });
        });
      return true;
    }


    // 处理来自 content script 的发送内容请求
    if (message.action === 'send_content') {

      // 获取默认设备和设置
      Promise.all([
        getStorageData('bark_devices'),
        getStorageData('bark_default_device'),
        getStorageData('bark_app_settings')
      ]).then(([devicesResult, defaultDeviceResult, settingsResult]) => {
        const devices = devicesResult.bark_devices || [];
        const defaultDeviceId = defaultDeviceResult.bark_default_device || '';
        const defaultDevice = devices.find((device: any) => device.id === defaultDeviceId) || devices[0];
        const settings = settingsResult.bark_app_settings || { enableEncryption: false };
        const enableSimplifiedProcessing = !!settings?.enableSimplifiedProcessing;

        // console.debug('获取到的设置:', settings);
        // console.debug('文件缓存设置:', settings.enableFileCache);

        if (!defaultDevice) {
          console.error(getMessage('device_not_found'));
          // 未找到默认设备
          showSYSNotification(getMessage('bark_sender_title'), getMessage('device_not_found'), true);
          sendResponse({ success: false, error: getMessage('device_not_found') });
          return;
        }

        // 准备发送参数
        let title = message.title || '';
        let content = message.content?.trim() || '';
        let url = undefined;
        let copyContent = undefined;
        let level = undefined;
        let autoCopy = undefined;
        let notBody = false;
        // 根据内容类型设置 URL 和标题
        switch (message.contentType) {
          case 'text':
            content = content;
            autoCopy = '1';
            /* note:
               Bark App 在 1.5.3 的时候修复了推送内容过长无法正常复制的问题
               bark servet 还是会限制请求体 4kB
               常见 3Byte 一个汉字，不常见 4Byte 一个汉字
               加上其他自符标点符号通常文本分段大小为 1500 个字符 (TEXT_CHUNK_SIZE = 1500)
               所以用 autoCopy = '1' 配合 copyContent 可以不写来节省请求体大小

               从 8bc5e41 (受影响版本 1.3.0 - 1.4.1) 开始 copyContent = copyContent.slice(0, 1500); 被改漏了
               都会出现长度在 1500 以内的内容不管多少都会截掉 128 - 1500 之间的内容
            */
            break;
          case 'text-large':
            // 对于 text-large 类型，保持完整的 copyContent，但显示提示信息
            copyContent = message.content?.trim() || undefined;
            content = message.isLastChunk ?
              getMessage('push.large_content.last_chunk') : // 最后一段显示完整内容
              getMessage('push.large_content.not_last_chunk'); // 其他段显示提示信息
            level = message.isLastChunk ? undefined : 'passive'; // 最后一段显示提醒出来
            break;
          case 'image': // 策略: 点击推送能打开 Safari，下拉复制的是图片的网址，能显示推送图片，不用加密，也不用传递 body 来减少请求体大小
            url = message.content;
            autoCopy = '1';
            copyContent = undefined;// 避免太长，用autoCopy =1 代替
            content = undefined; // 由于image直接用url参数，且body意义不大, 减少请求体大小
            notBody = true;
            break;
          case 'url': // 策略: 点击推送能打开 Safari，下来复制的是url，不用加密，也不用传递 body 来减少请求体大小
            url = message.content;
            autoCopy = '1';
            copyContent = undefined;// 避免太长，用autoCopy =1 代替
            content = undefined; // 由于url直接用url参数，且body意义不大, 减少请求体大小
            notBody = true;
            break;
          default:
            break;
        }

        // 发送推送
        const pushUuid = generateID();
        // 确定最终使用的图标
        let finalIcon: string | undefined;

        // 1. 如果启用了 favicon 且传来了 icon，使用 favicon
        if (settings.enableFaviconIcon && message.icon) {
          finalIcon = message.icon;
        }
        // 2. 如果没有 favicon 但启用了自定义头像，使用自定义头像
        else if (settings.enableCustomAvatar && settings.barkAvatarUrl) {
          finalIcon = settings.barkAvatarUrl;
        }

        // 获取自定义参数差异，并过滤掉与解析内容冲突的参数
        const customParams = getCustomParametersDifference(settings);
        const filteredCustomParams = filterConflictingParams(customParams, {
          title,
          url,
          copyContent,
          autoCopy,
          level,
          contentType: message.contentType
        });

        const pushParams: PushParams = {
          apiURL: defaultDevice.apiURL,
          message: notBody ? undefined : content, // 图片类型和url类型不传 message
          sound: settings.sound,
          image: message.contentType === 'image' ? message.content : undefined,
          url: url || undefined,
          title: title || undefined,
          uuid: pushUuid,
          copy: copyContent || undefined,
          useAPIv2: settings.enableApiV2,
          devices: [defaultDevice],
          ...(defaultDevice.authorization && { authorization: defaultDevice.authorization }),
          ...(level && { level }),
          ...(finalIcon && { icon: finalIcon }),
          ...(autoCopy && { autoCopy }),
          ...filteredCustomParams // 添加过滤后的自定义参数差异
        };

        const { simplifiedActive, resolvedCopy } = resolveSimplifiedProcessing({
          enableSimplifiedProcessing,
          copy: pushParams.copy,
          fallbackCopyContent: message.copyContent
        });

        pushParams.message = simplifiedActive ? resolvedCopy : pushParams.message;
        pushParams.title = simplifiedActive ? undefined : pushParams.title;
        pushParams.url = simplifiedActive ? undefined : pushParams.url;
        pushParams.copy = simplifiedActive ? undefined : pushParams.copy;

        content = simplifiedActive ? resolvedCopy : content;
        title = simplifiedActive ? '' : title;
        url = simplifiedActive ? undefined : url;

        // 根据设置选择是否加密, 避免 414 Request-URI Too Large 错误, 使用 POST 请求（API v2 使用POST, 默认 4Kb)
        let isEncrypted = false;

        // 如果是image类型，不加密
        const sendPushPromise = settings.enableEncryption && settings.encryptionConfig?.key && !notBody
          ? (isEncrypted = true, sendPush(pushParams, settings.encryptionConfig, 'v2'))
          : sendPush(pushParams, undefined, 'v2');

        sendPushPromise
          .then(response => {
            console.log('发送成功:', response);

            // 记录历史
            const requestTimestamp = Date.now();
            const parameters = getRequestParameters(pushParams, isEncrypted);
            parameters.push({ key: 'device_key', value: defaultDevice.deviceKey || '' });
            parameters.push({ key: 'device_keys', value: [defaultDevice.deviceKey].filter(Boolean).join(',') || '' });

            const historyRecord = {
              id: Date.now(),
              uuid: pushUuid,
              timestamp: requestTimestamp,
              body: content,
              apiUrl: defaultDevice.apiURL,
              deviceName: defaultDevice.alias,
              parameters: parameters,
              responseJson: response,
              requestTimestamp: requestTimestamp,
              responseTimestamp: Date.now(),
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              method: 'POST',
              title: title || undefined,
              sound: settings.sound || undefined,
              url: url || undefined,
              isEncrypted: notBody ? false : isEncrypted, // 图片类型和url类型不加密
              createdAt: new Date(requestTimestamp).toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              }),
              inspectType: message.contentType, // 记录分析的内容类型
              authorization: defaultDevice.authorization
            };

            saveHistoryRecord(historyRecord);

            // 只在非 text-large 类型或是最后一段时显示通知
            if (message.contentType !== 'text-large' || message.isLastChunk) {
              const title = message.contentType === 'text-large'
                ? getMessage('bark_sender_title') + ' (Large Content)'
                : getMessage('bark_sender_title');
              showSYSNotification(title, getMessage('sent_to_device', [defaultDevice.alias]));
            }

            // 如果是图片类型且启用了文件缓存，通知 content script 缓存图片
            if (message.contentType === 'image' && settings.enableFileCache && message.content) {
              // 发送消息给 content script 请求图片缓存
              // console.debug('发送消息给 content script 请求图片缓存:', message.content, pushUuid);
              if (sender.tab?.id) {
                browser.tabs.sendMessage(sender.tab.id, {
                  action: 'cacheImage',
                  imageUrl: message.content,
                  pushID: pushUuid
                }).catch(error => {
                  console.debug('发送缓存图片消息失败:', error);
                });
              }
            }

            // 返回成功响应给content script
            sendResponse({ success: true, data: response, pushID: pushUuid });
          })
          .catch(error => {
            console.error('发送失败:', error);

            // 记录失败的历史记录
            const requestTimestamp = Date.now();
            const errorResponse = {
              code: -1,
              message: error instanceof Error ? error.message : getMessage('error_unknown'),
              timestamp: Date.now()
            };

            const historyRecord = {
              id: Date.now(),
              uuid: pushUuid,
              timestamp: requestTimestamp,
              body: content,
              apiUrl: defaultDevice.apiURL,
              deviceName: defaultDevice.alias,
              parameters: [],
              responseJson: errorResponse,
              requestTimestamp: requestTimestamp,
              responseTimestamp: Date.now(),
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              method: 'POST',
              title: title || undefined,
              sound: settings.sound || undefined,
              url: url || undefined,
              isEncrypted: notBody ? false : isEncrypted,
              createdAt: new Date(requestTimestamp).toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              }),
              authorization: defaultDevice.authorization
            };

            saveHistoryRecord(historyRecord);

            // 发送失败，请检查网络连接
            showSYSNotification(getMessage('bark_sender_title'), getMessage('send_failed_check_network'), true);

            // 返回错误响应给 content script
            sendResponse({ success: false, data: errorResponse });
          });
      });

      return true; // 保持消息通道开放
    }

    // 处理来自 content script 的图片缓存数据 (有类图片只能网站内请求到, 其他环境 background 反而请求不到)
    if (message.action === 'saveImageCache') {
      // console.debug('收到来自 content script 的图片缓存数据:', message.imageUrl, message.imageData, message.pushID);
      const { imageUrl, imageData, pushID } = message;

      if (!imageUrl || !imageData || !pushID) {
        sendResponse({ success: false, error: '缺少必要参数' });
        return true;
      }

      try {
        // 直接使用传入的 ArrayBuffer（Structured Clone）
        if (!(imageData instanceof ArrayBuffer)) {
          throw new Error('图片数据类型错误，期望 ArrayBuffer');
        }

        // 保存到数据库
        fileCacheManager.saveImage(imageUrl, imageData, pushID)
          .then(record => {
            console.debug('图片缓存保存成功:', record);
            sendResponse({ success: true, record });
          })
          .catch(error => {
            console.error('保存图片缓存失败:', error);
            sendResponse({ success: false, error: error.message });
          });
      } catch (error) {
        console.error('处理图片数据失败:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : '处理图片数据失败' });
      }

      return true;
    }

    // 处理来自 content script 的 base64 图片缓存数据（port 不行的话用该兜底）
    if (message.action === 'saveImageCacheBase64') {
      const { imageUrl, imageData, pushID } = message;

      if (!imageUrl || !imageData || !pushID) {
        sendResponse({ success: false, error: '缺少必要参数' });
        return true;
      }

      try {
        // 将 base64 数据转换为 ArrayBuffer
        if (typeof imageData !== 'string') {
          throw new Error('图片数据类型错误，期望 base64 字符串');
        }

        const base64Data = imageData.split(',')[1]; // 移除 data:image/xxx;base64, 前缀
        if (!base64Data) {
          throw new Error('无效的 base64 数据');
        }

        const binaryString = atob(base64Data);
        const arrayBuffer = new ArrayBuffer(binaryString.length);
        const uint8Array = new Uint8Array(arrayBuffer);

        for (let i = 0; i < binaryString.length; i++) {
          uint8Array[i] = binaryString.charCodeAt(i);
        }

        // 保存到数据库
        fileCacheManager.saveImage(imageUrl, arrayBuffer, pushID)
          .then(record => {
            console.debug('图片缓存保存成功 (base64):', record);
            sendResponse({ success: true, record });
          })
          .catch(error => {
            console.error('保存图片缓存失败 (base64):', error);
            sendResponse({ success: false, error: error.message });
          });
      } catch (error) {
        console.error('处理 base64 图片数据失败:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : '处理图片数据失败' });
      }

      return true;
    }

    // 处理跨域图片获取和缓存（兜底: 一些图片因为跨域但能用 background 请求到）
    if (message.action === 'fetchAndCacheImage') {
      const { imageUrl, pushID } = message;

      if (!imageUrl || !pushID) {
        sendResponse({ success: false, error: '缺少必要参数' });
        return true;
      }

      // 使用 background 脚本获取图片数据
      fetch(imageUrl)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return response.arrayBuffer();
        })
        .then(arrayBuffer => {
          console.debug('Background 获取图片数据成功，大小:', arrayBuffer.byteLength, 'bytes');
          // 保存到数据库
          return fileCacheManager.saveImage(imageUrl, arrayBuffer, pushID);
        })
        .then(record => {
          console.debug('图片缓存保存成功 (background):', record);
          sendResponse({ success: true, record });
        })
        .catch(error => {
          console.error('Background 获取并缓存图片失败:', error);
          sendResponse({ success: false, error: error.message || 'Background 获取图片失败' });
        });

      return true; // 保持消息通道开放
    }
  });

  // 处理 Port 连接
  browser.runtime.onConnect.addListener((port) => {
    if (port.name === 'imageCache') {
      port.onMessage.addListener(async (message) => {
        if (message.action === 'saveImageCache') {
          const { imageUrl, imageData, pushID } = message;

          try {
            if (!imageUrl || !imageData || !pushID) {
              throw new Error('缺少必要参数');
            }

            // 确保 imageData 是 ArrayBuffer
            if (!(imageData instanceof ArrayBuffer)) {
              throw new Error('图片数据类型错误，期望 ArrayBuffer');
            }

            // 保存到数据库
            const record = await fileCacheManager.saveImage(imageUrl, imageData, pushID);
            console.debug('图片缓存保存成功 (Port):', record);

            port.postMessage({ success: true, record });
          } catch (error) {
            console.error('Port 保存图片缓存失败:', error);
            port.postMessage({
              success: false,
              error: error instanceof Error ? error.message : '保存失败'
            });
          }
        }
      });

      port.onDisconnect.addListener(() => {
        console.debug('图片缓存 Port 连接断开');
      });
    }
  });

  // 存储最后一次右键点击的元素信息
  let lastRightClickedElementInfo: any = null;

  // 保存历史记录：优先直接存储到 IndexedDB，暂存作为兜底
  async function saveHistoryRecord(record: any) {
    let directSaveSuccess = false;

    try {
      // 优先尝试直接存储到 IndexedDB
      await dbManager.addRecord(record);
      console.debug(getMessage('save_history_record'), record, '(直接存储)');
      directSaveSuccess = true;
    } catch (directError) {
      console.warn('直接存储历史记录失败，使用暂存兜底:', directError);

      try {
        // 兜底：暂存到 chrome.storage.local
        const result = await getStorageData('bark_history');
        const existingHistory = result.bark_history || [];

        // 添加新记录到数组开头（最新的在前面）
        existingHistory.unshift(record);

        // 限制历史记录数量，比如最多保存1000条
        if (existingHistory.length > 1000) {
          existingHistory.splice(1000);
        }

        await browser.storage.local.set({ bark_history: existingHistory });
        console.debug(getMessage('save_history_record'), record, '(暂存兜底)');
        console.debug(getMessage('current_history_total', [existingHistory.length.toString()]));
      } catch (tempError) {
        console.error(getMessage('save_history_failed'), tempError);
      }
    }
  }

  // 处理剪切板读取
  async function handleClipboard(): Promise<string> {
    try {
      const text = await navigator.clipboard.readText();
      return text || '';
    } catch (error) {
      // console.error('读取剪切板失败:', error);
      console.error(getMessage('read_clipboard_failed'), error);
      return '';
    }
  }

  // 处理 Safari native messaging 剪切板读取
  async function handleNativeClipboardRead(): Promise<{ success: boolean; data: string; type: string }> {
    return new Promise((resolve, reject) => {
      try {
        browser.runtime.sendNativeMessage('com.uuphy.bark-sender', {
          action: 'readClipboard'
        }, (response) => {
          if (browser.runtime.lastError) {
            console.error('Native messaging error:', browser.runtime.lastError);
            reject(new Error('Native messaging Error: ' + browser.runtime.lastError.message));
            return;
          }

          if (response) {
            resolve(response);
          } else {
            reject(new Error('Native app no response'));
          }
        });
      } catch (error) {
        console.error('Send native message failed:', error);
        reject(new Error('Cannot communicate with macOS container'));
      }
    });
  }

  // 监听快捷键命令
  browser.commands.onCommand.addListener(async (command) => {
    // console.debug('收到快捷键命令:', command);
    console.debug(getMessage('shortcut_triggered'), command);
    if (command === 'send-clipboard') {
      await handleClipboardShortcut();
    }
  });

  // 处理剪切板快捷键
  async function handleClipboardShortcut() {
    try {
      // console.debug('收到全局快捷键触发');
      console.debug(getMessage('shortcut_triggered'));

      // 获取默认设备
      const [devicesResult, defaultDeviceResult] = await Promise.all([
        getStorageData('bark_devices'),
        getStorageData('bark_default_device')
      ]);

      const devices = devicesResult.bark_devices || [];
      const defaultDeviceId = defaultDeviceResult.bark_default_device || '';
      const defaultDevice = devices.find((device: any) => device.id === defaultDeviceId) || devices[0];

      if (!defaultDevice) {
        // console.debug('未找到默认设备，但仍打开窗口让用户配置');
        console.debug(getMessage('device_not_found_window'));
        // 仍然打开小窗口，让用户可以添加设备，补充 URL 插叙参数（autoAddDevice=true），自动打开添加设备对话框
        await browser.windows.create({
          url: browser.runtime.getURL('/popup.html?mode=window&autoAddDevice=true'),
          type: 'popup',
          width: 380,
          height: 660,
          left: 0,
          top: 0,
          focused: true
        });
        // 默认设备未找到
        showSYSNotification(getMessage('bark_sender_title'), getMessage('device_not_found'), true);
        return;
      }

      // 直接创建小窗口
      // console.debug('创建小窗口');
      console.debug(getMessage('creating_small_window'));
      await browser.windows.create({
        url: browser.runtime.getURL('/popup.html?mode=window'),
        type: 'popup',
        width: 380,
        height: 660,
        left: 0,
        top: 0,
        focused: true
      });

      // 延迟发送消息，确保窗口已经完全加载
      setTimeout(() => {
        // 向窗口发送快捷键触发消息
        browser.runtime.sendMessage({
          action: 'shortcut-triggered',
          defaultDevice: defaultDevice
        }).catch(error => {
          // console.debug('发送消息到窗口失败:', error);
          console.debug(getMessage('send_message_to_window_failed', [error.toString()]));
          showSYSNotification(getMessage('bark_sender_title'), getMessage('notification_shortcut_with_device', [defaultDevice.alias]), true);
        });
      }, 300); // 给窗口足够时间加载

    } catch (error) {
      // console.error('快捷键处理失败:', error);
      console.error(getMessage('shortcut_processing_failed'), error);
      // 快捷键处理失败
      showSYSNotification(getMessage('bark_sender_title'), getMessage('shortcut_processing_failed'), true);
    }
  }

  // 处理推送请求
  async function handleSendPush(apiURL: string, message: string, sound?: string, url?: string, title?: string, uuid?: string, authorization?: { type: 'basic'; user: string; pwd: string; value: string; }, useAPIv2?: boolean, devices?: Device[], icon?: string) {
    try {
      // 获取应用设置
      const settingsResult = await getStorageData('bark_app_settings');
      const settings = settingsResult.bark_app_settings || { enableEncryption: false };

      // 如果没有传入 devices，则创建一个单设备对象
      const singleDevice = authorization ? {
        id: uuid || generateID(),
        apiURL,
        deviceKey: apiURL.split('/').filter(Boolean).pop() || '',
        server: new URL(apiURL).origin,
        alias: 'Default Device',
        timestamp: Date.now(),
        createdAt: new Date().toISOString(),
        authorization
      } : undefined;

      // 确定最终使用的图标：优先级为 传入的icon > 自定义头像
      let finalIcon: string | undefined;
      if (icon) {
        finalIcon = icon; // 优先使用传入的icon
      } else if (settings.enableCustomAvatar && settings.barkAvatarUrl) {
        finalIcon = settings.barkAvatarUrl; // 回退到自定义头像
      }

      const pushParams: PushParams = {
        apiURL,
        message,
        sound,
        url,
        title,
        uuid,
        useAPIv2,
        devices: devices || (singleDevice ? [singleDevice] : undefined),
        device_key: singleDevice?.deviceKey, // 添加device_key
        device_keys: devices?.map(d => d.deviceKey).filter(Boolean) as string[], // 添加device_keys
        ...(authorization && { authorization }),
        ...(finalIcon && { icon: finalIcon })
      };
      const apiVersion = useAPIv2 ? 'v2' : 'v1';
      const response = await sendPush(pushParams, undefined, apiVersion);
      return response; // 返回PushResponse
    } catch (error) {
      // console.error('Background发送推送失败:', error);
      console.error(getMessage('background_send_push_failed'), error);
      throw error;
    }
  }

  // 处理加密推送请求
  async function handleSendEncryptedPush(apiURL: string, message: string, encryptionConfig: EncryptionConfig, sound?: string, url?: string, title?: string, uuid?: string, authorization?: { type: 'basic'; user: string; pwd: string; value: string; }, useAPIv2?: boolean, devices?: Device[], icon?: string) {
    try {
      // 获取应用设置
      const settingsResult = await getStorageData('bark_app_settings');
      const settings = settingsResult.bark_app_settings || { enableEncryption: false };

      // 如果没有传入 devices，则创建一个单设备对象
      const singleDevice = authorization ? {
        id: uuid || generateID(),
        apiURL,
        deviceKey: apiURL.split('/').filter(Boolean).pop() || '',
        server: new URL(apiURL).origin,
        alias: 'Default Device',
        timestamp: Date.now(),
        createdAt: new Date().toISOString(),
        authorization
      } : undefined;

      // 确定最终使用的图标：优先级为 传入的icon > 自定义头像
      let finalIcon: string | undefined;
      if (icon) {
        finalIcon = icon; // 优先使用传入的icon
      } else if (settings.enableCustomAvatar && settings.barkAvatarUrl) {
        finalIcon = settings.barkAvatarUrl; // 回退到自定义头像
      }

      const pushParams: PushParams = {
        apiURL,
        message,
        sound,
        url,
        title,
        uuid,
        useAPIv2,
        devices: devices || (singleDevice ? [singleDevice] : undefined),
        device_key: singleDevice?.deviceKey, // 添加device_key
        device_keys: devices?.map(d => d.deviceKey).filter(Boolean) as string[], // 添加device_keys
        ...(authorization && { authorization }),
        ...(finalIcon && { icon: finalIcon })
      };
      const apiVersion = useAPIv2 ? 'v2' : 'v1';
      const response = await sendPush(pushParams, encryptionConfig, apiVersion);
      return response; // 返回 PushResponse
    } catch (error) {
      // console.error('Background 发送加密推送失败:', error);
      console.error(getMessage('background_send_encrypted_push_failed'), error);
      throw error;
    }
  }
  // 监听 omnibox 输入完成（回车）
  if (browser.omnibox) {
    browser.omnibox.onInputEntered.addListener(async (text) => {
      if (text.trim()) {
        await handleOmniboxPush(text.trim());
      }
    });

    // 监听 omnibox 输入变化，提供建议
    browser.omnibox.onInputChanged.addListener((text, suggest) => {
      if (text.trim()) {
        browser.omnibox.setDefaultSuggestion({ description: getMessage('omnibox_send_push') });
      }
    });
  }

  // 处理地址栏推送发送
  async function handleOmniboxPush(message: string) {
    try {
      // 获取默认设备和设置
      const [devicesResult, defaultDeviceResult, settingsResult] = await Promise.all([
        getStorageData('bark_devices'),
        getStorageData('bark_default_device'),
        getStorageData('bark_app_settings')
      ]);

      const devices = devicesResult.bark_devices || [];
      const defaultDeviceId = defaultDeviceResult.bark_default_device || '';
      const defaultDevice = devices.find((device: any) => device.id === defaultDeviceId) || devices[0];
      const settings = settingsResult.bark_app_settings || { enableEncryption: false };

      if (!defaultDevice) { // 没有默认设备，则打开 添加设备 窗口
        // 将用户输入的文字保存到 storage，供 popup 使用
        await browser.storage.local.set({ bark_omnibox_message: message });
        // 未找到默认设备
        showSYSNotification(getMessage('bark_sender_title'), getMessage('device_not_found'), true);
        // 打开设置窗口让用户添加设备
        await browser.windows.create({
          url: browser.runtime.getURL('/popup.html?mode=window&autoAddDevice=true'),
          type: 'popup',
          width: 380,
          height: 660,
          left: 0,
          top: 0,
          focused: true
        });
        return;
      }

      // 发送推送
      const pushUuid = generateID();

      // 获取自定义参数差异，并过滤掉与解析内容冲突的参数
      const customParams = getCustomParametersDifference(settings);
      const filteredCustomParams = filterConflictingParams(customParams, {
        // 地址栏只有 body, 不需要过滤
      });

      const pushParams: PushParams = {
        apiURL: defaultDevice.apiURL,
        message: message,
        sound: settings.sound,
        title: undefined,
        uuid: pushUuid,
        useAPIv2: settings.enableApiV2,
        devices: [defaultDevice],
        ...(defaultDevice.authorization && { authorization: defaultDevice.authorization }),
        ...(settings.enableCustomAvatar && settings.barkAvatarUrl && { icon: settings.barkAvatarUrl }),
        ...filteredCustomParams
      };

      let isEncrypted = false;
      let method: 'GET' | 'POST' = 'GET';

      const sendPushPromise = settings.enableEncryption && settings.encryptionConfig?.key
        ? (isEncrypted = true, method = 'POST', sendPush(pushParams, settings.encryptionConfig, 'v2'))
        : (method = settings.enableApiV2 ? 'POST' : 'GET', sendPush(pushParams, undefined, settings.enableApiV2 ? 'v2' : 'v1'));

      const response = await sendPushPromise;

      // 记录历史
      const requestTimestamp = Date.now();
      const parameters = getRequestParameters(pushParams, isEncrypted);
      parameters.push({ key: 'device_key', value: defaultDevice.deviceKey || '' });
      parameters.push({ key: 'device_keys', value: [defaultDevice.deviceKey].filter(Boolean).join(',') || '' });

      const historyRecord = {
        id: Date.now(),
        uuid: pushUuid,
        timestamp: requestTimestamp,
        body: message,
        apiUrl: defaultDevice.apiURL,
        deviceName: defaultDevice.alias,
        parameters: parameters,
        responseJson: response,
        requestTimestamp: requestTimestamp,
        responseTimestamp: Date.now(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        method: method,
        title: undefined,
        sound: settings.sound || undefined,
        url: undefined,
        isEncrypted: isEncrypted,
        createdAt: new Date(requestTimestamp).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
        inspectType: 'omnibox', // 标记为 omnibox 输入
        authorization: defaultDevice.authorization
      };

      await saveHistoryRecord(historyRecord);

      // 已发送至**设备
      showSYSNotification(getMessage('bark_sender_title'), getMessage('sent_to_device', [defaultDevice.alias]));

    } catch (error) {
      console.error('地址栏推送发送失败:', error);
      // 发送失败，请检查网络连接
      showSYSNotification(getMessage('bark_sender_title'), getMessage('send_failed_check_network'), true);
    }
  }

  // 监听扩展安装和启动
  browser.runtime.onInstalled.addListener(() => {
    // console.debug('Bark Sender 已安装');
    console.debug(getMessage('extension_installed'));
    updateContextMenus();
  });

  browser.runtime.onStartup.addListener(() => {
    updateContextMenus();
  });

  // 监听存储变化，动态更新右键菜单和侧边栏行为
  browser.storage.onChanged.addListener((changes: any) => {
    if (changes.bark_devices || changes.bark_app_settings) {
      updateContextMenus();
    }
    if (changes.bark_app_settings) {
      initActionClickBehavior();
    }
  });

  // 更新右键菜单
  async function updateContextMenus() {
    try {
      // 清除所有现有菜单
      browser.contextMenus.removeAll();

      // 获取设置
      const settingsResult = await getStorageData('bark_app_settings');
      const settings = settingsResult.bark_app_settings || { enableContextMenu: true, enableInspectSend: true };

      // 老用户没有这项，这里默认启用
      const enableInspectSend = settings.enableInspectSend ?? true; // 是否启用 inspect-send 菜单项

      if (!settings.enableContextMenu) {
        return;
      }

      // 获取设备列表和默认设备
      const [devicesResult, defaultDeviceResult] = await Promise.all([
        getStorageData('bark_devices'),
        getStorageData('bark_default_device')
      ]);

      const devices = devicesResult.bark_devices || [];
      const defaultDeviceId = defaultDeviceResult.bark_default_device || '';

      if (devices.length === 0) {
        return;
      }

      // 找到默认设备
      const defaultDevice = devices.find((device: any) => device.id === defaultDeviceId) || devices[0];

      // 根据 enableInspectSend 设置决定 如果开启则使用新版的 inspect-send 否则使用旧版的 send-selection, send-page, send-link
      if (enableInspectSend) {
        browser.contextMenus.create({
          id: 'send-page',
          title: getMessage('send_page_to_device', [defaultDevice.alias]),
          contexts: ['action']
        });
        // 创建新版右键菜单项 - inspect-send
        browser.contextMenus.create({
          id: 'inspect-send',
          title: getMessage('inspect_send', [defaultDevice.alias]),
          contexts: ['all']
        });
      } else {
        // 创建传统右键菜单项 - send-selection, send-page, send-link
        browser.contextMenus.create({
          id: 'send-selection',
          title: getMessage('send_selection_to_device', [defaultDevice.alias]),
          contexts: ['selection']
        });

        browser.contextMenus.create({
          id: 'send-page',
          title: getMessage('send_page_to_device', [defaultDevice.alias]),
          contexts: ['page', 'action']
        });

        // browser.contextMenus.create({
        //   id: 'send-link',
        //   title: getMessage('send_link_to_device', [defaultDevice.alias]),
        //   contexts: ['link']
        // });
      }

      // 切换极速模式的右键菜单项
      const speedModeEnabled = settings.enableSpeedMode || false;
      browser.contextMenus.create({
        id: 'toggle-speed-mode',
        title: getMessage(speedModeEnabled ? 'disable_speed_mode' : 'enable_speed_mode'),
        contexts: ['action']
      });

    } catch (error) {
      console.error(getMessage('update_context_menus_failed'), error);
    }
  }

  // 处理右键菜单点击
  browser.contextMenus.onClicked.addListener(async (info: any, tab: any) => {
    let message = '', title = '', url = '';
    let defaultDevice: any = null;
    let settings: any = {};

    try {
      // 获取默认设备和设置
      const [devicesResult, defaultDeviceResult, settingsResult] = await Promise.all([
        getStorageData('bark_devices'),
        getStorageData('bark_default_device'),
        getStorageData('bark_app_settings')
      ]);

      const devices = devicesResult.bark_devices || [];
      const defaultDeviceId = defaultDeviceResult.bark_default_device || '';
      defaultDevice = devices.find((device: any) => device.id === defaultDeviceId) || devices[0];
      settings = settingsResult.bark_app_settings || { enableEncryption: false };
      const enableSimplifiedProcessing = !!settings?.enableSimplifiedProcessing;

      // 对于切换极速模式，不需要检查默认设备
      if (info.menuItemId === 'toggle-speed-mode') {
        const currentSpeedMode = settings.enableSpeedMode || false;
        const newSpeedMode = !currentSpeedMode;

        // 更新设置
        const updatedSettings = { ...settings, enableSpeedMode: newSpeedMode };
        await browser.storage.local.set({ bark_app_settings: updatedSettings });

        // 极速模式已启用/禁用 如果是启用，则提醒
        showSYSNotification(getMessage('bark_sender_title'), getMessage(newSpeedMode ? 'enable_speed_mode' : 'disable_speed_mode'), newSpeedMode === true);

        // 更新右键菜单
        updateContextMenus();
        return;
      }

      if (!defaultDevice) {
        // console.error('未找到默认设备');
        console.error(getMessage('device_not_found'));
        // 未找到默认设备
        showSYSNotification(getMessage('bark_sender_title'), getMessage('device_not_found'), true);
        return;
      }
      console.debug('info', info);
      if (info.menuItemId === 'send-selection' && info.selectionText) {
        message = info.selectionText;
      } else if (info.menuItemId === 'send-page' && tab?.url) {
        title = tab.title || 'Web'; // 网页标题作为推送标题
        message = tab.url; // 网页 URL 作为推送内容
        url = tab.url; // 同时保留url参数
      } else if (info.menuItemId === 'send-link' && info.linkUrl) {
        title = info.linkText || 'Link'; // 链接文本作为推送标题
        message = info.linkUrl; // 链接URL作为推送内容
        url = info.linkUrl; // 同时保留url参数
      }
      //  else if (info.menuItemId === 'send-image' && info.srcUrl) {
      //   title = 'Image'; // 图片标题
      //   message = info.srcUrl; // 图片URL作为推送内容
      //   url = info.srcUrl; // 同时保留url参数
      // }
      else if (info.menuItemId === 'inspect-send') {
        // 打印完整的右键菜单信息到控制台
        console.log('Right Click Context Info:', {
          info,
          tab,
          mediaType: info.mediaType,
          pageUrl: info.pageUrl,
          frameUrl: info.frameUrl,
          srcUrl: info.srcUrl,
          linkUrl: info.linkUrl,
          linkText: info.linkText,
          selectionText: info.selectionText,
          editable: info.editable,
          menuItemId: info.menuItemId,
          modifiers: info.modifiers,
          button: info.button,
          // 添加来自content script的元素信息
          elementInfo: lastRightClickedElementInfo
        });
        // pageUrl 必须是http或者是https协议的 使用正则表达式
        if (info.pageUrl && !info.pageUrl.startsWith('http://') && !info.pageUrl.startsWith('https://')) {
          return;
        }

        // 向 content script 发送消息，显示选择对话框
        if (tab && tab.id) {
          browser.tabs.sendMessage(tab.id, {
            action: 'show_dialog',
            contextInfo: info, // 右键菜单信息
          }).catch(error => {
            // 将URL相关参数存储到storage.local
            const urlData = {
              url: tab.url,
              title: tab.title,
              selectionText: info.selectionText,
              linkText: info.linkText,
              linkUrl: info.linkUrl
            };

            browser.storage.local.set({ bark_url_data: urlData }).then(() => {
              browser.windows.create({
                url: browser.runtime.getURL('/popup.html?mode=window&useUrlDialog=true'),
                type: 'popup',
                width: 380,
                height: 660,
                left: 0,
                top: 0,
                focused: true,
              });
            });
            return;
          });
        }

        return; // 不执行发送操作
      }

      if (message) {
        const requestTimestamp = Date.now();
        let response: any;
        let method: 'GET' | 'POST' = 'GET';
        let isEncrypted = false;
        let parameters: any[] = [];

        const pushUuid = generateID(); // 生成 UUID 用于请求参数 做 撤回 / 修改 请求用

        // 预加载favicon（仅当发送页面或选中文本时）
        let faviconUrl: string | null = null;
        if (info.menuItemId === 'send-page' || info.menuItemId === 'send-selection') {
          try {
            const currentPageUrl = tab?.url;
            if (currentPageUrl) {
              faviconUrl = await prefetchFavicon(currentPageUrl);
            }
          } catch (error) {
            console.debug('预加载favicon失败:', error);
          }
        }

        // 确定最终使用的图标：优先级为 favicon > 自定义头像
        let finalIcon: string | undefined;
        if (settings.enableFaviconIcon && faviconUrl) {
          finalIcon = faviconUrl; // 优先使用favicon
        } else if (settings.enableCustomAvatar && settings.barkAvatarUrl) {
          finalIcon = settings.barkAvatarUrl; // 回退到自定义头像
        }

        // 获取自定义参数差异，并过滤掉与解析内容冲突的参数
        const customParams = getCustomParametersDifference(settings);
        const filteredCustomParams = filterConflictingParams(customParams, {
          title,
          url
        });

        const pushParams: PushParams = {
          apiURL: defaultDevice.apiURL,
          message,
          sound: settings.sound,
          url,
          title,
          uuid: pushUuid,
          useAPIv2: settings.enableApiV2,
          devices: [defaultDevice],
          device_key: defaultDevice.deviceKey, // 添加device_key
          device_keys: [defaultDevice.deviceKey].filter(Boolean) as string[], // 添加device_keys
          ...(defaultDevice.authorization && { authorization: defaultDevice.authorization }),
          ...(finalIcon && { icon: finalIcon }),
          ...filteredCustomParams
        };

        const { simplifiedActive, resolvedCopy } = resolveSimplifiedProcessing({
          enableSimplifiedProcessing,
          copy: pushParams.copy
        });

        pushParams.message = simplifiedActive ? resolvedCopy : pushParams.message;
        pushParams.title = simplifiedActive ? undefined : pushParams.title;
        pushParams.url = simplifiedActive ? undefined : pushParams.url;
        pushParams.copy = simplifiedActive ? undefined : pushParams.copy;

        message = simplifiedActive ? resolvedCopy : message;
        title = simplifiedActive ? '' : title;
        url = simplifiedActive ? '' : url;

        // 根据设置选择发送方式
        if (settings.enableEncryption && settings.encryptionConfig?.key) {
          method = 'POST';
          isEncrypted = true;
          response = await sendPush(pushParams, settings.encryptionConfig, settings.enableApiV2 ? 'v2' : 'v1');
        } else {
          method = settings.enableApiV2 ? 'POST' : 'GET';
          response = await sendPush(pushParams, undefined, settings.enableApiV2 ? 'v2' : 'v1');
        }

        // 获取请求参数
        parameters = getRequestParameters(pushParams, isEncrypted);

        const responseTimestamp = Date.now();
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const createdAt = new Date(requestTimestamp).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });

        // 创建历史记录对象
        const historyRecord = {
          id: Date.now(), // 使用时间戳作为ID
          uuid: pushUuid, // 用于后续的 撤回 / 修改 请求
          timestamp: requestTimestamp,
          body: message,
          apiUrl: defaultDevice.apiURL,
          deviceName: defaultDevice.alias,
          parameters: parameters,
          responseJson: response,
          requestTimestamp: requestTimestamp,
          responseTimestamp: responseTimestamp,
          timezone: timezone,
          method: method,
          title: title || undefined,
          sound: settings.sound || undefined,
          url: url || undefined,
          isEncrypted: isEncrypted,
          createdAt: createdAt,
          authorization: defaultDevice.authorization
        };

        // 保存历史记录
        await saveHistoryRecord(historyRecord);

        // 已发送至**
        showSYSNotification(getMessage('bark_sender_title'), getMessage('sent_to_device', [defaultDevice.alias]));
      }

    } catch (error) {
      // console.error('发送推送失败:', error);
      console.error(getMessage('send_failed_check_network'), error);

      // 即使发送失败也要记录历史
      if (message && defaultDevice) {
        const requestTimestamp = Date.now();
        const errorResponse = {
          code: -1,
          // message: error instanceof Error ? error.message : '未知错误',
          message: error instanceof Error ? error.message : getMessage('error_unknown'),
          timestamp: Date.now()
        };

        const historyRecord = {
          id: Date.now(),
          uuid: generateID(),
          timestamp: requestTimestamp,
          body: message,
          apiUrl: defaultDevice.apiURL,
          deviceName: defaultDevice.alias,
          parameters: [],
          responseJson: errorResponse,
          requestTimestamp: requestTimestamp,
          responseTimestamp: Date.now(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          method: 'GET' as const,
          title: title || undefined,
          sound: settings.sound || undefined,
          url: url || undefined,
          isEncrypted: false,
          createdAt: new Date(requestTimestamp).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          }),
          authorization: defaultDevice.authorization
        };

        await saveHistoryRecord(historyRecord);
      }

      // 发送失败，请检查网络连接
      showSYSNotification(getMessage('bark_sender_title'), getMessage('send_failed_check_network'), true);
    }
  });
});
