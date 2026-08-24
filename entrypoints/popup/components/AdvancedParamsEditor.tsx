import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Typography,
    Stack,
    TextField,
    Select,
    MenuItem,
    Slider,
    Box,
    InputLabel,
    FormControl,
    ClickAwayListener,
    useTheme,
    Chip,
    Divider,
} from '@mui/material';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeDownIcon from '@mui/icons-material/VolumeDown';
import VolumeMuteIcon from '@mui/icons-material/VolumeMute';
import { useAppContext } from '../contexts/AppContext';
import gsap from 'gsap';
import { DEFAULT_ADVANCED_PARAMS } from '../utils/settings';
import { useTranslation } from 'react-i18next';

interface AdvancedParamsEditorProps {
    onChange?: (params: Record<string, any> | undefined) => void;
    paperRef?: React.RefObject<HTMLDivElement | null>; // 匹配 SendPush 中的 ref
}

interface ParamConfig {
    key: string;
    value: string;
    description: string;
    type: 'text' | 'select' | 'slider' | 'number'; // text 为输入框, select 为下拉框, slider 为滑块, number 为正整数
    options?: Array<{ value: string; label: string }>;
    min?: number;
    max?: number;
    step?: number;
}

const AdvancedParamsEditor: React.FC<AdvancedParamsEditorProps> = ({ onChange, paperRef }) => {
    const { appSettings, updateAppSetting } = useAppContext();
    const { t } = useTranslation();
    const [params, setParams] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [modifiedParams, setModifiedParams] = useState<string[]>([]);
    const paramRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [isDirty, setIsDirty] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [selectOpen, setSelectOpen] = useState<string | null>(null); // 用于跟踪当前打开的 select 下拉框
    const saveTimeoutRef = useRef<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const drawerRef = useRef<HTMLDivElement>(null);
    const theme = useTheme();

    const paramConfigs: ParamConfig[] = [
        { "key": "title", "value": "", "description": "推送标题", "type": "text" },
        { "key": "subtitle", "value": "", "description": "推送副标题", "type": "text" },
        { "key": "image", "value": "", "description": "推送图片地址，支持 URL 图片地址", "type": "text" },
        {
            "key": "level",
            "value": "",
            "description": "推送中断级别。 critical: 重要警告, 在静音模式下也会响铃 active：默认值，系统会立即亮屏显示通知 timeSensitive：时效性通知，可在专注状态下显示通知。 passive：仅将通知添加到通知列表，不会亮屏提醒。",
            "type": "select",
            "options": [
                { "value": "", "label": "not_set" },
                { "value": "critical", "label": "critical" },
                { "value": "active", "label": "active" },
                { "value": "timeSensitive", "label": "timeSensitive" },
                { "value": "passive", "label": "passive" }
            ]
        },
        {
            "key": "volume",
            "value": "5",
            "description": "重要警告的通知音量，取值范围：0-10，不传默认值为5",
            "type": "slider",
            "min": 0,
            "max": 10,
            "step": 1
        },
        { "key": "badge", "value": "", "description": "推送角标，可以是任意数字", "type": "text" },
        {
            "key": "call",
            "value": "",
            "description": "传\"1\"时，通知铃声重复播放",
            "type": "select",
            "options": [
                { "value": "", "label": "not_set" },
                { "value": "1", "label": "1" },
                { "value": "0", "label": "0" }
            ]
        },
        {
            "key": "autoCopy",
            "value": "1",
            "description": "传\"1\"时， iOS14.5以下自动复制推送内容，iOS14.5以上需手动长按推送或下拉推送",
            "type": "select",
            "options": [
                { "value": "", "label": "not_set" },
                { "value": "1", "label": "1" },
                { "value": "0", "label": "0" }
            ]
        },
        { "key": "copy", "value": "", "description": "复制推送时，指定复制的内容，不传此参数将复制整个推送内容。", "type": "text" },
        { "key": "group", "value": "", "description": "对消息进行分组，推送将按group分组显示在通知中心中。 也可在历史消息列表中选择查看不同的群组。", "type": "text" },
        {
            "key": "isArchive",
            "value": "",
            "description": "传 1 保存推送，传其他的不保存推送，不传按APP内设置来决定是否保存。",
            "type": "select",
            "options": [
                { "value": "", "label": "not_set" },
                { "value": "1", "label": "1" },
                { "value": "0", "label": "0" }
            ]
        },
        {
            "key": "action", "value": "", "description": "传 \"none\" 时，点击推送不会弹窗", "type": "select", "options": [
                { "value": "", "label": "not_set" },
                { "value": "none", "label": "none" }
            ]
        },
        {
            "key": "ttl",
            "value": "",
            "description": "代表保存推送的有效期，单位为秒。仅对保存到历史记录的消息生效，到期后会自动删除；如果通知中心里仍有对应通知，也会一并删除。",
            "type": "number",
            "min": 1,
            "step": 1
        }
    ];

    useEffect(() => {
        if (appSettings?.advancedParamsJson) {
            try {
                const savedParams = JSON.parse(appSettings.advancedParamsJson);
                // 将保存的参数与默认配置合并
                const initialParams: Record<string, string> = {};
                const modified: string[] = [];

                paramConfigs.forEach(config => {
                    initialParams[config.key] = savedParams[config.key] !== undefined ?
                        String(savedParams[config.key]) : config.value;

                    // 检查是否是修改过的参数, 统一转为字符串进行比较
                    if (savedParams[config.key] !== undefined) {
                        const savedValueStr = String(savedParams[config.key]).trim();
                        const defaultValueStr = String(config.value).trim();

                        if (savedValueStr !== defaultValueStr) {
                            modified.push(config.key);
                        }
                    }
                });

                setParams(initialParams);
                setModifiedParams(modified);
                setLoading(false);
                // 通知父组件初始值
                notifyParentComponent(initialParams);
            } catch (error) {
                console.error('解析自定义参数失败:', error);
                initDefaultParams(); // 初始化为默认值
                setLoading(false);
            }
        } else {
            initDefaultParams(); // 初始化为默认值
        }

        // 组件卸载时保存数据
        return () => {
            if (isDirty) {
                saveParamsToSettings(params);
            }
            if (saveTimeoutRef.current !== null) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [appSettings?.advancedParamsJson]);

    // 初始化默认参数
    const initDefaultParams = () => {
        const defaultParams: Record<string, string> = {};
        paramConfigs.forEach(config => {
            defaultParams[config.key] = config.value;
        });
        setParams(defaultParams);
        setModifiedParams([]);
        // 通知父组件初始值
        notifyParentComponent(defaultParams);
    };

    // 处理参数变化
    const handleParamChange = (key: string, value: string) => {
        const config = paramConfigs.find(item => item.key === key);
        // ttl 仅允许空值或大于 0 的正整数
        if (config?.type === 'number' && value !== '' && !/^[1-9]\d*$/.test(value)) {
            return;
        }

        // 查找对应的默认值
        const defaultValue = paramConfigs.find(config => config.key === key)?.value || '';

        // 检查是否是修改过的值
        // 统一转为字符串并去除空格进行比较
        const valueStr = String(value).trim();
        const defaultValueStr = String(defaultValue).trim();

        if (valueStr !== defaultValueStr) {
            if (!modifiedParams.includes(key)) {
                setModifiedParams(prev => [...prev, key]);
            }
        } else {
            // 如果值恢复默认，从修改列表中移除
            setModifiedParams(prev => prev.filter(item => item !== key));
        }
        const newParams = { ...params, [key]: value };
        setParams(newParams);
        setIsDirty(true);

        // 通知父组件
        notifyParentComponent(newParams);

        // 清除之前的定时器
        if (saveTimeoutRef.current !== null) {
            clearTimeout(saveTimeoutRef.current);
        }

        // 设置新的定时器，延迟保存
        saveTimeoutRef.current = window.setTimeout(() => {
            saveParamsToSettings(newParams);
            setIsDirty(false);
            saveTimeoutRef.current = null;
        }, 1000); // 1秒后保存
    };

    // 处理滑块变化
    const handleSliderChange = (key: string, value: number) => {
        handleParamChange(key, value.toString());
    };

    // 处理失去焦点事件
    const handleBlur = useCallback(() => {
        if (isDirty) {
            // 清除之前的定时器
            if (saveTimeoutRef.current !== null) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }

            // 立即保存
            saveParamsToSettings(params);
            setIsDirty(false);
        }
    }, [params, isDirty]);

    // 处理打开抽屉
    const handleOpen = () => {
        setIsOpen(true);

        // 创建动画时间线，同时执行多个动画
        const tl = gsap.timeline({
            defaults: {
                duration: 0.2, // 更快的动画
                ease: "back.out(1.5)" // 使用弹性缓动效果
            }
        });

        // 添加Paper缩小动画
        if (paperRef?.current) {
            tl.to(paperRef.current, {
                scale: 0.96, // 略微减小缩放比例
                duration: 0.15, // 更快的缩放
                x: -9, // 向左偏移6px
                opacity: 0.7,
                ease: "back.out(1.2)", // 更自然的弹性效果
                border: 'none'
            }, 0); // 0表示与时间线开始同时执行
        }

        // 添加Drawer滑入动画
        if (drawerRef.current) {
            tl.fromTo(drawerRef.current,
                {
                    right: "-100%",
                    opacity: 0.7
                },
                {
                    right: 0,
                    opacity: 1,
                    duration: 0.25, // 略微延长以完成弹性效果
                    ease: "power4.out" // 更强的加速度
                },
                0 // 与缩放同时开始
            );
        }
    };

    // 处理关闭抽屉
    const handleClose = () => {
        if (isDirty) {
            saveParamsToSettings(params);
            setIsDirty(false);
        }

        // 创建动画时间线，同时执行多个动画
        const tl = gsap.timeline({
            defaults: {
                duration: 0.15, // 更快的动画
                ease: "power2.in" // 使用更快的缓动效果
            },
            onComplete: () => setIsOpen(false) // 动画完成后设置状态
        });

        // 添加Paper恢复动画
        if (paperRef?.current) {
            tl.to(paperRef.current, {
                scale: 1,
                x: 0, // 恢复原始位置
                opacity: 1,
                border: `1.2px solid ${theme.palette.divider}`,
                duration: 0.2, // 稍微延长恢复动画
                ease: "power1.out" // 平滑的恢复
            }, 0); // 0表示与时间线开始同时执行
        }

        // 添加Drawer滑出动画
        if (drawerRef.current) {
            tl.to(drawerRef.current, {
                right: "-100%",
                opacity: 0.8,
                duration: 0.15 // 快速滑出
            }, 0); // 与恢复同时开始
        }
    };

    // 保存参数到设置
    const saveParamsToSettings = async (newParams: Record<string, string>) => {
        if (appSettings) {
            try {
                await updateAppSetting('advancedParamsJson', JSON.stringify(newParams, null, 2));
                console.log('参数已保存');
            } catch (error) {
                console.error('保存参数设置失败:', error);
            }
        }
    };

    // 通知父组件, 过滤掉空值
    const notifyParentComponent = (newParams: Record<string, string>) => {
        if (onChange) {
            const filteredParams = Object.entries(newParams)
                .filter(([_, value]) => value !== '')
                .reduce((obj, [key, value]) => {
                    obj[key] = value;
                    return obj;
                }, {} as Record<string, string>);

            // 如果没有有效参数返回 undefined
            const result = Object.keys(filteredParams).length > 0 ? filteredParams : undefined;
            onChange(result);
        }
    };

    const getVolumeIcon = (value: string) => {
        const numValue = parseInt(value) || 0;
        if (numValue === 0) return <VolumeMuteIcon fontSize="small" />;
        if (numValue <= 5) return <VolumeDownIcon fontSize="small" />;
        return <VolumeUpIcon fontSize="small" />;
    };

    // 判断是否可以关 Drawer
    const canCloseDrawer = () => {
        // 如果有 select 下拉框打开，则不能关闭抽屉
        return !selectOpen;
    };

    // 滚动到指定参数位置
    const scrollToParam = (key: string) => {
        if (paramRefs.current[key]) {
            paramRefs.current[key]?.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    };

    // 将参数重置为默认值, 并滚动到参数位置
    const resetParamToDefault = (key: string) => {
        const defaultValue = paramConfigs.find(config => config.key === key)?.value || '';
        handleParamChange(key, defaultValue);

        // 滚动到参数位置
        setTimeout(() => scrollToParam(key), 300);
    };

    // 渲染参数输入控件
    const renderParamInput = (config: ParamConfig) => {
        switch (config.type) {
            case 'slider':
                return (
                    <Stack
                        key={config.key}
                        spacing={0.5}
                        sx={{ mb: 1 }}
                        ref={(el) => { paramRefs.current[config.key] = el; return undefined; }}
                        id={`param-${config.key}`}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {config.key}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto' }}>
                                {getVolumeIcon(params[config.key] || '5')}
                                <Typography variant="body2" sx={{ ml: 0.5, minWidth: 16, textAlign: 'right' }}>
                                    {params[config.key] || '5'}
                                </Typography>
                            </Box>
                        </Box>
                        <Slider
                            size="small"
                            value={parseInt(params[config.key] || '5')}
                            onChange={(_, value) => handleSliderChange(config.key, value as number)}
                            onChangeCommitted={handleBlur}
                            min={config.min || 0}
                            max={config.max || 10}
                            step={config.step || 1}
                            marks={false}
                            sx={{ py: 0.5, pt: 0 }}
                        />
                        <Typography variant="caption" color="text.secondary" fontSize={'0.625rem'}>
                            {t(`push.advanced_params.p_${config.key}`)}
                        </Typography>
                    </Stack>
                );
            case 'select':
                return (
                    <Stack
                        key={config.key}
                        spacing={0.5}
                        sx={{ mb: 1 }}
                        ref={(el) => { paramRefs.current[config.key] = el; return undefined; }}
                        id={`param-${config.key}`}>
                        <FormControl
                            fullWidth
                            size="small"
                            variant="standard"
                        >
                            <InputLabel id={`${config.key}-label`}>{config.key}</InputLabel>
                            <Select
                                labelId={`${config.key}-label`}
                                value={params[config.key] || ''}
                                label={config.key}
                                onChange={(e) => {
                                    handleParamChange(config.key, e.target.value);
                                    // 选择后关闭下拉
                                    setSelectOpen(null);
                                }}
                                open={selectOpen === config.key}
                                onOpen={() => {
                                    setSelectOpen(config.key);
                                }}
                                onClose={() => {
                                    setSelectOpen(null);
                                }}
                                MenuProps={{
                                    // 禁用自动关闭, 防止点击后自动关闭
                                    disableAutoFocusItem: true,
                                    // 自定义样式, 确保下拉菜单在抽屉内部显示
                                    PaperProps: {
                                        style: {
                                            zIndex: 1500, // 确保菜单在最上层
                                        }
                                    }
                                }}
                            >
                                {config.options?.map((option) => (
                                    <MenuItem
                                        key={option.value}
                                        value={option.value}
                                    >
                                        {t(`push.advanced_params.${option.label}`)}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Typography variant="caption" color="text.secondary" fontSize={'0.625rem'}>
                            {t(`push.advanced_params.p_${config.key}`)}
                        </Typography>
                    </Stack>
                );
            case 'number':
                return (
                    <Stack
                        key={config.key}
                        spacing={0.5}
                        sx={{ mb: 1 }}
                        ref={(el) => { paramRefs.current[config.key] = el; return undefined; }}
                        id={`param-${config.key}`}>
                        <TextField
                            label={config.key}
                            value={params[config.key] || ''}
                            onChange={(e) => handleParamChange(config.key, e.target.value)}
                            onBlur={handleBlur}
                            size="small"
                            variant="standard"
                            type="number"
                            inputProps={{
                                min: config.min ?? 1,
                                step: config.step ?? 1
                            }}
                            sx={{ minHeight: 32 }}
                        />
                        <Typography variant="caption" color="text.secondary" fontSize={'0.625rem'}>
                            {t(`push.advanced_params.p_${config.key}`)}
                        </Typography>
                    </Stack>
                );
            case 'text':
            default:
                return (
                    <Stack
                        key={config.key}
                        spacing={0.5}
                        sx={{ mb: 1 }}
                        ref={(el) => { paramRefs.current[config.key] = el; return undefined; }}
                        id={`param-${config.key}`}>
                        <TextField
                            label={config.key}
                            value={params[config.key] || ''}
                            onChange={(e) => handleParamChange(config.key, e.target.value)}
                            onBlur={handleBlur}
                            size="small"
                            variant="standard"
                            sx={{ minHeight: 32 }}
                        />
                        <Typography variant="caption" color="text.secondary" fontSize={'0.625rem'}>
                            {t(`push.advanced_params.p_${config.key}`)}
                        </Typography>
                    </Stack>
                );
        }
    };

    // 如果未启用自定义参数, 不渲染任何内容
    if (!appSettings?.enableAdvancedParams) {
        return null;
    }

    return (
        <ClickAwayListener onClickAway={(e) => {
            // 只有在可以安全关闭抽屉的情况下才关闭
            if (isOpen && canCloseDrawer()) {
                handleClose();
            }
        }}>
            <Box ref={containerRef} sx={{ position: 'relative' }}>
                {/* 触发把手区域 */}
                <Box
                    component="div"
                    title={t('common.open') + ' - ' + t('push.advanced_params.title')}
                    onClick={handleOpen}
                    sx={{
                        position: 'fixed',
                        top: '50%',
                        right: '0',
                        transform: 'translateY(-50%)',
                        height: '132px',
                        width: '27px',
                        zIndex: 9,
                        cursor: 'pointer',
                        display: isOpen ? 'none' : 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        '&:hover': {
                            '& > div': {
                                width: '14px',
                                backgroundColor: 'primary.dark'
                            }
                        }
                    }}
                >
                    {/* 实际可见的触发把手 */}
                    <Box
                        component="div"
                        sx={{
                            backgroundColor: 'primary.main',
                            color: theme.palette.primary.contrastText,
                            width: '8px',
                            height: '80px',
                            borderRadius: '6px 0 0 6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            '&:hover': {
                                backgroundColor: 'primary.dark',
                                width: '14px'
                            },
                            boxShadow: 2,
                            transition: 'width 0.2s',
                            zIndex: 10
                        }}
                    >
                        <Box
                            component="div"
                            sx={{
                                width: '2px',
                                height: '30px',
                                backgroundColor: theme.palette.primary.contrastText,
                                opacity: 0.8
                            }}
                        />
                    </Box>
                </Box>

                {/* 抽屉 */}
                <Box
                    ref={drawerRef}
                    sx={{
                        position: 'fixed',
                        right: isOpen ? 0 : '-100%',
                        bottom: 56 + 16, // 底部导航栏高度 + 16px
                        width: 'calc(100% * 0.78)',
                        height: 'calc(100% - 56px - 56px - 16px - 16px)', // 减去 App Bar 高度, 底部导航栏高度和上下各 16px
                        bgcolor: 'background.paper',
                        border: `1.2px solid ${theme.palette.divider}`,
                        boxShadow: 3,
                        zIndex: 1000,
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: '14px 0 0 14px',
                        top: 56 + 16, // AppBar 高度 + 16px
                        opacity: isOpen ? 1 : 0.7,
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                >
                    {/* 关闭把手区域 */}
                    <Box
                        component="div"
                        onClick={handleClose}
                        title={t('common.close')}
                        sx={{
                            position: 'absolute',
                            left: '-8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            height: '132px',
                            width: '27px',
                            zIndex: 9,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            // backgroundColor: 'divider',
                            '&:hover': {
                                '& > div': {
                                    width: '14px',
                                    backgroundColor: 'primary.dark',
                                    // left: '1px'
                                }
                            }
                        }}
                    >
                        {/* 实际可见的关闭把手 */}
                        <Box
                            component="div"
                            sx={{
                                position: 'absolute',
                                left: '4px',
                                bgcolor: 'primary.main',
                                color: theme.palette.primary.contrastText,
                                width: '8px',
                                height: '80px',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                '&:hover': {
                                    bgcolor: 'primary.dark',
                                },
                                boxShadow: 2,
                                transition: 'width 0.2s, left 0.2s'
                            }}
                        >
                            <Box
                                component="div"
                                sx={{
                                    width: '2px',
                                    height: '30px',
                                    backgroundColor: theme.palette.primary.contrastText,
                                    opacity: 0.8
                                }}
                            />
                        </Box>
                    </Box>
                    {/* 抽屉头部 */}
                    <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        py: 1,
                        borderBottom: `1px solid ${theme.palette.divider}`
                    }}>
                        <Typography variant="h6" sx={{ flexGrow: 1, textAlign: 'center' }}>
                            {/* 自定义参数 */}
                            {t(`push.advanced_params.title`)}
                        </Typography>
                    </Box>

                    {/* 抽屉内容 */}
                    <Box sx={{
                        flex: 1,
                        overflowY: 'auto',
                        p: 2.5,
                        py: 3,
                        pb: modifiedParams.length > 0 ? 10 : 3, // 因为底部有标签区域, 如果有修改的参数, 增加底部内边距
                    }}
                        onClick={(e) => {
                            e.stopPropagation();
                        }}
                    >
                        <Stack spacing={1} onBlur={handleBlur}>
                            {paramConfigs.map((config) => renderParamInput(config))}
                        </Stack>
                        <Stack sx={{
                            mt: 6,
                            opacity: 0.8
                        }}>
                            <Typography variant="caption" color="text.secondary" fontSize={'0.625rem'}>
                                {t(`push.advanced_params.tips`)}
                            </Typography>
                            <Divider />
                            {/* 铃声和加密参数请点击底部导航栏的 "修改配置", 在这里修改的参数会立即生效。 */}
                            <Typography variant="caption" color="text.secondary" fontSize={'0.625rem'}>
                                - {t(`push.advanced_params.tips_1`)}
                            </Typography>
                            {/* 底部的标签为已修改的参数, 点击可以跳转, 右键可以进行重置。 */}
                            <Typography variant="caption" color="text.secondary" fontSize={'0.625rem'}>
                                - {t(`push.advanced_params.tips_2`)}
                            </Typography>
                            {/* 部分参数需要组合使用, 例如: 音量需要配合重要警告, 活跃, 时效性的级别才可生效。 */}
                            <Typography variant="caption" color="text.secondary" fontSize={'0.625rem'}>
                                - {t(`push.advanced_params.tips_5`)}
                            </Typography>
                        </Stack>
                    </Box>

                    {/* 已修改参数标签区域 */}
                    {modifiedParams.length > 0 && (
                        <Box sx={{
                            position: 'absolute',
                            borderRadius: 'inherit',
                            borderTopLeftRadius: 0,
                            bottom: 0,
                            left: 0,
                            right: 0,
                            bgcolor: 'background.paper',
                            borderTop: `1px solid ${theme.palette.divider}`,
                            px: 1,
                            py: 0.5,
                            zIndex: 10,
                            opacity: 0.9,
                            boxShadow: '0px -2px 4px rgba(0,0,0,0.05)'
                        }}>
                            <Box sx={{
                                width: '100%',
                                display: 'flex',
                                gap: 0.5,
                                overflowX: 'auto',
                                p: .6,
                                /* 隐藏横向滚动条 */
                                '&::-webkit-scrollbar': {
                                    display: 'none',
                                },
                                /* Firefox */
                                scrollbarWidth: 'none',
                            }}>
                                {modifiedParams.map(key => (
                                    <Chip
                                        key={key}
                                        label={key}
                                        size="small"
                                        color="success"
                                        variant="outlined"
                                        onClick={() => scrollToParam(key)}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            resetParamToDefault(key);
                                        }}
                                        // 点击跳转到参数 | 右键重置为默认值
                                        title={t(`push.advanced_params.tips_3`)}
                                        sx={{
                                            height: 20,
                                            '& .MuiChip-label': { px: 0.8, py: 0 },
                                            flexShrink: 0,
                                            cursor: 'pointer'
                                        }}
                                    />
                                ))}
                            </Box>
                        </Box>
                    )}
                </Box>
            </Box>
        </ClickAwayListener>
    );
};

export default AdvancedParamsEditor; 