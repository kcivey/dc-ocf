#!/usr/bin/env node

const fs = require('fs');
const request = require('request-promise-native');
const yargs = require('yargs');
const csvStringify = require('csv-stringify/lib/sync');
const {createBrowser} = require('./lib/browser');
const {hyphenize} = require('./lib/util');
const db = require('./lib/db');
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
    await getCommittees();
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
    const buttons = await browser.querySelectorAll('ul.pagination > li.page-item > button');
    const lastPage = +buttons.item(buttons.length - 2).textContent; // next-to-last button (before "next")
    console.warn(`${lastPage} pages of results`);
    for (let page = 1; page <= lastPage; page++) {
        console.log(`Page ${page}`);
        const rows = await browser.querySelectorAll('table > tbody > tr');
        for (const row of rows) {
            const cells = Array.from(row.querySelectorAll('td'));
            const link = cells[1].querySelector('a');
            const [committeeName, reportName, filingYear, submittedDate] = cells.map(n => n.textContent);
            console.warn(`Getting ${submittedDate} ${reportName} for ${committeeName}`);
            const pdfFile =
                outputDir + '/' +
                hyphenize(
                    [
                        committeeName,
                        filingYear,
                        reportName.replace(' Report', '')
                            .replace(' (General Election Candidates Only)', '')
                            .replace(/(?: 20\d\d)? \(20\d\d\)/, ''),
                        submittedDate.replace(/^(\d\d)\/(\d\d)\/(\d{4})$/, '$3$1$2'),
                    ].join(' ')
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
            await browser.click(link); // go to summary page
            await browser.click('button.report-summary-pdf-div'); // get PDF
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
            await browser.evaluate('window.history.back();');
        }
        console.warn(`Finished page ${page}`);
        if (page < lastPage) {
            console.warn('Clicking next');
            await browser.click('ul.pagination > li.page-item > button[aria-label=Next]');
        }
    }
    console.warn('Last page');
}

async function getCommittees() {
    console.warn('Getting committees');
    const year = Math.ceil(new Date().getFullYear() / 2) * 2; // coming election
    const response = await request({
        url: 'https://fairelections.ocf.dc.gov/app/api/Public/SearchRegistrationDisclosure',
        method: 'POST',
        json: true,
        body: {
            electionYear: year,
            recordsPerPage: 1000,
        },
    });
    const committeeData = response.searchData
        .sort((a, b) => a.registrationDate.localeCompare(b.registrationDate))
        .map(function (c) {
            return [
                c.committeeName,
                c.candidateName.replace(/^(\S+) \S+ (\S+)/, '$1 $2'), // remove middle name (but won't always want to)
                c.electionYear,
                c.registrationStatus,
                c.officeName.replace('Council Chairman', 'Council Chairperson'),
            ];
        });
    for (const c of response.searchData) {
        await db.updateCommitteeExtra(c.committeeName, {party: c.partyAffiliation.replace('-P', 'p')});
    }
    const fileName = `${__dirname}/csv/committees-${year}.extra.csv`;
    fs.writeFileSync(fileName, csvStringify(committeeData, {quoted: true}));
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
