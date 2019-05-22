#!/usr/bin/env node

const fs = require('fs');
const url = require('url');
const util = require('util');
const request = require('request-promise-native');
const argv = require('yargs')
    .options({
        year: {
            type: 'number',
            describe: 'election year',
            default: Math.ceil(new Date().getFullYear() / 2)* 2,
        },
    })
    .strict(true)
    .argv;
const Browser = require('zombie');
const browser = new Browser({waitDuration: '30s'});
const electionYear = argv.year;

// Force 5s pause between requests
browser.pipeline.addHandler(function (browser, request) {
    // Log the response body
    console.log(request.method, request.url);
    return new Promise(resolve => setTimeout(resolve, 5000));
});

writeTransactionCsv('expenditures').catch(err => console.error(err));

function writeCommitteeCsv() {
    const file =__dirname + '/committees.csv';
    return browser.visit('https://efiling.ocf.dc.gov/Disclosure')
        .then(() => browser.select('#FilerTypeId', 'Principal Campaign Committee'))
        .then(() => browser.select('#ElectionYear', electionYear))
        .then(() => browser.click('#btnSubmitSearch'))
        .then(getCsv)
        .then(csv => fs.writeFileSync(file, csv, {encoding: 'utf-8'}))
        .then(() => process.exit());
}

function writeTransactionCsv(type) {
    const file =__dirname + '/' + type + '.csv';
    return browser.visit('https://efiling.ocf.dc.gov/ContributionExpenditure')
        .then(() => browser.select('#FilerTypeId', 'Principal Campaign Committee'))
        .then(() => browser.click('#' + type))
        .then(() => browser.click('#accordionpanel4 a'))
        .then(() => browser.fill('#FromDate', '01/01/' + (electionYear - 2)))
        .catch(function (err) {
            if (err.message === "Cannot read property 'settings' of undefined") {
                return null;
            }
            throw err;
        })
        .then(() => browser.click('#btnSubmitSearch'))
        .then(getCsv)
        .then(csv => fs.writeFileSync(file, csv, {encoding: 'utf-8'}));
}

function getCsv() {
    return browser.click('#divExportDropdown')
        .then(function () {
            const link = browser.query('#exportDropDown > li:last-child > a');
            const csvUrl = url.resolve(browser.location.href, link.getAttribute('href'));
            browser.tabs.closeAll();
            // Annoyingly I had to go through all this using request because if I try just using zombie to
            // click on the link it never comes back if the response is big
            const jar = request.jar();
            for (const cookie of browser.cookies) {
                jar.setCookie(request.cookie(cookie.toString()), csvUrl);
            }
            return request({url: csvUrl, jar});
        })
        .then(function (body) {
            // Convert UTF-16 to UTF-8
            const csv = new util.TextDecoder('utf-16').decode(Buffer.from(body));
            // Fix line endings and delete first line (which is not CSV)
            return csv.replace(/\r\n/g, '\n')
                .replace(/^.+\n/, '');
        });
}
