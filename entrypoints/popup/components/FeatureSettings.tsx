import React from 'react';
import {
    Box,
    Typography,
    Stack,
    Paper,
    FormControlLabel,
    Switch,
    Divider,
    Chip
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../contexts/AppContext';
import AvatarSetting from './AvatarSetting';
import FaviconSetting from './FaviconSetting';
import SpeedModeSetting from './SpeedModeSetting';
import { DEFAULT_ADVANCED_PARAMS } from '../utils/settings';

interface FeatureSettingsProps {
    devices: any[];
    onError: (error: string) => void;
    onToast: (message: string) => void;
}

export default function FeatureSettings({ devices, onError, onToast }: FeatureSettingsProps) {
    const { t } = useTranslation();
    const { appSettings, updateAppSetting } = useAppContext();

    const handleContextMenuToggle = async (enabled: boolean) => {
        try {
            await updateAppSetting('enableContextMenu', enabled);
        } catch (error) {
            onError(t('common.error_update', { message: error instanceof Error ? error.message : '未知错误' }));
        }
    };

    // 处理右键解析网页内容开关切换
    const handleInspectSendToggle = async (enabled: boolean) => {
        try {
            await updateAppSetting('enableInspectSend', enabled);
        } catch (error) {
            onError(t('common.error_update', { message: error instanceof Error ? error.message : '未知错误' }));
        }
    };

    // 处理简化处理开关切换
    const handleSimplifiedProcessingToggle = async (enabled: boolean) => {
        try {
            await updateAppSetting('enableSimplifiedProcessing', enabled);
        } catch (error) {
            onError(t('common.error_update', { message: error instanceof Error ? error.message : '未知错误' }));
        }
    };

    // 处理完整参数配置开关切换
    const handleAdvancedParamsToggle = async (enabled: boolean) => {
        try {
            await updateAppSetting('enableAdvancedParams', enabled);

            if (enabled) {
                onToast(t('settings.advanced_params.success_message'));
            } else {
                // 关闭时，重置参数配置为默认值
                const defaultParamsJson = JSON.stringify(DEFAULT_ADVANCED_PARAMS, null, 2);
                await updateAppSetting('advancedParamsJson', defaultParamsJson);
                onToast(t('settings.advanced_params.reset_message'));
            }
        } catch (error) {
            onError(t('common.error_update', { message: error instanceof Error ? error.message : '未知错误' }));
        }
    };

    // 处理 API v2 开关切换
    const handleApiV2Toggle = async (enabled: boolean) => {
        try {
            await updateAppSetting('enableApiV2', enabled);
        } catch (error) {
            onError(t('common.error_update', { message: error instanceof Error ? error.message : '未知错误' }));
        }
    };

    // 处理"发送此页面链接"按钮开关切换
    const handlePageLinkButtonToggle = async (enabled: boolean) => {
        try {
            await updateAppSetting('enablePageLinkButton', enabled);
        } catch (error) {
            onError(t('common.error_update', { message: error instanceof Error ? error.message : '未知错误' }));
        }
    };

    return (
        <Paper elevation={2} sx={{ p: 3 }}>
            <Stack spacing={3}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TuneIcon fontSize="small" />
                    {/* 功能设置 */}
                    {t('settings.features.title')}
                </Typography>
                <Box>
                    <Typography variant="subtitle1" gutterBottom>
                        {/* 右键菜单 */}
                        {t('settings.context_menu.title')}
                    </Typography>
                    <FormControlLabel
                        control={
                            <Switch
                                disabled={devices.length === 0}
                                checked={appSettings?.enableContextMenu || false}
                                onChange={(e) => handleContextMenuToggle(e.target.checked)}
                                color='primary'
                            />
                        }
                        label={t('settings.context_menu.enable')}
                        sx={{ userSelect: 'none' }}
                    />
                    {appSettings?.enableContextMenu && (
                        <FormControlLabel
                            control={
                                <Switch
                                    disabled={devices.length === 0}
                                    checked={appSettings?.enableInspectSend || false}
                                    onChange={(e) => handleInspectSendToggle(e.target.checked)}
                                    color='warning'
                                />
                            }
                            label={t('settings.context_menu.enable_inspect_send')}
                            sx={{ userSelect: 'none' }}
                        />
                    )}
                    {appSettings?.enableContextMenu && (
                        <FormControlLabel
                            control={
                                <Switch
                                    disabled={devices.length === 0}
                                    checked={appSettings?.enableSimplifiedProcessing ?? false}
                                    onChange={(e) => handleSimplifiedProcessingToggle(e.target.checked)}
                                    color='primary'
                                />
                            }
                            label={t('settings.context_menu.enable_simplified_processing')}
                            sx={{ userSelect: 'none' }}
                        />
                    )}
                </Box>
                <Divider />
                <Box>
                    <Stack direction="column" alignItems="flex-start" gap={1}>

                        {/* 自定义头像 */}
                        <AvatarSetting />

                        {/* 网站图标设置 */}
                        {appSettings?.enableInspectSend &&
                            <FaviconSetting />}

                        {/* 启用极速模式 */}
                        <SpeedModeSetting disabled={devices.length === 0} />

                        {/* 显示"发送此页面链接"按钮 */}
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={appSettings?.enablePageLinkButton || false}
                                    onChange={(e) => handlePageLinkButtonToggle(e.target.checked)}
                                />
                            }
                            label={t('settings.page_link.enable')}
                            sx={{ userSelect: 'none' }}
                        />

                        {/* 启用完整的参数配置 */}
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={appSettings?.enableAdvancedParams || false}
                                    onChange={(e) => handleAdvancedParamsToggle(e.target.checked)}
                                />
                            }
                            // label="启用完整的参数配置"
                            label={t('settings.advanced_params.enable')}
                            sx={{ userSelect: 'none' }}
                        />
                        <Divider sx={{ pt: 1 }} />

                        {/* API v2 开关 */}
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={appSettings?.enableApiV2 || false}
                                    onChange={(e) => handleApiV2Toggle(e.target.checked)}
                                />
                            }
                            label={<Stack direction="row" alignItems="center" gap={1}>
                                <Typography variant="body1">{t('settings.api_v2.title')}</Typography>
                                {/* <Chip label="Beta" size="small" color="default" variant="outlined" /> */}
                            </Stack>}
                            sx={{ userSelect: 'none' }}
                        />
                    </Stack>
                </Box>
            </Stack>
        </Paper>
    );
}
