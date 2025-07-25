import React from 'react';
import {
    Box,
    AppBar,
    Toolbar,
    Typography,
    BottomNavigation,
    BottomNavigationAction,
    Paper,
    Stack,
    IconButton,
    Tooltip
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { useTranslation } from 'react-i18next';
import { TabValue } from '../types';
import LanguageSelect from './LanguageSelect';

interface LayoutProps {
    children: React.ReactNode;
    currentTab: TabValue;
    onTabChange: (newTab: TabValue) => void;
    // 加密相关 props
    showEncryptionToggle?: boolean;
    encryptionEnabled?: boolean;
    onEncryptionToggle?: () => void;
}

export default function Layout({
    children,
    currentTab,
    onTabChange,
    showEncryptionToggle = false,
    encryptionEnabled = false,
    onEncryptionToggle
}: LayoutProps) {
    const { t } = useTranslation();
    const getTabIndex = (tab: TabValue): number => {
        const tabs: TabValue[] = ['send', 'history', 'settings'];
        return tabs.indexOf(tab);
    };

    const getTabValue = (index: number): TabValue => {
        const tabs: TabValue[] = ['send', 'history', 'settings'];
        return tabs[index] || 'send';
    };

    return (
        <Box
            sx={{
                width: '100%',
                height: '100vh',
                minWidth: 380,
                minHeight: 600,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}
        >
            {/* 主要内容区域：AppBar + 内容 */}
            <Stack
                sx={{
                    height: '100%',
                    flex: 1,
                    minHeight: 0, // 确保Stack能够正确收缩
                }}
            >
                {/* 顶部AppBar */}
                <AppBar position="static" elevation={2}>
                    <Toolbar variant="dense" sx={{ minHeight: 48 }}>
                        <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontSize: '1.1rem' }}>
                            Bark Sender
                        </Typography>
                        {/* Appbar 的加密切换按钮 */}
                        {showEncryptionToggle && (
                            <Tooltip title={encryptionEnabled ?
                                t('settings.encryption.tooltips.encryption_on') :
                                t('settings.encryption.tooltips.encryption_off')
                            }>
                                <IconButton
                                    style={{ outline: 'none' }}
                                    onClick={onEncryptionToggle}
                                    sx={{
                                        color: 'white',
                                        mr: 1
                                    }}
                                    size="small"
                                >
                                    {encryptionEnabled ? <LockIcon /> : <LockOpenIcon />}
                                </IconButton>
                            </Tooltip>
                        )}
                        <LanguageSelect />
                    </Toolbar>
                </AppBar>

                {/* 主内容区域 */}
                <Box
                    sx={{
                        flex: '1 1 0%',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0 // 确保内容区域能够正确收缩
                    }}
                >
                    {children}
                </Box>
            </Stack>

            {/* 底部导航 - 独立放置在外部 */}
            <Paper sx={{
                elevation: 3,
                width: '100%',
                borderRadius: 0, // 覆盖主题的 borderRadius 
                flexShrink: 0 // 防止 footer 被压缩
            }}>
                <BottomNavigation
                    value={getTabIndex(currentTab)}
                    onChange={(event, newValue) => {
                        onTabChange(getTabValue(newValue));
                    }}
                    showLabels
                    sx={{ width: '100%' }}
                >
                    <BottomNavigationAction
                        style={{ outline: 'none' }}
                        /* 发送推送 */
                        label={t('nav.send')}
                        icon={<SendIcon />}
                    />
                    <BottomNavigationAction
                        style={{ outline: 'none' }}
                        /* 历史消息 */
                        label={t('nav.history')}
                        icon={<HistoryIcon />}
                    />
                    <BottomNavigationAction
                        style={{ outline: 'none' }}
                        /* 修改配置 */
                        label={t('nav.settings')}
                        icon={<SettingsIcon />}
                    />
                </BottomNavigation>
            </Paper>
        </Box>
    );
} 