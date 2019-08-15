#!/usr/bin/env node

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
        committee_name: 'Committee name',
        candidate_name: 'Candidate name',
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
    };
    process.stdout.write(JSON.stringify(data, null, argv.pretty ? 2 : 0));
}

function formatNumber(value) {
    return typeof value === 'number' ?
        {value: Math.round(value).toLocaleString(), class: 'text-right'} :
        value;
}
