chrome.runtime.onMessage.addListener(function (message) {
    if (message.action === 'openOptions') {
        var url = chrome.runtime.getURL('options.html');
        if (message.page) {
            url += '#section-page' + message.page;
        }
        chrome.tabs.create({ url: url });
    }
});
