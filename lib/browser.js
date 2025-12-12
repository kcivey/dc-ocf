const Browser = require('zombie');

function createBrowser({verbose} = {}) {
    const browser = new Browser({waitDuration: '60s'});
    // Don't use stuff from static.cloudflareinsights.com. It causes errors and isn't necessary.
    Browser.localhost('static.cloudflareinsights.com:443', 8888);

    /*
     * Force 5s pause between main requests. Zombie throws error if no arguments are passed, so they're
     * included even though they're not used.
     */
    browser.pipeline.addHandler(function (browser, request) { // eslint-disable-line no-unused-vars
        const delay = /\/(?:bundles|static)\/|manif.st\.json$/.test(request.url) ? 200 : 3000;
        if (verbose) {
            console.warn(request.url);
        }
        return new Promise(resolve => setTimeout(resolve, delay));
    });
    return browser;
}

module.exports = {Browser, createBrowser};
