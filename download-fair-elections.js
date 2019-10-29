#!/usr/bin/env node

const fs = require('fs');
const request = require('request-promise-native');
const yargs = require('yargs');
const {createBrowser} = require('./lib/browser');
const {hyphenize} = require('./lib/util');
const argv = getArgv();
const browser = createBrowser();
const startUrl = 'https://fairelections.ocf.dc.gov/public/FinancialReport';
const outputDir = __dirname + '/fair-elections';

main()
    .then(() => console.warn('Finished'))
    .catch(function (err) {
        console.trace(err);
        process.exit(1);
    });

async function main() {
    console.warn(`Getting ${startUrl}`);
    browser.silent = true;
    await browser.visit(startUrl);
    await browser.select('#pageSizeOptions', '100');
    if (argv.year) {
        await browser.select('#reportYear', argv.year.toString());
    }
    if (argv.report) {
        await browser.select('#reportId', argv.report);
    }
    if (argv.committee) {
        await browser.fill('input[placeholder="Search by Committee Name"]', argv.committee);
    }
    const rows = await browser.querySelectorAll('table > tbody > tr');
    for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td'));
        const link = cells[0].querySelector('a');
        const [committeeName, reportName, /* filingYear */, submittedDate] = cells.map(n => n.textContent);
        console.warn(`Getting ${submittedDate} ${reportName} for ${committeeName}`);
        const pdfFile =
            outputDir + '/' +
            hyphenize(
                committeeName.toLowerCase() + ' ' +
                reportName.replace(' Report', '') + ' ' +
                submittedDate.replace(/^(\d\d)\/(\d\d)\/(\d{4})$/, '$3$1$2')
            ) +
            '.pdf';
        if (!argv.refresh) {
            try {
                fs.accessSync(pdfFile);
                console.warn('File exists');
                continue;
            }
            catch (err) {
                // File doesn't exist, so go on
            }
        }
        await browser.click(link);
        const resource = browser.resources[browser.resources.length - 1];
        // A zombie bug causes the PDF content to be corrupted by conversion to a UTF-8 string,
        // so we have to make the request again with the request module
        const pdfUrl = resource.response.url;
        const jar = request.jar();
        for (const cookie of browser.cookies) {
            jar.setCookie(request.cookie(cookie.toString()), pdfUrl);
        }
        const pdfContent = await request({url: pdfUrl, gzip: true, encoding: null, jar});
        fs.writeFileSync(pdfFile, pdfContent);
        console.warn(`Wrote ${pdfContent.length} bytes to ${pdfFile}`);
    }
}

function getArgv() {
    return yargs
        .options({
            year: {
                type: 'number',
                describe: 'filing year',
            },
            report: {
                type: 'string',
                describe: 'report name',
            },
            committee: {
                type: 'string',
                describe: 'committee to download (search pattern)',
            },
            refresh: {
                type: 'boolean',
                describe: 'download file even if it already exists',
            },
        })
        .strict(true)
        .check(function (argv) {
            if (argv.report && !argv.year) {
                throw new Error('For report you must also specify year');
            }
            return true;
        })
        .argv;
}
