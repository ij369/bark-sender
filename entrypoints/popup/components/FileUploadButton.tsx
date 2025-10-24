import React, { useState, useRef } from 'react';
import {
    IconButton,
    Tooltip,
    Snackbar,
    Button,
    LinearProgress,
    Box,
    Typography,
    CircularProgress,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import { useAppContext } from '../contexts/AppContext';
import { FileStorageConfig } from '../types';

interface FileUploadButtonProps {
    onUploadSuccess: (fileUrl: string, fileName: string, fileType: string) => void;
    disabled?: boolean;
}

interface UploadResult {
    success: boolean;
    fileUrl?: string;
    fileName?: string;
    fileType?: string;
    error?: string;
}

export default function FileUploadButton({ onUploadSuccess, disabled }: FileUploadButtonProps) {
    const { appSettings } = useAppContext();
    const [uploading, setUploading] = useState<boolean>(false);
    const [uploadProgress, setUploadProgress] = useState<number>(0);
    const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
    const [snackbarMessage, setSnackbarMessage] = useState<string>('');
    const [snackbarType, setSnackbarType] = useState<'success' | 'error' | 'progress'>('progress');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const xhrRef = useRef<XMLHttpRequest | null>(null);

    // 显示 Snackbar
    const showSnackbar = (type: 'success' | 'error' | 'progress', message: string) => {
        setSnackbarType(type);
        setSnackbarMessage(message);
        setSnackbarOpen(true);
    };

    // 取消上传
    const cancelUpload = () => {
        if (xhrRef.current) {
            xhrRef.current.abort();
            xhrRef.current = null;
        }
        setUploading(false);
        setUploadProgress(0);
        setSnackbarOpen(false);
    };

    // 检查文件存储服务是否可用
    const isFileStorageAvailable = (): boolean => {
        const config = appSettings?.fileStorageConfig;
        return !!(
            appSettings?.enableFileStorage &&
            config &&
            config.endpoint &&
            config.region &&
            config.bucket &&
            config.accessKeyId &&
            config.secretAccessKey
        );
    };

    // 生成文件名
    const generateFileName = (originalName: string): string => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');

        // 获取文件扩展名
        const lastDotIndex = originalName.lastIndexOf('.');
        const extension = lastDotIndex !== -1 ? originalName.substring(lastDotIndex) : '';

        // 生成MD5 （暂使用时间戳和随机数, 后续需要改）
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2);
        const hash = btoa(`${timestamp}-${random}`).replace(/[+/=]/g, '').substring(0, 8);

        return `${year}/${month}${day}/${hash}${extension}`;
    };

    // 使用 XHR 上传文件到S3
    const uploadFileToS3 = (file: File, fileName: string, config: FileStorageConfig): Promise<UploadResult> => {
        return new Promise(async (resolve) => {
            try {
                // 构建上传URL
                let uploadUrl = config.endpoint;
                if (!uploadUrl.endsWith('/')) {
                    uploadUrl += '/';
                }
                uploadUrl += config.bucket + '/' + (config.pathPrefix || '') + fileName;

                // 创建签名
                const timestamp = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
                const date = timestamp.substr(0, 8);

                const method = 'PUT';
                const canonicalUri = `/${config.bucket}/${(config.pathPrefix || '')}${fileName}`;
                const canonicalQueryString = '';
                const host = new URL(config.endpoint).host;

                const canonicalHeaders = `host:${host}\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:${timestamp}\n`;
                const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

                const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;

                const algorithm = 'AWS4-HMAC-SHA256';
                const credentialScope = `${date}/${config.region}/s3/aws4_request`;
                const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${await sha256(canonicalRequest)}`;

                const signingKey = await getSignatureKey(config.secretAccessKey, date, config.region, 's3');
                const signature = await hmacSha256(signingKey, stringToSign);

                const authorization = `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

                const xhr = new XMLHttpRequest();
                xhrRef.current = xhr;

                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const progress = Math.round((e.loaded / e.total) * 100);
                        setUploadProgress(progress);
                        showSnackbar('progress', `上传中... ${progress}%`);
                    }
                });

                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        // 构建访问URL
                        const accessUrl = config.customDomain
                            ? `${config.customDomain}/${(config.pathPrefix || '')}${fileName}`
                            : uploadUrl;

                        resolve({
                            success: true,
                            fileUrl: accessUrl,
                            fileName: file.name,
                            fileType: file.type
                        });
                    } else {
                        resolve({
                            success: false,
                            error: `上传失败：HTTP ${xhr.status} ${xhr.statusText}`
                        });
                    }
                });

                xhr.addEventListener('error', () => {
                    resolve({
                        success: false,
                        error: '网络错误，上传失败'
                    });
                });

                xhr.addEventListener('abort', () => {
                    resolve({
                        success: false,
                        error: '上传已取消'
                    });
                });

                xhr.open('PUT', uploadUrl, true);
                xhr.setRequestHeader('Authorization', authorization);
                xhr.setRequestHeader('x-amz-content-sha256', 'UNSIGNED-PAYLOAD');
                xhr.setRequestHeader('x-amz-date', timestamp);
                xhr.setRequestHeader('Host', host);
                xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
                xhr.send(file);

            } catch (error) {
                resolve({
                    success: false,
                    error: `上传错误：${error instanceof Error ? error.message : '未知错误'}`
                });
            }
        });
    };

    const sha256 = async (message: string): Promise<string> => {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

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

    const getSignatureKey = async (key: string, dateStamp: string, regionName: string, serviceName: string): Promise<ArrayBuffer> => {
        const kDate = await hmacSha256ArrayBuffer(new TextEncoder().encode('AWS4' + key), dateStamp);
        const kRegion = await hmacSha256ArrayBuffer(kDate, regionName);
        const kService = await hmacSha256ArrayBuffer(kRegion, serviceName);
        const kSigning = await hmacSha256ArrayBuffer(kService, 'aws4_request');
        return kSigning;
    };

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

    const handleFileUpload = async (file: File) => {
        if (!isFileStorageAvailable()) {
            showSnackbar('error', '文件存储服务未配置或不可用，请先在设置中配置文件存储服务。');
            return;
        }

        // 检查文件大小（限制为500MB，防止内存爆，后续再调分片）
        const maxSize = 500 * 1024 * 1024; // 500MB
        if (file.size > maxSize) {
            showSnackbar('error', '文件大小不能超过500MB。');
            return;
        }

        setUploading(true);
        setUploadProgress(0);
        showSnackbar('progress', '准备上传...');

        try {
            // 生成文件名
            const fileName = generateFileName(file.name);

            // 上传文件
            const result = await uploadFileToS3(file, fileName, appSettings!.fileStorageConfig!);

            if (result.success && result.fileUrl) {
                showSnackbar('success', '文件上传成功！');
                onUploadSuccess(result.fileUrl, result.fileName!, result.fileType!);
                // 成功后自动关闭 Snackbar
                setTimeout(() => {
                    setSnackbarOpen(false);
                }, 2000);
            } else {
                showSnackbar('error', result.error || '文件上传失败');
            }
        } catch (error) {
            showSnackbar('error', `文件上传失败：${error instanceof Error ? error.message : '未知错误'}`);
        } finally {
            setUploading(false);
            setUploadProgress(0);
            xhrRef.current = null;
        }
    };

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        await handleFileUpload(file);

        // 清空文件输入
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleUploadClick = () => {
        if (!isFileStorageAvailable()) {
            showSnackbar('error', '请先在设置中配置文件存储服务。');
            return;
        }
        fileInputRef.current?.click();
    };

    if (!isFileStorageAvailable()) {
        return null;
    }

    return (
        <>
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileSelect}
                accept="*/*"
            />
            <Tooltip title={uploading ? '上传中...' : '上传文件'}>
                <span>
                    <IconButton
                        onClick={handleUploadClick}
                        disabled={disabled || uploading}
                        size="small"
                        color="primary"
                    >
                        {uploading ? (
                            <CircularProgress size={20} />
                        ) : (
                            <AttachFileIcon />
                        )}
                    </IconButton>
                </span>
            </Tooltip>

            {/* 上传进度 Snackbar */}
            <Snackbar
                open={snackbarOpen}
                onClose={() => {
                    if (snackbarType !== 'progress') {
                        setSnackbarOpen(false);
                    }
                }}
                autoHideDuration={snackbarType === 'error' ? 6000 : null}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                message={
                    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 200 }}>
                        <Typography variant="body2" sx={{ mb: snackbarType === 'progress' ? 1 : 0 }}>
                            {snackbarMessage}
                        </Typography>
                        {snackbarType === 'progress' && (
                            <LinearProgress
                                variant="determinate"
                                value={uploadProgress}
                                sx={{ width: '100%' }}
                            />
                        )}
                    </Box>
                }
                action={
                    <Button
                        color={snackbarType === 'progress' ? 'warning' : 'inherit'}
                        size="small"
                        variant="outlined"
                        onClick={snackbarType === 'progress' ? cancelUpload : () => setSnackbarOpen(false)}
                        startIcon={snackbarType === 'progress' ? <CloseIcon /> : undefined}
                    >
                        {snackbarType === 'progress' ? '取消' : '关闭'}
                    </Button>
                }
            />
        </>
    );
}
