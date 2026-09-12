const translations = {
    "en": {
        "state_on_modern": "Bark Sender's extension is currently on. You can turn it off in the Extensions section of Safari Settings.",
        "state_off_modern": "Bark Sender's extension is currently off. You can turn it on in the Extensions section of Safari Settings.",
        "state_unknown_modern": "You can turn on Bark Sender's extension in the Extensions section of Safari Settings.",
        "button_modern": "Enable for Safari",

        "state_on_legacy": "Bark Sender's extension is currently on. You can turn it off in Safari Preferences.",
        "state_off_legacy": "Bark Sender's extension is currently off. You can turn it on in Safari Preferences.",
        "state_unknown_legacy": "You can turn on Bark Sender's extension in Safari Preferences.",
        "button_legacy": "Enable for Safari",

        "app_title": "Bark Sender",
        "app_subtitle": "Push web content to your iPhone"
    },
    "zh_hans": {
        "state_on_modern": "Bark Sender 扩展当前已开启。您可以在 Safari 设置的扩展部分中关闭它。",
        "state_off_modern": "Bark Sender 扩展当前已关闭。您可以在 Safari 设置的扩展部分中开启它。",
        "state_unknown_modern": "您可以在 Safari 设置的扩展部分中开启 Bark Sender 扩展。",
        "button_modern": "打开 Safari 设置…",

        "state_on_legacy": "Bark Sender 扩展当前已开启。您可以在 Safari 偏好设置中关闭它。",
        "state_off_legacy": "Bark Sender 扩展当前已关闭。您可以在 Safari 偏好设置中开启它。",
        "state_unknown_legacy": "您可以在 Safari 扩展偏好设置中开启 Bark Sender 扩展。",
        "button_legacy": "打开 Safari 扩展偏好设置",

        "app_title": "Bark Sender",
        "app_subtitle": "将网页内容推送到您的 iPhone"
    },
    "zh_hant": {
        "state_on_modern": "Bark Sender 擴展目前已開啟。您可以在 Safari 設定的延伸功能部分中關閉它。",
        "state_off_modern": "Bark Sender 擴展目前已關閉。您可以在 Safari 設定的延伸功能部分中開啟它。",
        "state_unknown_modern": "您可以在 Safari 設定的延伸功能部分中開啟 Bark Sender 擴展。",
        "button_modern": "開啟 Safari 設定…",

        "state_on_legacy": "Bark Sender 擴展目前已開啟。您可以在 Safari 偏好設定中關閉它。",
        "state_off_legacy": "Bark Sender 擴展目前已關閉。您可以在 Safari 偏好設定中開啟它。",
        "state_unknown_legacy": "您可以在 Safari 擴展偏好設定中開啟 Bark Sender 擴展。",
        "button_legacy": "開啟 Safari 擴展偏好設定",

        "app_title": "Bark Sender",
        "app_subtitle": "將網頁內容推送到您的 iPhone"
    }
};

function getUserLanguage() {
    const lang = navigator.language || navigator.userLanguage || 'en';

    if (lang.startsWith('zh-CN') || lang.startsWith('zh-Hans')) {
        return 'zh_hans';
    } else if (lang.startsWith('zh-TW') || lang.startsWith('zh-HK') || lang.startsWith('zh-Hant')) {
        return 'zh_hant';
    } else {
        return 'en';
    }
}

function t(key) {
    const currentLang = getUserLanguage();
    return translations[currentLang][key] || translations['en'][key] || key;
}

function show(enabled, useSettingsInsteadOfPreferences) {
    const suffix = useSettingsInsteadOfPreferences ? '_modern' : '_legacy'; // macOS 13+

    document.getElementsByClassName('state-on')[0].innerText = t('state_on' + suffix);
    document.getElementsByClassName('state-off')[0].innerText = t('state_off' + suffix);
    document.getElementsByClassName('state-unknown')[0].innerText = t('state_unknown' + suffix);
    document.getElementsByClassName('open-preferences')[0].innerText = t('button' + suffix);

    const titleElement = document.querySelector('h1');
    const subtitleElement = document.querySelector('.subtitle');
    if (titleElement) titleElement.innerText = t('app_title');
    if (subtitleElement) subtitleElement.innerText = t('app_subtitle');

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);
