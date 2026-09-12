import React, { useState } from 'react';
import {
    Box,
    Typography,
    Stack,
    Paper,
    IconButton,
    Dialog,
    AppBar,
    Toolbar,
    Button
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import { SlideLeftTransition } from './DialogTransitions';
import { useTranslation } from 'react-i18next';
import { ThemeMode } from '../types';
import OtherSettings from './OtherSettings';
import TransformScrollView from './TransformScrollView';


interface OtherSettingsCardProps {
    themeMode: ThemeMode;
    onThemeChange: (mode: ThemeMode) => void;
    onError: (error: string) => void;
    onToast: (message: string) => void;
}

export default function OtherSettingsCard({ themeMode, onThemeChange, onError, onToast }: OtherSettingsCardProps) {
    const { t } = useTranslation();
    const [dialogOpen, setDialogOpen] = useState(false);

    const handleClose = () => {
        setDialogOpen(false);
    };

    return (
        <>
            <Paper sx={{ p: 0 }}>
                <Button onClick={() => setDialogOpen(true)}
                    sx={{ width: '100%', justifyContent: 'space-between' }}>
                    <Stack direction="row" justifyContent="space-between"
                        sx={{ px: 2, py: 1.5, width: '100%' }}>
                        <Typography variant="h6" color="textPrimary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <SettingsIcon />
                            {/* 其他设置 */}
                            {t('settings.title')}
                        </Typography>
                        <NavigateNextIcon />
                    </Stack>
                </Button>
            </Paper>

            <Dialog
                open={dialogOpen}
                slots={{
                    transition: SlideLeftTransition,
                }}
                onClose={handleClose}
                fullScreen
                sx={{ '& .MuiDialog-paper': { borderRadius: 0, border: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
            >
                <AppBar sx={{ position: 'relative' }}>
                    <Toolbar variant="dense">
                        <IconButton
                            edge="start"
                            color="inherit"
                            onClick={handleClose}
                            aria-label="close"
                        >
                            <ArrowBackIosNewIcon />
                        </IconButton>
                        <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
                            {/* 其他设置 */}
                            {t('settings.title')}
                        </Typography>
                    </Toolbar>
                </AppBar>

                <TransformScrollView resetKey={dialogOpen} contentSx={{ p: 3 }}>
                    <Stack spacing={3} sx={{ width: '100%', maxWidth: 600, mx: 'auto' }}>
                        <OtherSettings themeMode={themeMode} onThemeChange={onThemeChange} onError={onError} onToast={onToast} />
                    </Stack>
                </TransformScrollView>
            </Dialog>
        </>
    );
}
