import React, { useState, useEffect } from 'react';
import {
    Box,
    Button,
    Typography,
    Alert,
    Stack,
    Paper,
    IconButton,
    List,
    ListItem,
    ListItemText,
    Radio,
    FormControlLabel,
    Switch,
    Link,
    Tooltip,
    LinearProgress,
    Snackbar,
    Chip,
    Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import DevicesIcon from '@mui/icons-material/Devices';
import InfoIcon from '@mui/icons-material/Info';
import GitHubIcon from '@mui/icons-material/GitHub';
import EmailIcon from '@mui/icons-material/Email';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SecurityIcon from '@mui/icons-material/Security';
import TuneIcon from '@mui/icons-material/Tune';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import CloudIcon from '@mui/icons-material/Cloud';

import StarBorderIcon from '@mui/icons-material/StarBorder';
import { useTranslation } from 'react-i18next';
import { Device, ThemeMode, FileStorageConfig } from '../types';
import { useAppContext } from '../contexts/AppContext';
import DeviceDialog from '../components/DeviceDialog';
import EncryptionDialog from '../components/EncryptionDialog';
import SoundDialog from '../components/SoundDialog';
import FileStorageDialog from '../components/FileStorageDialog';
import FeatureSettings from '../components/FeatureSettings';
// import OtherSettings from '../components/OtherSettings';
import OtherSettingsCard from '../components/OtherSettingsCard';
import BackupRestoreCard from '../components/BackupRestoreCard';
import { openGitHub, openBarkWebsite, openBarkApp, openStoreRating, } from '../utils/extension';


interface SettingsProps {
    devices: Device[];
    defaultDeviceId: string;
    onAddDevice: (alias: string, apiURL: string, authorization?: { type: 'basic'; user: string; pwd: string; value: string; }) => Promise<Device>;
    onEditDevice: (oldDeviceId: string, alias: string, apiURL: string, authorization?: { type: 'basic'; user: string; pwd: string; value: string; }) => Promise<Device>;
    onRemoveDevice: (deviceId: string) => Promise<void>;
    onSetDefaultDevice: (deviceId: string) => Promise<void>;
    themeMode: ThemeMode;
    onThemeChange: (mode: ThemeMode) => void;
    onSettingsChange?: () => void;
}

export default function Settings({
    devices,
    defaultDeviceId,
    onAddDevice,
    onEditDevice,
    onRemoveDevice,
    onSetDefaultDevice,
    themeMode,
    onThemeChange,
    onSettingsChange
}: SettingsProps) {
    const { t } = useTranslation();
    const { appSettings, updateAppSetting, updateEncryptionConfig } = useAppContext();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
    const [editingDevice, setEditingDevice] = useState<Device | undefined>();
    const [encryptionDialogOpen, setEncryptionDialogOpen] = useState(false);
    const [soundDialogOpen, setSoundDialogOpen] = useState(false);
    const [fileStorageDialogOpen, setFileStorageDialogOpen] = useState(false);
    // const [shortcutGuideAnchor, setShortcutGuideAnchor] = useState<HTMLElement | null>(null);
    const [toast, setToast] = useState<{ open: boolean, message: string }>({ open: false, message: '' });
    const [version, setVersion] = useState<string | null>(null);

    // 处理加密开关切换
    const handleEncryptionToggle = async (enabled: boolean) => {
        try {
            await updateAppSetting('enableEncryption', enabled);
            if (enabled) { // 如果开启加密，则打开加密配置
                setEncryptionDialogOpen(true);
                setToast({
                    open: true,
                    message: t('settings.encryption.tips_on')
                });
            }
        } catch (error) {
            // 更新加密设置失败: {{message}}
            setError(t('settings.encryption.errors.update_failed', { message: error instanceof Error ? error.message : '未知错误' }));
        }
    };

    // 处理加密配置保存
    const handleEncryptionConfigSave = async (config: any) => {
        try {
            await updateEncryptionConfig(config);
        } catch (error) {
            // 保存加密配置失败: {{message}}
            setError(t('settings.encryption.errors.config_save_failed', { message: error instanceof Error ? error.message : '未知错误' }));
        }
    };

    // 处理铃声保存
    const handleSoundSave = async (sound: string) => {
        try {
            await updateAppSetting('sound', sound || undefined);
        } catch (error) {
            // 保存铃声设置失败: {{message}}
            setError(t('common.error_update', { message: error instanceof Error ? error.message : '未知错误' }));
        }
    };

    const handleFileStorageToggle = async (enabled: boolean) => {
        try {
            if (enabled) {
                const config = appSettings?.fileStorageConfig;
                const hasValidConfig = config &&
                    config.endpoint &&
                    config.region &&
                    config.bucket &&
                    config.accessKeyId &&
                    config.secretAccessKey;

                if (hasValidConfig) {
                    // 如果已有有效配置，直接启用
                    await updateAppSetting('enableFileStorage', true);
                } else {
                    // 如果没有有效配置，打开配置对话框
                    setFileStorageDialogOpen(true);
                }
            } else {
                await updateAppSetting('enableFileStorage', false);
            }
        } catch (error) {
            setError(`更新文件存储设置失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    };

    // 处理文件存储配置保存
    const handleFileStorageConfigSave = async (config: FileStorageConfig) => {
        try {
            await updateAppSetting('fileStorageConfig', config);
            await updateAppSetting('enableFileStorage', true);
        } catch (error) {
            setError(`保存文件存储配置失败: ${error instanceof Error ? error.message : '未知错误'}`);
            throw error;
        }
    };

    // 处理文件存储对话框关闭
    const handleFileStorageDialogClose = () => {
        // 如果用户取消配置且之前没有启用文件存储，确保开关保持关闭状态
        setFileStorageDialogOpen(false);
    };

    const handleAddDevice = async (alias: string, apiURL: string, authorization?: { type: 'basic'; user: string; pwd: string; value: string; }) => {
        setLoading(true);
        setError('');
        try {
            await onAddDevice(alias, apiURL, authorization);
            onSettingsChange?.();
            setDeviceDialogOpen(false);
            setError('');
        } catch (error) {
            // setError(`添加设备失败: ${error instanceof Error ? error.message : '未知错误'}`);
            setError(t('common.add_device_failed', { message: error instanceof Error ? error.message : t('common.error_unknown') }));
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const handleEditDevice = async (alias: string, apiURL: string, authorization?: { type: 'basic'; user: string; pwd: string; value: string; }) => {
        if (!editingDevice) return;

        setLoading(true);
        setError('');
        try {
            await onEditDevice(editingDevice.id, alias, apiURL, authorization);
            setEditingDevice(undefined);
            onSettingsChange?.();
            setDeviceDialogOpen(false);
            setError('');
        } catch (error) {
            // setError(`编辑设备失败: ${error instanceof Error ? error.message : '未知错误'}`);
            setError(t('common.edit_device_failed', { message: error instanceof Error ? error.message : t('common.error_unknown') }));
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const handleRemove = async (deviceId: string) => {
        try {
            await onRemoveDevice(deviceId);
            onSettingsChange?.();
        } catch (error) {
            // setError(`删除设备失败: ${error instanceof Error ? error.message : '未知错误'}`);
            setError(t('common.delete_device_failed', { message: error instanceof Error ? error.message : t('common.error_unknown') }));
        }
    };

    const handleSetDefault = async (deviceId: string) => {
        try {
            await onSetDefaultDevice(deviceId);
            onSettingsChange?.();
        } catch (error) {
            // setError(`设置默认设备失败: ${error instanceof Error ? error.message : '未知错误'}`);
            setError(t('common.set_default_device_failed', { message: error instanceof Error ? error.message : t('common.error_unknown') }));
        }
    };

    useEffect(() => {
        try {
            const v = (window as any)?.chrome?.runtime?.getManifest?.()?.version ?? null;
            setVersion(v);
        } catch {
            setVersion(null);
        }
    }, []);

    return (
        <Box
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <Box
                sx={{
                    flex: 1,
                    overflowY: 'auto',
                    p: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    minHeight: 'min-content' // 确保内容可以撑开
                }}
            >
                {/* 顶部加载中进度条 绝对定位 */}
                {loading && <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000 }} />}
                {/* 设备管理卡片 */}
                <Paper elevation={2} sx={{ p: 3 }}>
                    <Stack spacing={3}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <DevicesIcon />
                                {/* 设备管理 */}
                                {t('device.title')}
                            </Typography>
                            <Button
                                variant="text"
                                startIcon={<AddIcon />}
                                onClick={() => {
                                    setEditingDevice(undefined);
                                    setDeviceDialogOpen(true);
                                }}
                                sx={{
                                    px: 1.2,
                                }}
                            >
                                {/* 添加设备 */}
                                {t('device.add')}
                            </Button>
                        </Box>

                        {error && (
                            <Alert severity="error" onClose={() => setError('')}>
                                {error}
                            </Alert>
                        )}

                        {/* 设备列表 */}
                        {devices.length > 0 ? (
                            <List>
                                {devices.map((device) => (
                                    <ListItem key={device.id} divider sx={{ padding: 0.5 }}>
                                        <ListItemText
                                            primary={
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <FormControlLabel
                                                        value={device.id}
                                                        control={
                                                            <Radio
                                                                checked={defaultDeviceId === device.id}
                                                                onChange={() => handleSetDefault(device.id)}
                                                                size="small"
                                                                sx={{
                                                                    padding: 0,
                                                                }}
                                                            />
                                                        }
                                                        label=""
                                                        sx={{ m: 0 }}
                                                    />
                                                    <Typography variant="body1">{device.alias}</Typography>
                                                </Box>
                                            }
                                            secondary={
                                                <Typography color="text.secondary" variant="caption" sx={{
                                                    display: 'inline-block',
                                                    maxWidth: '180px',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
                                                }}>{device.apiURL}</Typography>}
                                        />
                                        <Stack direction="row" gap={1}>
                                            <IconButton
                                                edge="end"
                                                aria-label="编辑"
                                                onClick={() => {
                                                    setEditingDevice(device);
                                                    setDeviceDialogOpen(true);
                                                }}
                                                sx={{ mr: 1 }}
                                            >
                                                <EditIcon />
                                            </IconButton>
                                            <IconButton
                                                edge="end"
                                                aria-label="删除"
                                                onClick={() => handleRemove(device.id)}
                                            >
                                                <DeleteIcon />
                                            </IconButton>
                                        </Stack>
                                    </ListItem>
                                ))}
                            </List>
                        ) : (
                            <Alert severity="info">
                                {/* 暂无设备，请点击"添加设备"按钮添加一个设备。 */}
                                {t('device.no_devices')}
                            </Alert>
                        )}
                    </Stack>
                </Paper>

                {/* 铃声设置卡片 */}
                <Paper elevation={2} sx={{ p: 3 }}>
                    <Stack spacing={3}>
                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <VolumeUpIcon />
                            {/* 铃声设置 */}
                            {t('settings.sound.title')}
                        </Typography>
                        <Stack direction="column" gap={2} >
                            <Button
                                variant="outlined"
                                size="small"
                                fullWidth
                                disabled={devices.length === 0}
                                onClick={() => setSoundDialogOpen(true)}
                                startIcon={<VolumeUpIcon />}
                                sx={{ alignSelf: 'flex-start' }}
                            >
                                {/* 选择铃声 */}
                                {t('settings.sound.select')}
                            </Button>
                            <Typography variant="body2" color="text.secondary">
                                {/* 当前铃声: {{sound}} */}
                                {t('settings.sound.current', { sound: appSettings?.sound || t('settings.sound.default') })}
                            </Typography>
                        </Stack>
                    </Stack>
                </Paper>

                {/* 加密设置卡片 */}
                <Paper elevation={2} sx={{ p: 3 }}>
                    <Stack spacing={3}>
                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <SecurityIcon fontSize="small" />
                            {/* 加密设置 */}
                            {t('settings.encryption.title')}
                        </Typography>
                        <Stack direction="column" gap={2} >
                            <FormControlLabel
                                control={
                                    <Switch
                                        disabled={devices.length === 0}
                                        checked={appSettings?.enableEncryption || false}
                                        onChange={(e) => handleEncryptionToggle(e.target.checked)}
                                    />
                                }
                                label={t('settings.encryption.enable')}
                                sx={{ userSelect: 'none' }}
                            />
                            {/* 根据算法的对应长度检测 key 是否有效 */}
                            {appSettings?.enableEncryption && (() => {
                                const algorithm = appSettings?.encryptionConfig?.algorithm;
                                const key = appSettings?.encryptionConfig?.key || '';
                                let isValid = false;

                                switch (algorithm) {
                                    case 'AES256':
                                        isValid = /^[A-Za-z0-9]{32}$/.test(key);
                                        break;
                                    case 'AES192':
                                        isValid = /^[A-Za-z0-9]{24}$/.test(key);
                                        break;
                                    case 'AES128':
                                        isValid = /^[A-Za-z0-9]{16}$/.test(key);
                                        break;
                                }

                                return (
                                    <Alert severity={isValid ? "success" : "error"} sx={{ mt: 1 }}>
                                        <Typography variant="body2">
                                            {isValid ?
                                                /* 密钥有效 */
                                                t('settings.encryption.key_valid') :
                                                /* 密钥无效 */
                                                t('settings.encryption.key_invalid')
                                            }
                                        </Typography>
                                    </Alert>
                                );
                            })()}

                            {appSettings?.enableEncryption && (
                                <Button
                                    variant="outlined"
                                    size="small"
                                    fullWidth
                                    onClick={() => setEncryptionDialogOpen(true)}
                                    startIcon={<TuneIcon />}
                                    sx={{ alignSelf: 'flex-start' }}
                                >
                                    {/* 加密选项 */}
                                    {t('settings.encryption.options')}
                                </Button>
                            )}
                        </Stack>
                    </Stack>
                </Paper>

                <Paper elevation={2} sx={{ p: 3 }}>
                    <Stack spacing={3}>
                        <Stack direction="row" alignItems="center" gap={1}>
                            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CloudIcon fontSize="small" />
                                推送附件
                            </Typography>
                            <Chip label="beta" color="warning" variant="outlined" size="small" />
                        </Stack>
                        <Stack direction="column" gap={2}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        disabled={devices.length === 0}
                                        checked={appSettings?.enableFileStorage || false}
                                        onChange={(e) => handleFileStorageToggle(e.target.checked)}
                                    />
                                }
                                label="启用文件存储服务"
                                sx={{ userSelect: 'none' }}
                            />

                            {/* 根据配置检测是否有效 */}
                            {appSettings?.enableFileStorage && (() => {
                                const config = appSettings?.fileStorageConfig;
                                const isValid = config &&
                                    config.endpoint &&
                                    config.region &&
                                    config.bucket &&
                                    config.accessKeyId &&
                                    config.secretAccessKey;

                                return (
                                    <Alert severity={isValid ? "success" : "error"} sx={{ mt: 1 }}>
                                        <Typography variant="body2">
                                            {isValid ? '已配置' : '未配置'}
                                        </Typography>
                                    </Alert>
                                );
                            })()}

                            {appSettings?.enableFileStorage && (
                                <Button
                                    variant="outlined"
                                    size="small"
                                    fullWidth
                                    onClick={() => setFileStorageDialogOpen(true)}
                                    startIcon={<TuneIcon />}
                                    sx={{ alignSelf: 'flex-start' }}
                                >
                                    配置存储服务
                                </Button>
                            )}
                        </Stack>
                    </Stack>
                </Paper>

                {/* 功能设置卡片 */}
                <FeatureSettings
                    devices={devices}
                    onError={setError}
                    onToast={(message) => setToast({ open: true, message })}
                />
                {/* 其他设置卡片 */}
                {/* <OtherSettings */}
                <OtherSettingsCard // 
                    themeMode={themeMode}
                    onThemeChange={onThemeChange}
                    onError={setError}
                    onToast={(message) => setToast({ open: true, message })}
                />

                {/* 备份/还原配置卡片 */}
                <BackupRestoreCard
                    devices={devices}
                    defaultDeviceId={defaultDeviceId}
                    onSettingsChange={onSettingsChange}
                    onAddDevice={onAddDevice}
                    onEditDevice={onEditDevice}
                    onSetDefaultDevice={onSetDefaultDevice}
                    onThemeChange={onThemeChange}
                />
                {/* 了解 Bark 卡片 */}
                <Paper elevation={2} sx={{ p: 3 }}>
                    <Stack spacing={3}>
                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AutoStoriesIcon />
                            {/* 了解 Bark */}
                            {t('about.bark_website.title')}
                        </Typography>

                        <Stack direction="column" alignItems="flex-start" gap={1}>
                            <Stack direction="row" alignItems="center" gap={1.5}>
                                <Tooltip title={t('about.bark_website.description')}>
                                    {/* 查看文档 */}
                                    <Button
                                        variant="outlined"
                                        size='small'
                                        color='success'
                                        onClick={openBarkWebsite}
                                        sx={{
                                            px: 1.2,
                                        }}
                                    >
                                        {t('about.bark_website.documentation')}
                                    </Button>
                                </Tooltip>
                                <Tooltip title={t('about.bark_app.description')}>
                                    {/* 下载 Bark App */}
                                    <Button
                                        variant="outlined"
                                        color='secondary'
                                        size='small'
                                        onClick={openBarkApp}
                                        sx={{
                                            px: 1.2,
                                        }}
                                    >
                                        {t('about.bark_app.title')}
                                    </Button>
                                </Tooltip>
                            </Stack>
                        </Stack>
                    </Stack>
                </Paper>

                <Box>
                    {/* 关于卡片 */}
                    <Paper
                        elevation={2}
                        sx={{
                            p: 3,
                            mb: 6, // 底部外边距
                            zIndex: 2,
                            position: 'relative'
                        }}
                    >
                        <Stack spacing={3}>
                            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <InfoIcon />
                                {/* 关于 */}
                                {t('about.title')}
                            </Typography>

                            <List>
                                <ListItem sx={{ px: 0 }}>
                                    <ListItemText
                                        primary={
                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                <GitHubIcon fontSize="small" />
                                                <Typography variant="body1">
                                                    {/* GitHub */}
                                                    {t('about.github.title')}
                                                </Typography>
                                            </Stack>
                                        }
                                        secondary={<span style={{ paddingLeft: '2.4em', fontSize: '0.75rem' }}>{t('about.github.description')}</span>}
                                        onClick={openGitHub}
                                        sx={{ cursor: 'pointer' }}
                                    />
                                    <Tooltip title={t('about.github.description2')}>
                                        <IconButton edge="end" onClick={openGitHub}>
                                            <OpenInNewIcon />
                                        </IconButton>
                                    </Tooltip>
                                </ListItem>
                                <Divider sx={{ my: 1 }} />
                                <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                                    <Typography variant="body2" color="text.secondary">
                                        测试版
                                    </Typography>
                                </Stack>
                                <ListItem sx={{ px: 0, display: 'none' }}>
                                    <ListItemText
                                        primary={
                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                <StarBorderIcon fontSize="small" />
                                                <Typography variant="body1">
                                                    {/* 商店评分 */}
                                                    {t('about.store_rating.title')}
                                                </Typography>
                                            </Stack>
                                        }
                                        secondary={<span style={{ paddingLeft: '2.4em', fontSize: '0.75rem' }}>{t('about.store_rating.description')}</span>}
                                        onClick={openStoreRating}
                                        sx={{ cursor: 'pointer' }}
                                    />
                                    <IconButton edge="end" onClick={openStoreRating}>
                                        <OpenInNewIcon />
                                    </IconButton>
                                </ListItem>



                            </List>
                        </Stack>
                    </Paper>
                    {/* 版本 */}
                    {version && (
                        <Stack sx={{
                            textAlign: 'center',
                            position: 'sticky',
                            width: '100%',
                            bottom: '8px',
                            zIndex: 1,
                            opacity: 0.5
                        }} gap={.3}>

                            <Stack direction="row" alignItems="center" justifyContent="center" gap={.6}>

                                <Typography variant="caption" color="text.secondary">
                                    <Link
                                        onClick={() => window.open('https://bark-sender.uuphy.com/', '_blank')}
                                        color="inherit"
                                        sx={{ fontSize: '0.8rem', textDecoration: 'none', '&:hover': { color: 'primary.main' } }}
                                    >
                                        {t('about.version')}: v{version}
                                    </Link>
                                </Typography>
                            </Stack>
                            <Stack direction="row" alignItems="center" justifyContent="center" gap={.6} sx={{ flex: 1, color: 'text.secondary' }}>
                                <EmailIcon style={{ fontSize: '0.8rem' }} aria-label='contact' />
                                <Link
                                    href={`mailto:${t('about.contact.email')}`}
                                    underline="hover"
                                    color="inherit"
                                    sx={{ cursor: 'pointer', fontSize: '0.8rem', '&:hover': { color: 'primary.main' } }}
                                >
                                    {t('about.contact.email')}
                                </Link>
                            </Stack>
                        </Stack>
                    )}
                </Box>

            </Box>

            <DeviceDialog
                open={deviceDialogOpen}
                onClose={() => {
                    setDeviceDialogOpen(false);
                    setEditingDevice(undefined);
                }}
                onSubmit={editingDevice ? handleEditDevice : handleAddDevice}
                editDevice={editingDevice}
                title={editingDevice ? t('device.edit') : t('device.add')}
            />

            <EncryptionDialog
                open={encryptionDialogOpen}
                config={appSettings?.encryptionConfig || {
                    algorithm: 'AES256',
                    mode: 'CBC',
                    padding: 'pkcs7',
                    key: ''
                }}
                onClose={() => setEncryptionDialogOpen(false)}
                onSave={handleEncryptionConfigSave}
            />

            <SoundDialog
                open={soundDialogOpen}
                onClose={() => setSoundDialogOpen(false)}
                onSave={handleSoundSave}
                currentSound={appSettings?.sound || ''}
            />

            <FileStorageDialog
                open={fileStorageDialogOpen}
                config={appSettings?.fileStorageConfig || {
                    provider: 'aws',
                    endpoint: '',
                    region: 'us-east-1',
                    bucket: '',
                    accessKeyId: '',
                    secretAccessKey: '',
                    customDomain: '',
                    pathPrefix: ''
                }}
                onClose={handleFileStorageDialogClose}
                onSave={handleFileStorageConfigSave}
            />

            {/* Toast提示 */}
            <Snackbar
                open={toast.open}
                autoHideDuration={3000}
                onClose={() => setToast({ ...toast, open: false })}
                message={toast.message}
            />
        </Box>
    );
} 