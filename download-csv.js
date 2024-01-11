#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const url = require('url');
const util = require('util');
const request = require('request-promise-native');
const yargs = require('yargs');
const {createBrowser} = require('./lib/browser');
const currentElectionYear = Math.ceil(new Date().getFullYear() / 2) * 2;
const argv = getArgv();
const electionYear = argv.year;
const {getCsvFilename} = require('./lib/util');

main()
    .catch(function (err) {
        console.trace(err);
        process.exit(1);
    });

async function main() {
    const endYear = argv['to-present'] ? currentElectionYear : electionYear;
    if (argv.committees) {
        deleteOldFile('committees', 'principal');
        for (let year = electionYear; year <= endYear; year++) {
            await retry(() => writeCommitteeCsv('principal', year));
        }
    }
    if (argv.contributions) {
        deleteOldFile('contributions', 'principal');
        await retry(() => writeTransactionCsv('contributions'));
    }
    if (argv.expenditures) {
        deleteOldFile('expenditures', 'principal');
        await retry(() => writeTransactionCsv('expenditures'));
    }
    if (argv.exploratory) {
        deleteOldFile('committees', 'exploratory');
        for (let year = electionYear; year <= endYear; year++) {
            await retry(() => writeCommitteeCsv('exploratory', year));
        }
        if (argv.contributions) {
            deleteOldFile('contributions', 'exploratory');
            await retry(() => writeTransactionCsv('contributions', 'exploratory'));
        }
        if (argv.expenditures) {
            deleteOldFile('expenditures', 'exploratory');
            await retry(() => writeTransactionCsv('expenditures', 'exploratory'));
        }
    }
    process.exit();
}

function deleteOldFile(recordType, filerType) {
    try {
        fs.unlinkSync(getCsvFilename(recordType, filerType));
    }
    catch (err) {
        // ignore if file doesn't exist
        if (err.code !== 'ENOENT') {
            throw err;
        }
    }
}

async function retry(fn) {
    let tries = 0;
    while (true) {
        try {
            return await fn();
        }
        catch (err) {
            tries++;
            if (tries >= 3) {
                throw err;
            }
        }
    }
}

async function writeCommitteeCsv(filerType = 'principal', year) {
    const filerTypeName = getFilerTypeName(filerType);
    assert(filerTypeName, `Unknown filer type "${filerType}"`);
    log(`Getting ${filerType} committees for ${year}`);
    const file = getCsvFilename('committees', filerType);
    const browser = await createBrowser();
    await browser.visit('https://efiling.ocf.dc.gov/Disclosure');
    await browser.select('#FilerTypeId', filerTypeName);
    try {
        await browser.select('#ElectionYear', year.toString());
    }
    catch (err) {
        if (err.message.match(/No OPTION/)) {
            console.warn(`Year ${year} not found on form`);
            return;
        }
        throw err;
    }
    await browser.click('#btnSubmitSearch');
    let csv = await getCsv(browser);
    const extraFile = file.replace('.csv', `-${year}.extra.csv`);
    let extraCsv = '';
    try {
        extraCsv = fs.readFileSync(extraFile, 'utf8');
    }
    catch (err) {
        // ignore if file doesn't exist
        if (err.code !== 'ENOENT') {
            throw err;
        }
    }
    csv += extraCsv;
    if (fs.existsSync(file)) {
        csv = csv.replace(/^.+\n/, ''); // remove header line if there's already CSV in file
    }
    csv = csv.replace(/\n\s*\n/g, '\n'); // remove blank lines
    if (csv.match(/\S/)) { // skip writing if nothing in CSV
        fs.appendFileSync(file, csv);
    }
    log(`Finished writing ${filerType} committees for ${year}`);
}

async function writeTransactionCsv(transactionType, filerType = 'principal') {
    const filerTypeName = getFilerTypeName(filerType);
    log(`Getting ${filerType} ${transactionType}`);
    const browser = await createBrowser();
    const file = getCsvFilename(transactionType, filerType);
    await browser.visit('https://efiling.ocf.dc.gov/ContributionExpenditure');
    await browser.select('#FilerTypeId', filerTypeName);
    await browser.click('#' + transactionType);
    // For some reason clicking is not checking the radio button, so we need this:
    await browser.evaluate(`document.getElementById('${transactionType}').checked = true`);
    browser.assert.text(
        '#recipientCriteria',
        transactionType === 'contributions' ? 'Recipient' : 'Payor'
    );
    browser.assert.text('#accordionpanel4 a', 'Date');
    await browser.click('#accordionpanel4 a');
    browser.assert.hasClass('#panel4b', 'active');
    try {
        await browser.fill('#FromDate', '01/01/' + (electionYear - 2));
    }
    catch (err) {
        // Ignore JS error that happens here, even in a normal browser
        if (err.message !== "Cannot read property 'settings' of undefined" &&
            err.message !== "Cannot read properties of undefined (reading 'settings')") {
            throw err;
        }
    }
    await browser.click('#btnSubmitSearch');
    browser.assert.text('h3', `${filerTypeName} ${initialCap(transactionType)} Search Result`);
    const csv = await getCsv(browser);
    fs.writeFileSync(file, csv, {encoding: 'utf-8'});
    log(`Finished writing ${transactionType}`);
}

async function getCsv(browser) {
    try {
        await browser.click('#divExportDropdown');
    }
    catch (err) {
        if (err.message.match(/^No target element/)) {
            return '';
        }
        throw err;
    }
    const link = browser.query('#exportDropDown > li:last-child > a');
    const csvUrl = url.resolve(browser.location.href, link.getAttribute('href'));
    await browser.tabs.closeAll();
    // Annoyingly I had to go through all this using request because if I try just using zombie to
    // click on the link it never comes back if the response is big
    const jar = request.jar();
    for (const cookie of browser.cookies) {
        jar.setCookie(request.cookie(cookie.toString()), csvUrl);
    }
    const body = await request({url: csvUrl, jar});
    // Convert UTF-16 to UTF-8
    const csv = new util.TextDecoder('utf-16').decode(Buffer.from(body));
    // Fix line endings and delete first line (which is not CSV)
    return csv.replace(/\r\n/g, '\n')
        .replace(/^.+\n/, '');
}

function log(...args) {
    if (argv.verbose) {
        console.warn(...args);
    }
}

function initialCap(s) {
    return s.substr(0, 1).toUpperCase() + s.substr(1).toLowerCase();
}

function getFilerTypeName(filerType) {
    return {
        principal: 'Principal Campaign Committee',
        exploratory: 'Exploratory Committee',
    }[filerType];
}

function getArgv() {
    const argv = yargs
        .options({
            year: {
                type: 'number',
                describe: 'election year',
                default: currentElectionYear,
            },
            committees: {
                type: 'boolean',
                describe: 'download principal campaign committees',
            },
            contributions: {
                type: 'boolean',
                describe: 'download contributions',
            },
            expenditures: {
                type: 'boolean',
                describe: 'download expenditures',
            },
            exploratory: {
                type: 'boolean',
                description: 'download exploratory committees',
            },
            all: {
                type: 'boolean',
                describe: 'download committees, contributions, and expenditures',
            },
            'to-present': {
                type: 'boolean',
                describe: 'download all data from year to present',
            },
            verbose: {
                type: 'boolean',
                describe: 'print something about what\'s going on',
                alias: 'v',
            },
        })
        .strict(true)
        .check(function (argv) {
            if (!(['committees', 'contributions', 'expenditures', 'exploratory', 'all'].some(n => argv[n]))) {
                throw new Error('Must specify at least one data set to download');
            }
            return true;
        })
        .argv;
    if (argv.all) {
        argv.committees = true;
        argv.contributions = true;
        argv.expenditures = true;
        argv.exploratory = true;
    }
    return argv;
}
