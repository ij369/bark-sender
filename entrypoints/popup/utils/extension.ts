import { detectBrowser } from './platform';
import i18n from '../i18n';

function getAppStoreUrl(type: 'bark' | 'barkSender') {
    // 修复 App Store 链接问题
    const isZh = i18n.language.startsWith('zh');
    const hasZh = navigator.languages.some(lang =>
        lang.toLowerCase().startsWith('zh')
    );
    const barkASUrl = `https://apps.apple.com${(isZh || hasZh) ? '/cn' : ''}/app/id1403753865`;
    const barkSenderMASUrl = `https://apps.apple.com${(isZh || hasZh) ? '/cn' : ''}/app/id6755458686`;
    switch (type) {
        case 'bark':
            return barkASUrl;
        case 'barkSender':
        default:
            return barkSenderMASUrl;
    }
}
// 打开GitHub页面
export function openGitHub() {
    const url = 'https://github.com/ij369/bark-sender';
    window.open(url, '_blank');
}

// 打开商店页面
export function openStoreRating() {
    const browserType = detectBrowser();
    let url = '';

    switch (browserType) {
        case 'chrome':
            url = `https://chrome.google.com/webstore/detail/${browser.runtime.id}`;
            break;
        case 'firefox':
            url = `https://addons.mozilla.org/firefox/addon/bark-sender/`;
            break;
        case 'edge':
            url = `https://microsoftedge.microsoft.com/addons/detail/bark-sender/${browser.runtime.id}`;
            break;
        case 'safari':
            url = getAppStoreUrl('barkSender');
            break;
        default:
            url = `https://github.com/ij369/bark-sender`;
            break;
    }
    window.open(url, '_blank');
}

// 打开反馈页面
export function openFeedback() {
    const url = 'https://github.com/ij369/bark-sender/issues';
    window.open(url, '_blank');
}

export function openTelegramChannel() {
    const url = 'https://t.me/s/bark_sender';
    window.open(url, '_blank');
}

export function openOfficialWebsite() {
    const url = 'https://bark-sender.uuphy.com';
    window.open(url, '_blank');
}

export function openBarkApp() {
    window.open(getAppStoreUrl('bark'), '_blank');
}

export function openBarkWebsite() {
    const url = 'https://bark.day.app';
    window.open(url, '_blank');
}