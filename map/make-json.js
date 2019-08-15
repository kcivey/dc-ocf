#!/usr/bin/env node

const moment = require('moment');
const argv = require('yargs')
    .options({
        office: {
            type: 'string',
            describe: 'include only offices that match string',
        },
        pretty: {
            type: 'boolean',
            describe: 'pretty-print the JSON',
        },
    })
    .strict(true)
    .argv;
const db = require('../lib/db');
const filters = {office: argv.office};

main()
    .catch(console.error)
    .finally(() => db.close());

async function main() {
    const codeToHead = {
        candidate_short_name: 'Candidate',
        dc_amount: 'DC amount',
        ind_amount: 'Ind amount',
        dc_ind_amount: 'DC ind amount',
        contributions: 'Contributions',
        amount: 'Amount',
        contributors: 'Contributors',
        dc_ind_contributors: 'DC ind contributors',
        mean: 'Mean',
        median: 'Median',
    };
    const stats = await db.getContributionStats({filters});
    const columnHeads = Object.values(codeToHead);
    const tableData = Object.values(stats)
        .map(function (obj) {
            return Object.keys(obj)
                .filter(k => codeToHead.hasOwnProperty(k))
                .map(k => obj[k])
                .map(formatNumber);
        });
    const data = {
        points: await db.getDcContributionsWithPositions(filters),
        stats: {columnHeads, tableData},
        dateData: await getDateData(),
    };
    process.stdout.write(JSON.stringify(data, null, argv.pretty ? 2 : 0));
}

function formatNumber(value) {
    return typeof value === 'number' ?
        {value: Math.round(value).toLocaleString(), class: 'text-right'} :
        value;
}

async function getDateData() {
    const candidates = await db.getCandidatesForOffice(argv.office);
    const rows = await db.getContributionsByDate(filters);
    const data = {};
    for (const row of rows) {
        if (!data[row.receipt_date]) {
            data[row.receipt_date] = {};
        }
        data[row.receipt_date][row.candidate_short_name] = row.contributors;
    }
    const dateData = {Date: ['Date']};
    const runningTotals = {};
    for (const candidate of candidates) {
        dateData[candidate] = [candidate];
        runningTotals[candidate] = 0;
    }
    const cursorDate = moment(rows[0].receipt_date);
    const endDate = moment(rows[rows.length - 1].receipt_date);
    while (cursorDate <= endDate) {
        const isoDate = cursorDate.format('YYYY-MM-DD');
        dateData['Date'].push(isoDate);
        for (const candidate of candidates) {
            runningTotals[candidate] += +(data[isoDate] && data[isoDate][candidate]) || 0;
            dateData[candidate].push(runningTotals[candidate]);
        }
        cursorDate.add(1, 'day');
    }
    return dateData;
}
