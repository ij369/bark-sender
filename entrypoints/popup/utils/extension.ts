declare const chrome: typeof browser;

// 打开扩展快捷键设置页面
export function openExtensionShortcuts() {
    // chrome://协议的 URL 必须使用 tabs.create，无法用 window.open
    if (typeof browser !== 'undefined' && browser.runtime) {
        browser.tabs.create({
            url: 'chrome://extensions/shortcuts'
        }).catch(() => {
            // 如果直接打开失败, 尝试打开扩展管理页面
            browser.runtime.openOptionsPage();
        });
    } else if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.tabs.create({
            url: 'chrome://extensions/shortcuts'
        }).catch(() => {
            chrome.runtime.openOptionsPage();
        });
    }
}

// 打开GitHub页面
export function openGitHub() {
    const url = 'https://github.com/ij369/bark-sender';
    window.open(url, '_blank');
}

// 打开Chrome商店评分页面
export function openChromeStoreRating() {
    const url = `https://chrome.google.com/webstore/detail/${browser.runtime.id}`;
    window.open(url, '_blank');
}

// 打开反馈页面
export function openFeedback() {
    const url = 'https://github.com/ij369/bark-sender/issues/new';
    window.open(url, '_blank');
}

export function openTelegramChannel() {
    const url = 'https://t.me/bark_sender';
    window.open(url, '_blank');
}

export function openBarkApp() {
    const url = 'https://apps.apple.com/app/bark-custom-notifications/id1403753865';
    window.open(url, '_blank');
}

export function openBarkWebsite() {
    const url = 'https://bark.day.app';
    window.open(url, '_blank');
}