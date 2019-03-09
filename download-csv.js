#!/usr/bin/env node

const fs = require('fs');
const util = require('util');
const Browser = require('zombie');
const browser = new Browser({waitDuration: '30s'});
const electionYear = '2018';

browser.visit('https://efiling.ocf.dc.gov/Disclosure')
    .then(() => browser.select('#FilerTypeId', 'Principal Campaign Committee'))
    .then(() => browser.select('#ElectionYear', electionYear))
    .then(pause)
    .then(() => browser.click('#btnSubmitSearch'))
    .then(getCsv)
    .then(csv => fs.writeFileSync(__dirname + '/committees.csv', csv, {encoding: 'utf-8'}));

function pause() {
    return new Promise(resolve => setTimeout(resolve, 5000));
}

function getCsv() {
    return browser
        .click('#divExportDropdown')
        .then(pause)
        .then(() => browser.click('#exportDropDown > li:last-child > a'))
        .then(() => Buffer.from(browser.tabs[1].resources[0].response.body))
        .then(function (buf) {
            browser.tabs[1].close();
            return buf;
        })
        // Convert UTF-16 to UTF-8
        .then(buf => new util.TextDecoder('utf-16').decode(buf))
        // Fix line endings and delete first line (which is not CSV)
        .then(csv => csv.replace(/\r\n/, '\n').replace(/^.+\n/, ''));
}
