#!/usr/bin/env node

const fs = require('fs');
const util = require('util');
const Browser = require('zombie');
const browser = new Browser({waitDuration: '30s'});
const electionYear = '2018';

// Force 5s pause between requests
browser.pipeline.addHandler(function (browser, request) {
    // Log the response body
    return new Promise(resolve => setTimeout(resolve, 5000));
});

writeContributionCsv();

function writeCommitteeCsv() {
    const file =__dirname + '/committees.csv';
    return browser.visit('https://efiling.ocf.dc.gov/Disclosure')
        .then(() => browser.select('#FilerTypeId', 'Principal Campaign Committee'))
        .then(() => browser.select('#ElectionYear', electionYear))
        .then(() => browser.click('#btnSubmitSearch'))
        .then(getCsv)
        .then(csv => fs.writeFileSync(file, csv, {encoding: 'utf-8'}));
}

function writeContributionCsv() {
    const file =__dirname + '/contributions.csv';
    return browser.visit('https://efiling.ocf.dc.gov/ContributionExpenditure')
        .then(() => browser.select('#FilerTypeId', 'Principal Campaign Committee'))
        .then(() => browser.click('#contributions'))
        .then(() => browser.click('#accordionpanel4 a'))
        .then(() => browser.fill('#FromDate', '01/01/2016'))
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
        .then(() => browser.click('#exportDropDown > li:last-child > a'))
        .then(function () {
            console.log(browser.tabs.length + ' tabs');
            const lastTab = browser.tabs[browser.tabs.length - 1];
            const buf = Buffer.from(lastTab.resources[0].response.body);
            console.log('Got buffer', buf.length);
            lastTab.close();
            return buf;
        })
        .then(function (buf) {
            console.log('processing buffer');
            // Convert UTF-16 to UTF-8
            const csv = new util.TextDecoder('utf-16').decode(buf);
            // Fix line endings and delete first line (which is not CSV)
            return csv.replace(/\r\n/, '\n')
                .replace(/^.+\n/, '');
        });
}
