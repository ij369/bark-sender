import React, { useState } from 'react';
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
// import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useTranslation } from 'react-i18next';
import { TabValue } from '../types';
import { useAppContext } from '../contexts/AppContext';
import LanguageSelect from './LanguageSelect';
import SidePanelIcon from './SidePanelIcon';
import { detectPlatform, isChromium, needsTransformScroll } from '../utils/platform';

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
    const { appSettings } = useAppContext();
    const [isWindowMode] = useState(new URLSearchParams(window.location.search).get('mode') === 'window');
    const [isSidepanelMode] = useState(new URLSearchParams(window.location.search).get('mode') === 'sidepanel');
    const [canUseSidepanelUi] = useState(isChromium());

    const showSidepanelButton =
        canUseSidepanelUi && !isSidepanelMode && (appSettings?.showSidepanelButton ?? true);

    const handleOpenSidePanel = () => {
        if (browser.sidePanel) {
            browser.windows.getCurrent((win) => {
                if (win.id !== undefined) {
                    (browser.sidePanel as any).open({ windowId: win.id }).then(() => {
                        window.close();
                    }).catch((error: any) => {
                        console.debug('打开侧边栏失败:', error);
                    });
                }
            });
        }
    };

    // 打开小窗口
    const handleOpenWindow = (event: React.MouseEvent) => {
        browser.windows.getCurrent((win) => { // macOS 窗口全屏模式会显示扩展栏，打开的小窗会自动进入全屏状态会很难看，所以不打开小窗
            const windowState = win.state || 'normal';

            if (windowState === 'fullscreen' || // 如果当前浏览器窗口是全屏状态
                isWindowMode) { // 如果当前本身就是小窗
                return;
            }
            // 获取鼠标点击位置
            const { screenX, } = event;

            // 计算窗口位置，使窗口中心对准鼠标点击位置
            const windowWidth = 380;
            const windowHeight = 660;
            const left = Math.max(0, screenX - windowWidth / 2);

            const platform = detectPlatform();
            browser.windows.create({
                url: browser.runtime.getURL('/popup.html?mode=window'),
                type: 'popup',
                width: windowWidth,
                height: windowHeight,
                left: Math.round(left),
                top: platform === 'unknown' ? 90 : (platform === 'mac' ? 120 : 90), // 如果是 Windows 则为 90，如果是 Mac 则为 120
                focused: true,
            });
            window.close();
        });
    };
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
                minWidth: 360,
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
                {!isSidepanelMode && (
                    <AppBar position="static" elevation={2} sx={{ borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>
                        <Toolbar variant="dense" sx={{ minHeight: 48 }}>
                            <Typography variant="h6" component="div"
                                sx={{ flexGrow: 1, fontSize: '1.1rem', userSelect: 'none' }}
                                onDoubleClick={handleOpenWindow}
                            >
                                Bark Sender
                            </Typography>
                            {showSidepanelButton && (
                                <Tooltip title={t('nav.open_sidepanel')}>
                                    <IconButton
                                        style={{ outline: 'none' }}
                                        onClick={handleOpenSidePanel}
                                        sx={{
                                            color: 'white',
                                            mr: 2
                                        }}
                                        size="small"
                                    >
                                        <SidePanelIcon />
                                    </IconButton>
                                </Tooltip>
                            )}
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
                )}

                {/* 主内容区域 */}
                <Box
                    sx={{
                        flex: '1 1 0%',
                        overflowY: currentTab === 'settings' && needsTransformScroll() ? 'hidden' : 'auto',
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
                flexShrink: 0, // 防止 footer 被压缩
                borderLeft: 'none',
                borderRight: 'none',
                borderBottom: 'none',
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