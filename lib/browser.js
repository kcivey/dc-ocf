const Browser = require('zombie');

function createBrowser() {
    const browser = new Browser({waitDuration: '30s'});
    // Force 5s pause between main requests
    browser.pipeline.addHandler(function (browser, request) {
        return new Promise(resolve => setTimeout(resolve, 5000));
    });
    return browser;
}

module.exports = {Browser, createBrowser};
