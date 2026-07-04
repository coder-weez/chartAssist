chrome.storage.local.get('ca_qa_mode', function (r) {
    document.getElementById('qa_mode').checked = !!r.ca_qa_mode;
});
document.getElementById('qa_mode').addEventListener('change', function () {
    chrome.storage.local.set({ ca_qa_mode: this.checked });
});
