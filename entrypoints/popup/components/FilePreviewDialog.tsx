import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Stack,
    Typography,
    Box,
    CircularProgress,
    Link,
} from '@mui/material';
import { FileIcon, defaultStyles } from 'react-file-icon';
import { SlideUpTransition } from './DialogTransitions';

interface FilePreviewDialogProps {
    open: boolean;
    onClose: () => void;
    onSend: () => void;
    fileUrl: string;
    fileName: string;
    fileType: string;
    sending?: boolean;
}

export default function FilePreviewDialog({
    open,
    onClose,
    onSend,
    fileUrl,
    fileName,
    fileType,
    sending = false
}: FilePreviewDialogProps) {
    const [imageError, setImageError] = useState<boolean>(false);

    // 判断是否为图片类型
    const isImage = fileType.startsWith('image/');

    // 获取文件扩展名
    const getFileExtension = (filename: string): string => {
        const lastDotIndex = filename.lastIndexOf('.');
        return lastDotIndex !== -1 ? filename.substring(lastDotIndex + 1).toLowerCase() : '';
    };

    // 渲染文件预览
    const renderPreview = () => {
        if (isImage && !imageError) {
            return (
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        maxHeight: 400,
                        overflow: 'hidden',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                        backgroundColor: 'grey.50'
                    }}
                >
                    <img
                        src={fileUrl}
                        alt={fileName}
                        style={{
                            maxWidth: '100%',
                            maxHeight: '300px',
                            objectFit: 'contain'
                        }}
                        onError={() => setImageError(true)}
                    />
                </Box>
            );
        }

        // 非图片文件显示文件图标
        const fileExtension = getFileExtension(fileName);
        return (
            <Stack
                direction="column"
                alignItems="center"
                justifyContent="center"
                gap={2}
                sx={{
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    backgroundColor: 'background.paper',
                    p: 2,
                }}
            >
                <Box sx={{ width: 80, height: 80, }} boxShadow={1}>
                    <FileIcon
                        extension={fileExtension}
                        {...defaultStyles[fileExtension as keyof typeof defaultStyles]}
                    />
                </Box>
                <Typography variant="caption" align="center" sx={{ pt: 1, color: 'grey.600' }} gutterBottom>
                    {fileName}
                </Typography>
            </Stack>
        );
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
                文件推送
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">
                        文件已成功上传到云存储：
                    </Typography>

                    {/* 文件预览 */}
                    {renderPreview()}

                    {/* 文件信息 */}
                    <Stack gap={1}>
                        <Typography variant="subtitle2">
                            文件信息
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            <strong>原文件名：</strong>{fileName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            <strong>类型：</strong>{fileType}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            <strong>URL：</strong>
                            <Link
                                href={fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{
                                    ml: 1,
                                    wordBreak: 'break-all',
                                }}
                            >
                                {fileUrl}
                            </Link>
                        </Typography>
                    </Stack>

                    <Typography variant="body2" color="text.secondary">
                        {isImage
                            ? '图片将作为 image 参数发送，在通知中显示该图片。'
                            : '文件链接将作为 url 参数发送，点击通知可访问文件。'
                        }
                    </Typography>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={sending}>
                    取消
                </Button>
                <Button
                    onClick={onSend}
                    variant="contained"
                    disabled={sending}
                    startIcon={sending ? <CircularProgress size={16} /> : undefined}
                >
                    {sending ? '发送中...' : '确认发送'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
