import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Box,
    Card,
    IconButton,
    Typography,
    Divider,
    Chip,
    Stack,
    useTheme,
    alpha,
    Slide,
    Link,
    Button,
    TextField,
    Tooltip,
    Snackbar,
    CircularProgress
} from '@mui/material';
import {
    CheckCircle as CheckCircleIcon,
    Error as ErrorIcon,
    Help as HelpIcon,
    Undo as UndoIcon,
    Schedule as ScheduleIcon,
    Devices as DevicesIcon,
    Link as LinkIcon,
    VolumeUp as VolumeUpIcon,
    Code as CodeIcon,
    ContentCopy as ContentCopyIcon,
    Title as TitleIcon,
    OpenInNew as OpenInNewIcon,
    ChevronLeft as ChevronLeftIcon,
    ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { HistoryRecord, getHistoryRecordByUuid, updateHistoryRecordStatus } from '../utils/database';
import { getImageByPushID } from '../utils/favicon-manager';
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

import { encryptAESCBC, generateIV } from '../../shared/push-service';
import { getAppSettings } from '../utils/settings';

// 注册插件
dayjs.extend(utc);
dayjs.extend(timezone);
import { writeToClipboard } from '../utils/clipboardWrite'; // 写入剪切板
import PreviewCard from './PreviewCard';

interface RecordDetailModalProps {
    record: HistoryRecord | null;
    open: boolean;
    onClose: () => void;
    onExited?: () => void; // 退出动画结束回调
    currentIndex?: number; // 当前记录在列表中的索引
    totalCount?: number; // 总记录数
    onNavigate?: (direction: 'prev' | 'next') => void; // 导航回调
    onRecallSuccess?: () => void; // 撤回成功回调，用于刷新数据
    onRecordUpdate?: (updatedRecord: HistoryRecord) => void; // 记录更新回调
}

// 模拟 ShadowDOM 的内容隔离容器（使用普通 React 渲染）
const IsolatedContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <Box sx={{
            width: '100%',
            height: '100%',
            // 创建独立的渲染上下文
            isolation: 'isolate',
            // 防止外部样式影响
            position: 'relative',
            zIndex: 1
        }}>
            {children}
        </Box>
    );
};

// 状态图标组件
const StatusChip: React.FC<{ record: HistoryRecord }> = ({ record }) => {
    const { t } = useTranslation();

    // 优先检查撤回状态
    if (record.status === 'recalled') {
        return (
            <Chip
                icon={<UndoIcon />}
                label={t('history.table.recalled')}
                color="warning"
                variant="outlined"
                size="small"
            />
        );
    }

    const responseCode = record.responseJson?.code;
    const responseMessage = record.responseJson?.message;

    // 成功状态
    if (responseCode === 200) {
        return (
            <Chip
                icon={<CheckCircleIcon />}
                label={`${responseCode} OK`}
                color="success"
                variant="outlined"
                size="small"
            />
        );
    }

    /*  note:
        因为 bark server 返回的HTTP 错误, 会提供 JSON 或者 HTML 不统一
        HTTP 错误会记录为状态码到 message 里: HTTP error! status: <状态码>
        所以 如果是网络错误、超时、还是其他异常都记录为 code: -1 
     */
    if (responseCode === -1) {
        // 处理消息
        console.log('responseMessage', responseMessage);
        // const errorMessage = responseMessage
        //     ? String(responseMessage).replace("HTTP error! status: ", "")
        //     : t('common.failed');

        const isHTTPError = responseMessage.startsWith('HTTP error! status: ')
        const errorMessage = isHTTPError ? responseMessage.replace('HTTP error! status: ', '') : responseMessage;
        const finalMessage = errorMessage.startsWith('utils.api.') ? t(errorMessage) : errorMessage + ' ERROR';

        return (
            <Chip
                icon={<ErrorIcon />}
                label={`${finalMessage}`}
                color="error"
                variant="outlined"
                size="small"
                sx={{ fontSize: '0.625rem' }}
            />
        );
    }

    // 其他未知状态
    return (
        <Chip
            icon={<HelpIcon />}
            label={responseCode ? `${responseCode} ${t('common.other')}` : t('common.other')}
            color="warning"
            variant="outlined"
            size="small"
        />
    );
};

// 详情行组件
const DetailRow: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: React.ReactNode;
    fullWidth?: boolean;
    tooltip?: string;
    enableCopy?: boolean;
    onCopy?: (content: string) => void;
}> = ({ icon, label, value, fullWidth = false, tooltip, enableCopy = true, onCopy }) => {
    const theme = useTheme();

    return (

        <Box sx={{
            display: 'flex',
            alignItems: fullWidth ? 'flex-start' : 'center',
            gap: 2,
            py: 1.5,
            flexDirection: fullWidth ? 'column' : 'row'
        }}>
            {/* 键 */}
            <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                minWidth: fullWidth ? 'auto' : 120,
                color: theme.palette.text.secondary
            }}>
                {/* 图标 */}
                {icon}
                {/* 标签 */}
                <Typography variant="body2" fontWeight={500}>
                    {label}
                </Typography>
            </Box>
            {/* 值 */}
            <Tooltip title={tooltip} arrow slotProps={{
                popper: {
                    sx: { zIndex: 9999 }
                }
            }}>
                <Box sx={{
                    flex: fullWidth ? undefined : 1,
                    width: fullWidth ? '100%' : 'auto'
                }}>
                    <Stack direction="row" gap={1} alignItems="center">
                        {typeof value === 'string' ? (
                            <Typography
                                variant="body2"
                                sx={{
                                    wordBreak: 'break-all',
                                    color: theme.palette.text.primary
                                }}
                            >
                                {value}
                            </Typography>
                        ) : value}
                        {/* 拷贝按钮 */}
                        {typeof value === 'string' && enableCopy && (
                            <IconButton
                                onClick={() => {
                                    onCopy?.(typeof value === 'string' ? value : JSON.stringify(value));
                                }}
                            >
                                <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                            </IconButton>
                        )}
                    </Stack>

                </Box>
            </Tooltip>
        </Box>

    );
};


// 缓存图片组件
const CachedImage: React.FC<{
    record: HistoryRecord;
    onDoubleClick?: () => void;
    style?: React.CSSProperties;
    alt?: string;
}> = ({ record, onDoubleClick, style, alt }) => {
    const [imageUrl, setImageUrl] = useState<string>(record.url || '');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const loadCachedImage = async () => {
            if (!record.uuid || !record.url) {
                setLoading(false);
                return;
            }

            try {
                // 尝试从缓存获取图片
                const cachedUrl = await getImageByPushID(record.uuid);

                if (isMounted) {
                    if (cachedUrl) {
                        console.debug('使用缓存图片:', cachedUrl);
                        setImageUrl(cachedUrl);
                    } else {
                        console.debug('缓存中无图片，使用原始URL:', record.url);
                        setImageUrl(record.url || '');
                    }
                    setLoading(false);
                }
            } catch (error) {
                console.error('加载缓存图片失败:', error);
                if (isMounted) {
                    setImageUrl(record.url || '');
                    setLoading(false);
                }
            }
        };

        loadCachedImage();

        return () => {
            isMounted = false;
        };
    }, [record.uuid, record.url]);

    if (loading) {
        return (
            <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...style
            }}>
                <CircularProgress size={20} />
            </Box>
        );
    }

    return (
        <img
            src={imageUrl}
            alt={alt || record.title || 'Image'}
            style={style}
            onDoubleClick={onDoubleClick}
            onError={(e) => {
                // 如果缓存的图片加载失败，回退到原始URL
                if (imageUrl !== record.url && record.url) {
                    console.warn('缓存图片加载失败，回退到原始URL');
                    setImageUrl(record.url);
                }
            }}
        />
    );
};

export default function RecordDetailModal({ record, open, onClose, onExited, currentIndex, totalCount, onNavigate, onRecallSuccess, onRecordUpdate }: RecordDetailModalProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const portalRoot = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null); // 内容区域引用，用于滚动
    const [mounted, setMounted] = useState(false); // 控制 Portal 挂载，确保关闭时有退出动画
    const [parameters, setParameters] = useState<any>({});
    const [displayParameters, setDisplayParameters] = useState<any>({});
    const [encryptedData, setEncryptedData] = useState<{ iv: string; ciphertext: string } | null>(null);
    const [copySuccessOpen, setCopySuccessOpen] = useState(false);
    const [recallLoading, setRecallLoading] = useState(false); // 撤回加载状态
    const [recallResultOpen, setRecallResultOpen] = useState(false); // 撤回结果提示
    const [recallResult, setRecallResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null); // 撤回结果

    // 创建 Portal 容器
    useEffect(() => {
        if (!portalRoot.current) {
            portalRoot.current = document.createElement('div');
            portalRoot.current.id = 'record-detail-modal-portal';
            document.body.appendChild(portalRoot.current);
        }

        return () => {
            if (portalRoot.current && document.body.contains(portalRoot.current)) {
                document.body.removeChild(portalRoot.current);
                portalRoot.current = null;
            }
        };
    }, []);

    // 打开时挂载 Portal
    useEffect(() => {
        if (open) {
            setMounted(true);
        } else {
            // 关闭模态窗口时重置状态
            setEncryptedData(null);
            setDisplayParameters({});
            setRecallResultOpen(false);
            setRecallResult(null);
            setRecallLoading(false);
        }
    }, [open]);

    useEffect(() => {
        if (!record) return;

        // console.log("record", record);

        // 构建 parameters
        const parameters = (record.parameters ?? []).reduce((acc, { key, value }) => {
            if (key) acc[key] = value ?? "";
            return acc;
        }, {} as any);

        const id = record.uuid ?? "";
        const timezone =
            record.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone; // 如果 timezone 为空，则使用当前时区

        parameters.id = id;
        parameters.body = parameters.message ?? record.body ?? "";
        delete parameters.message;

        parameters.timezone = timezone;
        let sendTimestamp = Date.now();
        try { sendTimestamp = dayjs.tz(record.createdAt, "YYYY-MM-DD HH:mm:ss", timezone).unix(); } catch (error) { console.warn('时间戳转换失败，使用当前时间:', error); }
        parameters.sendTimestamp = sendTimestamp;

        console.log("parameters", parameters, "record", record);
        // 处理 displayParameters
        const displayParameters = Object.fromEntries(
            Object.entries(parameters).filter(
                ([key, value]) =>
                    !["timezone", "sendTimestamp"].includes(key) &&
                    value !== ""
            )
        );

        // 如果 autoCopy = 1, 则移除copy字段
        if (displayParameters?.autoCopy === 1) {
            delete displayParameters.copy;
        }

        // 处理 device_keys 和 device_key 字段的逻辑
        if (displayParameters.device_keys) {
            const deviceKeysArray = (Array.isArray(displayParameters.device_keys)
                ? displayParameters.device_keys
                : String(displayParameters.device_keys).split(",").map((k: string) => k.trim())
            ).filter(Boolean);

            if (deviceKeysArray.length > 1) {
                // 多个设备：只保留 device_keys
                displayParameters.device_keys = deviceKeysArray;
                delete displayParameters.device_key;
            } else if (deviceKeysArray.length === 1) {
                // 单个设备：只保留 device_key
                displayParameters.device_key = deviceKeysArray[0];
                delete displayParameters.device_keys;
            } else {
                // 空数组：清理 device_keys
                delete displayParameters.device_keys;
            }
        }

        setDisplayParameters(displayParameters);
        setParameters(parameters);
    }, [record]);

    // 背景缩放：通过 Slide 生命周期钩子控制，避免 setTimeout
    const getAppRoot = () => document.getElementById('root') || document.body;
    const applyBackgroundEnter = () => {
        const appRoot = getAppRoot();
        appRoot.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) ';
        appRoot.style.transformOrigin = 'top';
        appRoot.style.transform = 'scale(0.96) translateY(15px)';
        appRoot.style.overflow = 'hidden';
        appRoot.style.borderRadius = '12px';
        appRoot.style.overflow = 'hidden';
        // appRoot.style.boxShadow = '0px 10px 10px 100px #000000';
        document.body.style.overflow = 'hidden';
    };
    const applyBackgroundExitStart = () => {
        const appRoot = getAppRoot();
        appRoot.style.transform = 'scale(1)';
        appRoot.style.borderRadius = '0';
    };
    const clearBackgroundStyles = () => {
        const appRoot = getAppRoot();
        appRoot.removeAttribute('style');
        document.body.style.overflow = '';
    };


    if (!record || !portalRoot.current || !mounted) return null;

    const bodyRenderer = () => {
        // 检查是否有 image 参数
        const imageParam = displayParameters?.image;
        const hasImageParam = imageParam && typeof imageParam === 'string' && imageParam.trim() !== '';

        if (record?.inspectType === 'image' && record.url) { // inspectType 为 image 时
            return (
                <Stack direction="row" gap={1} alignItems="center">
                    <Box sx={{
                        width: '105px', height: '105px', border: '1px solid', borderColor: 'divider',
                        backgroundColor: theme.palette.action.hover, // 灰色
                        borderRadius: '4px',
                    }}>
                        <CachedImage
                            record={record}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                            }}
                            onDoubleClick={() => {
                                if (record.url) {
                                    window.open(record.url, '_blank');
                                }
                            }}
                        />
                    </Box>
                    {/* 新标签页打开 */}
                    <IconButton
                        onClick={() => {
                            window.open(record.url, '_blank');
                        }}
                    >
                        <OpenInNewIcon sx={{ fontSize: '0.875rem' }} />
                    </IconButton>
                    {/* 拷贝 */}
                    <IconButton
                        onClick={() => {
                            handleCopy(record.url || 'copy failed');
                        }}
                    >
                        <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                    </IconButton></Stack>
            );
        } else if (hasImageParam) { // 检查 image 参数
            return (
                <Stack direction="row" gap={1} alignItems="center">
                    <Box sx={{
                        width: '105px', height: '105px', border: '1px solid', borderColor: 'divider',
                        backgroundColor: theme.palette.action.hover,
                        borderRadius: '4px',
                    }}>
                        <img
                            src={imageParam}
                            alt="推送图片"
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                            }}
                            onDoubleClick={() => {
                                window.open(imageParam, '_blank');
                            }}
                            onError={(e) => {
                                console.warn('图片加载失败:', imageParam);
                                // 可以在这里添加错误处理，比如显示占位符
                            }}
                        />
                    </Box>
                    {/* 新标签页打开 */}
                    <IconButton
                        onClick={() => {
                            window.open(imageParam, '_blank');
                        }}
                    >
                        <OpenInNewIcon sx={{ fontSize: '0.875rem' }} />
                    </IconButton>
                    {/* 拷贝 */}
                    <IconButton
                        onClick={() => {
                            handleCopy(imageParam);
                        }}
                    >
                        <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                    </IconButton>
                </Stack>
            );
        }

        if (record?.url) { // inspectType 为 url 时
            return (
                <Stack direction="row" gap={1} alignItems="center">
                    <Typography
                        variant="body2"
                        component="a"
                        href={record.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                            color: theme.palette.primary.main,
                            textDecoration: 'none',
                            wordBreak: 'break-all',
                            display: '-webkit-box',
                            overflow: 'hidden',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 3,
                            '&:hover': {
                                textDecoration: 'underline'
                            }
                        }}
                    >
                        {record.url || record.body}
                    </Typography>
                    <Stack direction="row" gap={1} alignItems="center">
                        <IconButton
                            onClick={() => {
                                if (record.url) {
                                    window.open(record.url, '_blank');
                                }
                            }}
                        >
                            <OpenInNewIcon sx={{ fontSize: '0.875rem' }} />
                        </IconButton>
                        <IconButton
                            onClick={() => {
                                handleCopy(record.url || 'copy failed');
                            }}
                        >
                            <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                        </IconButton>
                    </Stack>
                </Stack>
            );
        }

        return ( // inspectType 可能会有 omnibox 等其他类型
            <Stack direction="row" gap={1} alignItems="center">
                <Typography
                    variant="body2"
                    sx={{
                        wordBreak: "break-word",
                        display: "-webkit-box",
                        overflow: "hidden",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: 3,
                    }}
                >
                    {record?.body || ''}
                </Typography>
                <Stack direction="row" gap={1} alignItems="center">
                    <IconButton
                        onClick={() => {
                            handleCopy(record?.body || 'copy failed');
                        }}
                    >
                        <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                    </IconButton>
                </Stack>
            </Stack>
        );
    };

    const encryptParameters = async (parameters: any) => {
        try {
            const iv = generateIV();

            const plaintext = JSON.stringify({
                body: parameters.body,
                title: parameters.title
            });
            // 读取设置记录的key
            const settings = await getAppSettings();
            const key = settings.encryptionConfig?.key;

            if (!key) {
                console.error('未找到加密密钥');
                return null;
            }
            // 3. 加密
            const ciphertext = await encryptAESCBC(plaintext, key, iv);

            // 4. 更新加密数据状态 合并 displayParameters 和 iv, ciphertext, 移除明文 body, title
            const encryptedResult = { ...displayParameters, iv, ciphertext };
            delete encryptedResult.body;
            setEncryptedData(encryptedResult);

            // 加密完成后滚动到底部
            if (contentRef.current) {
                setTimeout(() => {
                    contentRef.current?.scrollTo({
                        top: contentRef.current.scrollHeight,
                        behavior: 'smooth'
                    });
                }, 100); // 稍微延迟以确保内容已渲染
            }

            return encryptedResult;
        } catch (error) {
            console.error('加密失败:', error);
            return null;
        }

    }


    const handleCopy = async (content: string) => {
        try {
            await writeToClipboard(content, 'txt');
            setCopySuccessOpen(true);
        } catch (error) {
            console.error('拷贝失败:', error);
        }
    };

    // 处理撤回操作
    const handleRecall = async () => {
        if (!record || !record.uuid) {
            setRecallResult({ type: 'error', message: t('push.recall.record_not_found') });
            setRecallResultOpen(true);
            return;
        }

        setRecallLoading(true);

        try {
            const historyRecord = await getHistoryRecordByUuid(record.uuid);

            if (!historyRecord) {
                setRecallResult({ type: 'error', message: t('push.recall.record_not_found') });
                setRecallResultOpen(true);
                return;
            }

            const recallUrl = `${historyRecord.apiUrl}?id=${encodeURIComponent(record.uuid)}&delete=1`;
            console.debug('发送撤回请求到:', recallUrl);

            const headers: Record<string, string> = {};
            if (historyRecord.authorization && historyRecord.authorization.value) {
                headers['Authorization'] = historyRecord.authorization.value;
            }

            const response = await fetch(recallUrl, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache',
                ...(Object.keys(headers).length > 0 && { headers })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.debug('撤回请求结果:', result);

            if (result.code === 200) {
                setRecallResult({ type: 'success', message: t('push.recall.success') });
                // 更新数据库记录状态
                await updateHistoryRecordStatus(record.uuid, 'recalled');

                // 重新获取最新的记录数据
                const updatedRecord = await getHistoryRecordByUuid(record.uuid);
                if (updatedRecord && onRecordUpdate) {
                    onRecordUpdate(updatedRecord);
                }

                // 通知父组件刷新数据
                onRecallSuccess?.();
            } else {
                setRecallResult({ type: 'error', message: t('push.recall.failed', { message: result.message || '未知错误' }) });
            }
        } catch (error) {
            console.error(t('push.recall.operation_failed'), error);
            setRecallResult({
                type: 'error',
                message: t('push.recall.failed', { message: error instanceof Error ? error.message : '网络错误' })
            });
        } finally {
            setRecallLoading(false);
            setRecallResultOpen(true);
        }
    };

    const modalContent = (
        <>
            <Box
                sx={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: alpha(theme.palette.common.black, 0.4),
                    opacity: open ? 1 : 0,
                    transition: theme.transitions.create('opacity', {
                        duration: 300,
                        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                    }),
                    pointerEvents: mounted ? 'auto' : 'none'
                }}
                onClick={onClose}
            >
                <Slide
                    direction="up"
                    in={open}
                    mountOnEnter
                    unmountOnExit
                    timeout={{ enter: 300, exit: 300 }}
                    onEnter={applyBackgroundEnter}
                    onExit={applyBackgroundExitStart}
                    onExited={() => {
                        setMounted(false);
                        clearBackgroundStyles();
                        onExited && onExited();
                    }}
                >
                    <Box
                        sx={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: 'calc(100vh - 24px)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Card
                            sx={{
                                height: '100%',
                                borderRadius: '14px 14px 0 0',
                                boxShadow: theme.shadows[24],
                                backgroundColor: theme.palette.background.paper,
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                            }}
                        >
                            {/* 指示器 */}
                            <Box sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 0.5,
                                pt: 1,
                                cursor: 'pointer'
                            }} onClick={onClose}>
                                {/* <Box sx={{
                                    width: 40,
                                    height: 4,
                                    backgroundColor: alpha(theme.palette.text.secondary, 0.3),
                                    borderRadius: 2,
                                }} /> */}
                            </Box>

                            {/* header */}
                            <Box sx={{
                                px: 2,
                                pb: 1.5,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`
                            }}>
                                {/* 关闭按钮 */}
                                <Link onClick={onClose} sx={{
                                    cursor: 'pointer',
                                    color: theme.palette.primary.main,
                                    textDecoration: 'none',
                                    userSelect: 'none',
                                    '&:hover': {
                                        color: theme.palette.primary.main,
                                        opacity: 0.6
                                    },
                                    '&:active': {
                                        color: theme.palette.primary.main,
                                        opacity: 0.5
                                    },
                                    flex: 1,
                                }}>
                                    {/* 关闭 */}
                                    {t('common.close')}
                                </Link>
                                <Stack alignItems="center" sx={{ flex: 1, fontWeight: 600, fontSize: '1.0625rem' }}>
                                    {/* 推送详情 */}
                                    {t('history.detail.title')}
                                </Stack>
                                <Stack justifyContent="flex-end" alignItems="center" direction="row" gap={1} flex={1}>
                                    {/* 撤回按钮 */}
                                    {record && (
                                        <>
                                            {recallLoading && <CircularProgress size={14} color='warning' />}
                                            <Link
                                                component="button"
                                                onClick={handleRecall}
                                                disabled={recallLoading}
                                                sx={{
                                                    cursor: 'pointer',
                                                    color: theme.palette.primary.main,
                                                    textDecoration: 'none',
                                                    userSelect: 'none',
                                                    fontWeight: 500,
                                                    '&:hover': {
                                                        color: theme.palette.primary.main,
                                                        opacity: 0.6
                                                    },
                                                    '&:active': {
                                                        color: theme.palette.primary.main,
                                                        opacity: 0.5
                                                    },
                                                }}
                                            >
                                                {t('push.recall.button')}
                                            </Link>
                                        </>
                                    )}
                                </Stack>
                            </Box>
                            <Box sx={{ px: 3, py: 1.5, pb: 1 }}>
                                <Stack direction="column" justifyContent="center" sx={{ m: 0, position: 'relative' }}>
                                    {/* 推送预览 */}
                                    <Stack justifyContent="center" alignItems="flex-start" sx={{
                                        position: 'absolute', left: '-24px', top: 0, height: '100%', width: '48px', p: 0,
                                        zIndex: 1, borderRadius: '0 50% 50% 0',
                                        '&:active .MuiSvgIcon-root': {
                                            scale: 0.9
                                        },
                                        '&:hover': {
                                            opacity: 0.6
                                        },
                                        cursor: 'pointer',
                                        transition: 'all .5s ease-in-out'
                                    }}
                                        onClick={() => onNavigate?.('prev')}
                                    >
                                        <ChevronLeftIcon
                                            sx={{
                                                display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center',
                                                opacity: (!onNavigate || currentIndex === 0) ? 0.1 : 0.6
                                            }} />
                                    </Stack>
                                    <Stack justifyContent="center" alignItems="flex-end" sx={{
                                        position: 'absolute', right: '-24px', top: 0, height: '100%', width: '48px', p: 0,
                                        zIndex: 1, borderRadius: ' 50% 0 0 50%',
                                        '&:active .MuiSvgIcon-root': {
                                            scale: 0.6
                                        },
                                        '&:hover': {
                                            opacity: 0.6
                                        },
                                        cursor: 'pointer',
                                        transition: 'all .5s ease-in-out'
                                    }}
                                        onClick={() => onNavigate?.('next')}
                                    >
                                        <ChevronRightIcon sx={{
                                            display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center',
                                            opacity: (!onNavigate || !totalCount || currentIndex === totalCount - 1) ? 0.1 : 0.6,
                                        }} />
                                    </Stack>
                                    <PreviewCard
                                        parameters={parameters}
                                    />
                                </Stack>
                            </Box>

                            {/* 内容区域 使用隔离容器 */}
                            <Box ref={contentRef} sx={{ flex: 1, overflow: 'auto', p: 3 }}>
                                <IsolatedContainer>
                                    <Stack spacing={1} sx={{ pb: 8 }}>

                                        {/* 详情信息开始 */}
                                        {/* Body */}
                                        <Stack>
                                            {/* 内容 */}
                                            <Box sx={{
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                gap: 2,
                                                py: 1.5,
                                                flexDirection: 'column'
                                            }}>
                                                {/* <Box sx={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 1,
                                                    minWidth: 120,
                                                    color: theme.palette.text.secondary
                                                }}>
                                                    <NotesIcon fontSize="small" />
                                                    <Typography variant="body2" fontWeight={500}>
                                                        内容
                                                    </Typography>
                                                </Box> */}
                                                <Box sx={{
                                                    width: 'fit-content'
                                                }}>
                                                    {bodyRenderer()}
                                                </Box>
                                            </Box>
                                        </Stack>

                                        <Divider />

                                        <Stack>
                                            {/* 标题 - 使用 DetailRow */}
                                            {record.title && (
                                                <DetailRow
                                                    icon={<TitleIcon fontSize="small" />}
                                                    label="标题"
                                                    value={record.title}
                                                    onCopy={handleCopy}
                                                />
                                            )}

                                            {/* 铃声 */}
                                            {record.sound && (
                                                <DetailRow
                                                    icon={<VolumeUpIcon fontSize="small" />}
                                                    label={t('history.detail.sound')}
                                                    value={record.sound}
                                                    onCopy={handleCopy}
                                                />
                                            )}

                                            {/* 链接 */}
                                            {record.url && (
                                                <DetailRow
                                                    icon={<LinkIcon fontSize="small" />}
                                                    label={t('history.detail.url')}
                                                    value={
                                                        <Stack direction="row" gap={1} alignItems="center">
                                                            <Typography
                                                                variant="body2"
                                                                component="a"
                                                                href={record.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                sx={{
                                                                    color: theme.palette.primary.main,
                                                                    textDecoration: 'none',
                                                                    wordBreak: 'break-all',
                                                                    display: '-webkit-box',
                                                                    overflow: 'hidden',
                                                                    WebkitBoxOrient: 'vertical',
                                                                    WebkitLineClamp: 1,
                                                                    '&:hover': {
                                                                        textDecoration: 'underline'
                                                                    }
                                                                }}
                                                            >
                                                                {record.url}
                                                            </Typography>
                                                            <IconButton
                                                                onClick={() => {
                                                                    console.log('copy url', record.url);
                                                                    handleCopy(record.url || 'copy failed');
                                                                }}
                                                            >
                                                                <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                                                            </IconButton>
                                                        </Stack>
                                                    }
                                                    enableCopy={false}
                                                />
                                            )}



                                            {/* 设备 */}
                                            <DetailRow
                                                icon={<DevicesIcon fontSize="small" />}
                                                label={t('history.detail.device')}
                                                value={record.deviceName}
                                                onCopy={handleCopy}
                                            />
                                            {/* 发送时间 */}
                                            <DetailRow
                                                icon={<ScheduleIcon fontSize="small" />}
                                                label={t('history.detail.time')}
                                                value={record.createdAt}
                                                tooltip={parameters.timezone}
                                                onCopy={handleCopy}
                                            />
                                        </Stack>

                                        <Divider >
                                            <Typography sx={{ my: 1, fontSize: '0.625rem' }}>
                                                更多信息
                                            </Typography>
                                        </Divider>


                                        {/* 响应信息 */}
                                        {record.responseJson.message.startsWith('utils.api.') === false
                                            && <DetailRow
                                                icon={<LinkIcon fontSize="small" />}
                                                label={t('history.detail.response')}
                                                value={record.responseJson.message}
                                                enableCopy={false}
                                            />}
                                        <StatusChip record={record} />
                                        {/* 请求参数 */}
                                        {displayParameters && (
                                            <Box>
                                                <Typography
                                                    variant="body2"
                                                    fontWeight={500}
                                                    sx={{
                                                        mb: 1,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 1,
                                                        color: theme.palette.text.secondary
                                                    }}
                                                >
                                                    <CodeIcon fontSize="small" />
                                                    {t('history.detail.parameters')}
                                                </Typography>

                                                <Box sx={{ position: 'relative' }}>
                                                    <TextField
                                                        value={JSON.stringify(displayParameters, null, 2)}
                                                        multiline
                                                        fullWidth
                                                        minRows={3}
                                                        maxRows={15}
                                                        slotProps={{
                                                            input: {
                                                                style: {
                                                                    fontFamily: 'monospace',
                                                                    fontSize: '0.75rem',
                                                                    overflow: 'auto',
                                                                }
                                                            }
                                                        }}
                                                    />
                                                    <Box sx={{ position: 'absolute', right: 0, top: '-2rem' }}>
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => {
                                                                handleCopy(JSON.stringify(displayParameters, null, 2));
                                                            }}
                                                        >
                                                            <ContentCopyIcon sx={{ fontSize: '0.875rem' }} />
                                                        </IconButton>
                                                    </Box>
                                                </Box>
                                                {/* 重新生成加密按钮 */}
                                                {record.isEncrypted && (
                                                    <Button
                                                        variant="outlined"
                                                        size="small"
                                                        onClick={() => {
                                                            encryptParameters(parameters);
                                                        }}
                                                        sx={{ mt: 1 }}
                                                    >
                                                        {t('history.detail.recreate_encrypted_btn')}
                                                    </Button>

                                                )}
                                            </Box>
                                        )}

                                        {/* 重新生成的加密数据 */}
                                        {encryptedData && (
                                            <Box>
                                                <Typography
                                                    variant="body2"
                                                    fontWeight={500}
                                                    sx={{
                                                        mb: 1,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 1,
                                                        color: theme.palette.text.secondary
                                                    }}
                                                >
                                                    <CodeIcon fontSize="small" />
                                                    {t('history.detail.recreate_encrypted_data')}
                                                </Typography>

                                                <Box sx={{ position: 'relative' }}>
                                                    <TextField
                                                        value={JSON.stringify(encryptedData, null, 2)}
                                                        multiline
                                                        fullWidth
                                                        minRows={3}
                                                        maxRows={10}
                                                        slotProps={{
                                                            input: {
                                                                style: {
                                                                    fontFamily: 'monospace',
                                                                    fontSize: '0.75rem',
                                                                    overflow: 'auto',
                                                                }
                                                            }
                                                        }}
                                                    />
                                                    {/* 拷贝按钮 */}
                                                    <Box sx={{ position: 'absolute', right: 0, top: '-2rem' }}>
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => {
                                                                handleCopy(JSON.stringify(encryptedData, null, 2));
                                                            }}
                                                        >
                                                            <ContentCopyIcon sx={{ fontSize: '0.75rem' }} />
                                                        </IconButton>
                                                    </Box>
                                                </Box>
                                            </Box>
                                        )}

                                        {/* 认证信息 */}
                                        {record.authorization && (
                                            <Box>
                                                <Typography
                                                    variant="body2"
                                                    fontWeight={500}
                                                    sx={{
                                                        mb: 1,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 1,
                                                        color: theme.palette.text.secondary
                                                    }}
                                                >
                                                    <CodeIcon fontSize="small" />
                                                    {t('history.detail.authorization')}
                                                </Typography>

                                                <TextField
                                                    value={JSON.stringify({
                                                        user: record.authorization.user,
                                                        pwd: record.authorization.pwd,
                                                        // 隐藏密码，只显示掩码
                                                        // pwd: '*'.repeat(record.authorization.pwd.length)
                                                    }, null, 2)}
                                                    multiline
                                                    fullWidth
                                                    minRows={3}
                                                    maxRows={21}
                                                    slotProps={{
                                                        input: {
                                                            style: {
                                                                fontFamily: 'monospace',
                                                                fontSize: '0.75rem',
                                                                overflow: 'auto',
                                                            }
                                                        }
                                                    }}
                                                />
                                            </Box>
                                        )}

                                        {/* 详情信息结束 */}
                                    </Stack>
                                </IsolatedContainer>
                            </Box>
                        </Card>
                    </Box>
                </Slide>
            </Box>
            <Snackbar
                open={copySuccessOpen}
                autoHideDuration={1000}
                onClose={() => setCopySuccessOpen(false)}
                message="拷贝成功"
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                slotProps={{
                    root: {
                        sx: {
                            zIndex: 9999
                        }
                    }
                }}
            />
            {/* 撤回结果提示 */}
            <Snackbar
                open={recallResultOpen}
                autoHideDuration={3000}
                onClose={() => setRecallResultOpen(false)}
                message={t('push.recall.success')}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                slotProps={{
                    root: {
                        sx: {
                            zIndex: 9999,
                            '& .MuiSnackbarContent-root': {
                                backgroundColor: recallResult?.type === 'success'
                                    ? theme.palette.warning.main
                                    : theme.palette.error.main
                            }
                        }
                    }
                }}
            />
        </>
    );

    return createPortal(modalContent, portalRoot.current);
}
