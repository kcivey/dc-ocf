const Browser = require('zombie');

function createBrowser() {
    const browser = new Browser({waitDuration: '60s'});

    /*
     * Force 5s pause between main requests. Zombie throws error if no arguments are passed, so they're
     * included even though they're not used.
     */
    browser.pipeline.addHandler(function (browser, request) { // eslint-disable-line no-unused-vars
        return new Promise(resolve => setTimeout(resolve, 5000));
    });
    return browser;
}

module.exports = {Browser, createBrowser};
