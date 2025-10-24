import React, { useState, useEffect } from 'react';
import {
    Button,
    Stack,
    TextField,
    Typography,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    Alert,
    IconButton,
    Divider,
    Tooltip,
    Skeleton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useSnackbar, SnackbarKey } from "notistack";
import { FileStorageConfig, FileStorageProvider } from '../types';
import { SlideUpTransition } from './DialogTransitions';
import TelegramIcon from '@mui/icons-material/Telegram';
interface FileStorageDialogProps {
    open: boolean;
    config: FileStorageConfig;
    onClose: () => void;
    onSave: (config: FileStorageConfig) => Promise<void>;
}

export default function FileStorageDialog({
    open,
    config,
    onClose,
    onSave
}: FileStorageDialogProps) {
    const { enqueueSnackbar, closeSnackbar } = useSnackbar();
    const [formData, setFormData] = useState<FileStorageConfig>(config);
    const [saving, setSaving] = useState<boolean>(false);
    const [testing, setTesting] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [connectionVerified, setConnectionVerified] = useState<boolean>(false);

    useEffect(() => {
        setFormData(config);
        setError('');
        setConnectionVerified(false);
    }, [config, open]);

    const handleProviderChange = (provider: FileStorageProvider) => {
        let defaultEndpoint = '';
        let defaultRegion = '';

        switch (provider) {
            case 'aws':
                defaultEndpoint = 'https://s3.amazonaws.com';
                defaultRegion = 'us-east-1';
                break;
            case 'r2':
                defaultEndpoint = 'https://xxxx.r2.cloudflarestorage.com';
                defaultRegion = 'auto';
                break;
            case 'custom':
                defaultEndpoint = '';
                defaultRegion = '';
                break;
        }

        setFormData({
            ...formData,
            provider,
            endpoint: defaultEndpoint,
            region: defaultRegion
        });
    };

    const handleInputChange = (field: keyof FileStorageConfig, value: string) => {
        setFormData({
            ...formData,
            [field]: value
        });
        setError('');
        setConnectionVerified(false); // 配置改变时重置验证状态
    };

    const validateConfig = (): boolean => {
        if (!formData.endpoint.trim()) {
            setError('请填写 Endpoint');
            return false;
        }
        if (!formData.region.trim()) {
            setError('请填写 Region');
            return false;
        }
        if (!formData.bucket.trim()) {
            setError('请填写存储桶名称');
            return false;
        }
        if (!formData.accessKeyId.trim()) {
            setError('请填写 Access Key ID');
            return false;
        }
        if (!formData.secretAccessKey.trim()) {
            setError('请填写 Secret Access Key');
            return false;
        }
        return true;
    };

    // 显示 Snackbar 提示
    const showAlert = (
        severity: "info" | "error" | "success" | "warning",
        message: string
    ) => {
        enqueueSnackbar("", {
            autoHideDuration: 3000,
            anchorOrigin: { vertical: 'top', horizontal: 'right' },
            content: (key: SnackbarKey) => (
                <Alert
                    severity={severity}
                    sx={{ width: "100%" }}
                    action={
                        <IconButton
                            size="small"
                            color="inherit"
                            onClick={() => closeSnackbar(key)}
                        >
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    }
                >
                    {message}
                </Alert>
            ),
        });
    };

    /*
        HeadBucket 不会触发 计费
    */
    const testConnection = async () => {
        if (!validateConfig()) {
            return;
        }

        setTesting(true);
        setError('');

        try {
            // 创建签名和请求头
            const timestamp = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
            const date = timestamp.substr(0, 8);

            // 构建请求 URL
            let url = formData.endpoint;
            if (!url.endsWith('/')) {
                url += '/';
            }
            url += formData.bucket;

            // 创建签名字符串
            const method = 'HEAD';
            const canonicalUri = `/${formData.bucket}`;
            const canonicalQueryString = '';
            const host = new URL(formData.endpoint).host;

            const canonicalHeaders = `host:${host}\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:${timestamp}\n`;
            const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

            const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;

            const algorithm = 'AWS4-HMAC-SHA256';
            const credentialScope = `${date}/${formData.region}/s3/aws4_request`;
            const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${await sha256(canonicalRequest)}`;

            // 计算签名
            const signingKey = await getSignatureKey(formData.secretAccessKey, date, formData.region, 's3');
            const signature = await hmacSha256(signingKey, stringToSign);

            const authorization = `${algorithm} Credential=${formData.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

            const response = await fetch(url, {
                method: 'HEAD',
                headers: {
                    'Authorization': authorization,
                    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
                    'x-amz-date': timestamp,
                    'Host': host
                }
            });

            if (response.ok || response.status === 200) {
                setConnectionVerified(true);
                showAlert('success', '连接成功！存储桶可访问，请点击保存按钮保存配置。');
            } else if (response.status === 403) {
                showAlert('error', '权限不足：请检查访问密钥权限或存储桶策略。');
            } else if (response.status === 404) {
                showAlert('error', '存储桶不存在：请检查存储桶名称和区域设置。');
            } else {
                showAlert('error', `连接失败：HTTP ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            showAlert('error', `连接错误：${error instanceof Error ? error.message : '未知错误'}`);
        } finally {
            setTesting(false);
        }
    };

    // SHA256
    const sha256 = async (message: string): Promise<string> => {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    // HMAC-SHA256
    const hmacSha256 = async (key: ArrayBuffer, message: string): Promise<string> => {
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            key,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
        const hashArray = Array.from(new Uint8Array(signature));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    // 获取签名密钥
    const getSignatureKey = async (key: string, dateStamp: string, regionName: string, serviceName: string): Promise<ArrayBuffer> => {
        const kDate = await hmacSha256ArrayBuffer(new TextEncoder().encode('AWS4' + key), dateStamp);
        const kRegion = await hmacSha256ArrayBuffer(kDate, regionName);
        const kService = await hmacSha256ArrayBuffer(kRegion, serviceName);
        const kSigning = await hmacSha256ArrayBuffer(kService, 'aws4_request');
        return kSigning;
    };

    // HMAC-SHA256 返回 ArrayBuffer
    const hmacSha256ArrayBuffer = async (key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> => {
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            key,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
    };

    const handleSave = async () => {
        if (!validateConfig()) {
            return;
        }

        try {
            setSaving(true);
            await onSave(formData);
            console.log('文件存储配置已保存:', JSON.stringify(formData, null, 2));
            setSaving(false);
            onClose();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '保存配置失败';
            setError(errorMessage);
            setSaving(false);
        }
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
                推送附件配置
            </DialogTitle>
            <DialogContent dividers>
                <Stack gap={2}>
                    <Typography variant="caption" color="text.secondary">
                        配置与 S3 兼容的文件存储服务，用于图片等类型的富媒体推送。
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        请注意：这是项进阶功能，你的访问凭证仅会保存在本地，配置内容不会上传到任何服务器。
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        然而，本地数据仍有可能因恶意程序入侵等原因被窃取。建议将凭证配置为最小权限，
                        并应避免在公共、工作或受管控的网络环境中使用本功能。使用“备份配置”功能时，请务必开启加密导出。
                    </Typography>
                    {error && (
                        <Alert severity="error" onClose={() => setError('')}>
                            {error}
                        </Alert>
                    )}

                    <FormControl fullWidth size="small">
                        <InputLabel>存储服务商</InputLabel>
                        <Select
                            value={formData.provider}
                            label="存储服务商"
                            onChange={(e) => handleProviderChange(e.target.value as FileStorageProvider)}
                        >
                            <MenuItem value="aws">AWS S3</MenuItem>
                            <MenuItem value="r2">Cloudflare R2</MenuItem>
                            <MenuItem value="custom">其他 S3 兼容存储</MenuItem>
                        </Select>
                    </FormControl>

                    <TextField
                        label="Endpoint"
                        value={formData.endpoint}
                        onChange={(e) => handleInputChange('endpoint', e.target.value)}
                        fullWidth
                        size="small"
                        placeholder="https://s3.amazonaws.com"
                        required
                    />

                    <TextField
                        label="Region"
                        value={formData.region}
                        onChange={(e) => handleInputChange('region', e.target.value)}
                        fullWidth
                        size="small"
                        placeholder="us-east-1"
                        required
                    />

                    <TextField
                        label="存储桶名称"
                        value={formData.bucket}
                        onChange={(e) => handleInputChange('bucket', e.target.value)}
                        fullWidth
                        size="small"
                        placeholder="my-bucket"
                        required
                    />

                    <TextField
                        label="Access Key ID"
                        value={formData.accessKeyId}
                        onChange={(e) => handleInputChange('accessKeyId', e.target.value)}
                        fullWidth
                        size="small"
                        placeholder="AKIA..."
                        required
                    />

                    <TextField
                        label="Secret Access Key"
                        value={formData.secretAccessKey}
                        onChange={(e) => handleInputChange('secretAccessKey', e.target.value)}
                        fullWidth
                        size="small"
                        type="password"
                        placeholder="xxxxxxx"
                        required
                    />

                    <TextField
                        label="自定义域名（可选）"
                        value={formData.customDomain || ''}
                        onChange={(e) => handleInputChange('customDomain', e.target.value)}
                        fullWidth
                        size="small"
                        placeholder="格式: https://cdn.uuphy.com"
                        helperText="用于 CDN 或自定义访问域名, 注意启用公开访问存储桶以确保可以访问到存储桶。"
                    />

                    <TextField
                        label="路径前缀（可选）"
                        value={formData.pathPrefix || ''}
                        onChange={(e) => handleInputChange('pathPrefix', e.target.value)}
                        fullWidth
                        size="small"
                        placeholder="uploads/"
                        helperText="存储路径前缀，例如 uploads/2025/"
                    />
                    <Divider />
                    <Typography variant="subtitle1" color="text.secondary">目前这是测试版，当前仅测试了 Cloudflare R2 正常可用，其他存储服务商未测试，也未来不确定是否保留， UI 后续可能会有所调整。若有其他服务商可正常使用或者使用异常，欢迎在 GitHub 上提交 issue 或者通过 Telegram 联系我。</Typography>
                    <Tooltip placement='top' title={<Stack direction="column" gap={1}>
                        <Skeleton variant="rectangular" width={220} height={160}></Skeleton>
                        <img width={220} src="https://bs.uuphy.com/2025/1025/MTc2MTMy.JPG" alt="Telegram" style={
                            { borderRadius: '8px' }
                        } /></Stack>}>
                        <Button ><TelegramIcon sx={{ mr: 1 }} />联系</Button>
                    </Tooltip>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>
                    取消
                </Button>

                {connectionVerified ?
                    <Button
                        onClick={handleSave}
                        variant="contained"
                        disabled={saving || !connectionVerified}
                    >
                        {saving ? <CircularProgress size={24} /> : '保存'}
                    </Button> : <Button
                        onClick={testConnection}
                        variant="outlined"
                        disabled={testing || saving}
                        sx={{ mr: 1 }}
                    >
                        {testing ? <CircularProgress size={20} /> : '连接'}
                    </Button>}
            </DialogActions>
        </Dialog>
    );
}
