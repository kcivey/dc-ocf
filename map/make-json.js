#!/usr/bin/env node

const moment = require('moment');
const argv = require('yargs')
    .options({
        office: {
            type: 'string',
            describe: 'include only offices that match string',
            required: true,
            requiredArg: true,
        },
        pretty: {
            type: 'boolean',
            describe: 'pretty-print the JSON',
        },
    })
    .strict(true)
    .argv;
const db = require('../lib/db');

main()
    .catch(console.trace)
    .finally(() => db.close());

async function main() {
    const codeToHead = {
        candidate_short_name: 'Candidate',
        contributions: 'Contributions',
        contributors: 'Contributors',
        dc_ind_contributors: 'DC ind contributors',
        ward_ind_contributors: 'Ward ind contributors',
        amount: 'Total amount',
        dc_amount: 'DC amount',
        ward_amount: 'Ward amount',
        ind_amount: 'Ind amount',
        dc_ind_amount: 'DC ind amount',
        ward_ind_amount: 'Ward ind amount',
        mean: 'Mean',
        median: 'Median',
    };
    const office = await db.getMatchingOffice(argv.office);
    const m = office.match(/Ward (\d)/);
    const ward = m ? +m[1] : null;
    if (!ward) {
        for (const key in Object.keys(codeToHead)) {
            if (/^ward_/.test(key)) {
                delete codeToHead[key];
            }
        }
    }
    const columnHeads = Object.values(codeToHead)
        .map(h => h === 'Candidate' ? h : {value: h, class: 'text-right'});
    const filters = {office: argv.office};
    const stats = await db.getContributionStats({filters, ward});
    const tableData = stats
        .map(function (obj) {
            return Object.keys(codeToHead)
                .filter(k => obj.hasOwnProperty(k))
                .map(k => obj[k])
                .map(formatNumber);
        });
    const data = {
        points: await db.getDcContributionsWithPositions(filters),
        stats: {columnHeads, tableData},
        dateData: await getDateData(filters, ward),
    };
    process.stdout.write(JSON.stringify(data, null, argv.pretty ? 2 : 0));
}

function formatNumber(value) {
    return typeof value === 'number' ?
        {value: Math.round(value).toLocaleString(), class: 'text-right'} :
        value;
}

async function getDateData(baseFilters, ward) {
    const candidates = await db.getCandidatesForOffice(argv.office);
    const sets = {
        all: {},
        dc: {state: 'DC'},
    };
    if (ward) {
        sets.ward = {ward};
    }
    const contributors = {};
    let start;
    let end;
    for (const [key, addedFilters] of Object.entries(sets)) {
        contributors[key] = [];
        const filters = {...baseFilters, ...addedFilters};
        const rows = await db.getContributionsByDate(filters);
        const data = {};
        for (const row of rows) {
            if (!data[row.receipt_date]) {
                data[row.receipt_date] = {};
            }
            data[row.receipt_date][row.candidate_short_name] = row.contributors;
        }
        const runningTotals = {};
        let i = 0;
        for (const candidate of candidates) {
            contributors[key][i] = [candidate];
            runningTotals[candidate] = 0;
            i++;
        }
        if (key === 'all') {
            start = rows[0].receipt_date;
            end = rows[rows.length - 1].receipt_date;
        }
        const cursorDate = moment(start);
        const endDate = moment(end);
        while (cursorDate <= endDate) {
            const isoDate = cursorDate.format('YYYY-MM-DD');
            let i = 0;
            for (const candidate of candidates) {
                runningTotals[candidate] += +(data[isoDate] && data[isoDate][candidate]) || 0;
                contributors[key][i].push(runningTotals[candidate]);
                i++;
            }
            cursorDate.add(1, 'day');
        }
    }
    return {start, end, contributors};
}
