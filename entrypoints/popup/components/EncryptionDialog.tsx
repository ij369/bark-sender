import React, { useState, useEffect, } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Stack,
    IconButton,
    Alert,
    Typography,
    Input,
    InputAdornment,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useTranslation } from 'react-i18next';
import { EncryptionConfig, EncryptionAlgorithm, EncryptionMode, PaddingMode } from '../types';
import { generateKey, generateIV, getKeyLength, generateAsciiString } from '../../shared/push-service';
import { SlideUpTransition } from './DialogTransitions';

interface EncryptionDialogProps {
    open: boolean;
    config: EncryptionConfig;
    onClose: () => void;
    onSave: (config: EncryptionConfig) => void;
}

export default function EncryptionDialog({ open, config, onClose, onSave }: EncryptionDialogProps) {
    const { t } = useTranslation();
    const [algorithm, setAlgorithm] = useState<EncryptionAlgorithm>(config.algorithm);
    const [mode, setMode] = useState<EncryptionMode>(config.mode);
    const [padding, setPadding] = useState<PaddingMode>(config.padding);
    const [key, setKey] = useState(config.key);
    const [iv, setIv] = useState('');
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // 重置状态
    useEffect(() => {
        if (open) {
            setAlgorithm(config.algorithm);
            setMode(config.mode);
            setPadding(config.padding);
            setKey(config.key);
            setIv(generateIV(config.mode));
            setError('');
            setShowPassword(false);
        }
    }, [open, config]);

    // 当模式改变时，重新生成 IV
    useEffect(() => {
        if (open) {
            setIv(generateIV(mode));
        }
    }, [mode, open]);

    useEffect(() => {
        if (open && key) {
            const targetLength = getKeyLength(algorithm);
            if (key.length !== targetLength) {
                if (key.length > targetLength) {
                    // 如果当前 Key 长度大于目标长度，截取
                    setKey(key.substring(0, targetLength));
                } else {
                    // 如果当前 Key 长度小于目标长度，补齐字符
                    const additionalLength = targetLength - key.length;
                    const additionalChars = generateAsciiString(additionalLength);
                    setKey(key + additionalChars);
                }
            }
        }
    }, [algorithm, open, key]);

    // 生成随机密钥
    const handleGenerateKey = () => {
        const newKey = generateKey(algorithm);
        setKey(newKey);
    };

    // 生成随机 IV
    const handleGenerateIV = () => {
        const newIv = generateIV(mode);
        setIv(newIv);
    };

    // 切换密码显示
    const handleClickShowPassword = () => {
        setShowPassword(!showPassword);
    };

    // 保存配置
    const handleSave = () => {
        const newConfig: EncryptionConfig = {
            algorithm,
            mode,
            padding,
            key: key.trim()
        };

        onSave(newConfig);
        onClose();
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            slots={{
                transition: SlideUpTransition,
            }}
            keepMounted
        >
            <DialogTitle>
                {/* 加密设置 */}
                {t('encryption.title')}
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={3}>
                    {error && (
                        <Alert severity="error" onClose={() => setError('')}>
                            {error}
                        </Alert>
                    )}

                    <FormControl size="small" fullWidth>
                        {/* 算法 */}
                        <InputLabel>{t('encryption.algorithm')}</InputLabel>
                        <Select
                            value={algorithm}
                            label={t('encryption.algorithm')}
                            onChange={(e) => setAlgorithm(e.target.value as EncryptionAlgorithm)}
                        >
                            {/* AES-256 */}
                            <MenuItem value="AES256">{t('encryption.algorithms.aes256')}</MenuItem>
                            {/* AES-192 */}
                            <MenuItem value="AES192">{t('encryption.algorithms.aes192')}</MenuItem>
                            {/* AES-128 */}
                            <MenuItem value="AES128">{t('encryption.algorithms.aes128')}</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl size="small" fullWidth>
                        {/* 模式 */}
                        <InputLabel>{t('encryption.mode')}</InputLabel>
                        <Select
                            value={mode}
                            label={t('encryption.mode')}
                            onChange={(e) => setMode(e.target.value as EncryptionMode)}
                        >
                            <MenuItem value="CBC">{t('encryption.modes.cbc')}</MenuItem>
                            <MenuItem value="GCM">{t('encryption.modes.gcm')}</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl size="small" fullWidth disabled={mode === 'GCM'}>
                        {/* 填充 */}
                        <InputLabel>{t('encryption.padding')}</InputLabel>
                        <Select
                            value={padding}
                            label={t('encryption.padding')}
                            onChange={(e) => setPadding(e.target.value as PaddingMode)}
                        >
                            <MenuItem value="pkcs7">{t('encryption.paddings.pkcs7')}</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl variant="standard">
                        {/* Key */}
                        <InputLabel htmlFor="key-value">{t('encryption.key')}</InputLabel>
                        <Input
                            id="key-value"
                            type={showPassword ? 'text' : 'password'}
                            value={key}
                            spellCheck={false}
                            autoComplete="off"
                            onChange={(e) => setKey(e.target.value)}
                            fullWidth
                            multiline
                            rows={2}
                            endAdornment={
                                <InputAdornment position="end">
                                    <IconButton
                                        onClick={handleGenerateKey}
                                        title={t('encryption.generate_key')}
                                        size="small"
                                    >
                                        <RefreshIcon />
                                    </IconButton>
                                </InputAdornment>
                            }
                        />
                    </FormControl>

                    {mode === 'GCM' && (
                        <FormControl variant="standard">
                            {/* IV */}
                            <InputLabel htmlFor="iv-value">{t('encryption.iv')}</InputLabel>
                            <Input
                                id="iv-value"
                                value={iv}
                                spellCheck={false}
                                autoComplete="off"
                                onChange={(e) => setIv(e.target.value)}
                                fullWidth
                                endAdornment={
                                    <InputAdornment position="end">
                                        <IconButton
                                            onClick={handleGenerateIV}
                                            // 生成随机IV
                                            title={t('encryption.generate_iv')}
                                            size="small"
                                        >
                                            <RefreshIcon />
                                        </IconButton>
                                    </InputAdornment>
                                }
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                {/* 仅供随机生成 IV 示例，实际发送为随机值 */}
                                {t('encryption.iv_description')}
                            </Typography>
                        </FormControl>
                    )}
                </Stack>

            </DialogContent>
            <DialogActions>
                {/* 取消 */}
                <Button onClick={onClose}>
                    {t('common.cancel')}
                </Button>
                {/* 保存 */}
                <Button
                    onClick={handleSave}
                    variant="contained"
                >
                    {t('common.save')}
                </Button>
            </DialogActions>
        </Dialog>
    );
} 