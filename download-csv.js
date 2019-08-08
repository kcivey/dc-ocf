#!/usr/bin/env node

const fs = require('fs');
const url = require('url');
const util = require('util');
const request = require('request-promise-native');
const yargs = require('yargs');
const {createBrowser} = require('./lib/browser');
const argv = getArgv();
const electionYear = argv.year;

main().catch(console.error);

async function main() {
    if (argv.committees) {
        await writeCommitteeCsv();
    }
    if (argv.contributions) {
        await writeTransactionCsv('contributions');
    }
    if (argv.expenditures) {
        await writeTransactionCsv('expenditures');
    }
    process.exit();
}

async function writeCommitteeCsv() {
    log('Getting committees');
    const browser = await createBrowser();
    const file = __dirname + '/committees.csv';
    await browser.visit('https://efiling.ocf.dc.gov/Disclosure');
    await browser.select('#FilerTypeId', 'Principal Campaign Committee');
    await browser.select('#ElectionYear', electionYear.toString());
    await browser.click('#btnSubmitSearch');
    const csv = await getCsv(browser);
    fs.writeFileSync(file, csv, {encoding: 'utf-8'});
    log('Finished writing committees');
}

async function writeTransactionCsv(type) {
    log(`Getting ${type}`);
    const browser = await createBrowser();
    const file = __dirname + '/' + type + '.csv';
    await browser.visit('https://efiling.ocf.dc.gov/ContributionExpenditure');
    await browser.select('#FilerTypeId', 'Principal Campaign Committee');
    await browser.click('#' + type);
    browser.assert.text('#recipientCriteria', type === 'contributions' ? 'Recipient' : 'Payor');
    browser.assert.text('#accordionpanel4 a', 'Date');
    await browser.click('#accordionpanel4 a');
    browser.assert.hasClass('#panel4b', 'active');
    try {
        await browser.fill('#FromDate', '01/01/' + (electionYear - 2));
    }
    catch (err) {
        if (err.message === "Cannot read property 'settings' of undefined") {
            return null;
        }
        throw err;
    }
    await browser.click('#btnSubmitSearch');
    browser.assert.text('h3', `Principal Campaign Committee ${initialCap(type)} Search Result`);
    const csv = await getCsv(browser);
    fs.writeFileSync(file, csv, {encoding: 'utf-8'});
    log(`Finished writing ${type}`);
}

async function getCsv(browser) {
    await browser.click('#divExportDropdown');
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

function getArgv() {
    const argv = yargs
        .options({
            year: {
                type: 'number',
                describe: 'election year',
                default: Math.ceil(new Date().getFullYear() / 2) * 2,
            },
            committees: {
                type: 'boolean',
                describe: 'download committees',
            },
            contributions: {
                type: 'boolean',
                describe: 'download contributions',
            },
            expenditures: {
                type: 'boolean',
                describe: 'download expenditures',
            },
            all: {
                type: 'boolean',
                describe: 'download committees, contributions, and expenditures',
            },
            verbose: {
                type: 'boolean',
                describe: 'print something about what\'s going on',
                alias: 'v',
            },
        })
        .strict(true)
        .check(function (argv) {
            if (!(argv.committees || argv.contributions || argv.expenditures || argv.all)) {
                throw new Error('Must specify at least one data set to download');
            }
            return true;
        })
        .argv;
    if (argv.all) {
        argv.committees = argv.contributions = argv.expenditures = true;
    }
    return argv;
}
